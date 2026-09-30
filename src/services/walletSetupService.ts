import { supabase } from '@/integrations/supabase/client';
import { squadVirtualAccountService } from '@/services/squadVirtualAccountService';

type WalletRole = 'customer' | 'vendor' | 'rider';

interface WalletSetupUser {
  id: string;
  role: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

interface WalletRecord {
  id: string;
  virtual_account_id: string | null;
}

const DEFAULT_BANK = {
  name: 'Guaranty Trust Bank',
  code: '058',
};

const VIRTUAL_ACCOUNT_PREFIX =
  import.meta.env.VITE_SQUAD_VIRTUAL_ACCOUNT_PREFIX || 'CYDEX';

class WalletSetupService {
  private pendingSetups: Map<string, Promise<void>> = new Map();

  /**
   * Ensure that a wallet exists for the user and is linked to a Squad virtual account.
   */
  ensureWalletSetup(user?: WalletSetupUser | null): Promise<void> | undefined {
    if (!user?.id || !user.role) return;

    const role = this.normalizeRole(user.role);
    if (!role) return;

    const key = `${user.id}:${role}`;
    if (this.pendingSetups.has(key)) {
      return this.pendingSetups.get(key);
    }

    const promise = this.runSetup(user, role)
      .catch((error) => {
        console.error('Wallet setup failed:', error);
      })
      .finally(() => {
        this.pendingSetups.delete(key);
      });

    this.pendingSetups.set(key, promise);
    return promise;
  }

  private normalizeRole(role: string): WalletRole | null {
    const normalized = role.toLowerCase();
    if (normalized === 'customer' || normalized === 'vendor' || normalized === 'rider') {
      return normalized;
    }
    return null;
  }

  private async runSetup(user: WalletSetupUser, role: WalletRole) {
    try {
      console.log(`[WalletSetup] Starting setup for ${role} ${user.id}`);
      const walletRecord = await this.ensureWalletRecord(user.id, role);
      console.log(`[WalletSetup] Wallet record ensured: ${walletRecord.id}`);
      await this.ensureVirtualAccount(user, role, walletRecord);
      console.log(`[WalletSetup] Virtual account setup completed for ${role} ${user.id}`);
    } catch (error) {
      console.error(`[WalletSetup] Setup failed for ${role} ${user.id}:`, error);
      throw error;
    }
  }

  // Wallets are created by the database (at signup, or here if missing);
  // users can read their wallet but never write it.
  private async ensureWalletRecord(_userId: string, _role: WalletRole): Promise<WalletRecord> {
    const { data, error } = await supabase.rpc('ensure_my_wallet');
    if (error || !data?.[0]) {
      throw new Error(error?.message || 'Wallet not found');
    }
    return data[0] as WalletRecord;
  }

  private async ensureVirtualAccount(
    user: WalletSetupUser,
    role: WalletRole,
    wallet: WalletRecord
  ) {
    const existingVirtualAccount = await this.fetchExistingVirtualAccount(user.id, role);
    if (existingVirtualAccount) {
      await this.linkWalletToVirtualAccount(role, user.id, wallet.id, existingVirtualAccount.id);
      return;
    }

    try {
      const squadAccount = await this.createSquadVirtualAccount(user, role);
      if (!squadAccount?.data) {
        console.warn('[WalletSetup] Squad virtual account creation returned no data');
        return;
      }

    // Dynamic virtual accounts return: virtual_account_number, account_name, bank_name, bank_code
    // Generate customer_identifier for our records (Squad doesn't return it for dynamic accounts)
    const customerIdentifier = `${VIRTUAL_ACCOUNT_PREFIX}_${role}_${user.id.slice(0, 8)}`.toUpperCase();

    const saveResult = await supabase
      .from('virtual_accounts')
      .insert({
        profile_id: user.id,
        role,
        squad_customer_identifier: squadAccount.data.customer_identifier || customerIdentifier,
        account_number:
          squadAccount.data.virtual_account_number ||
          squadAccount.data.account_number,
        account_name: squadAccount.data.account_name || `${user.name}`,
        bank_name: squadAccount.data.bank_name || DEFAULT_BANK.name,
        bank_code: squadAccount.data.bank_code || DEFAULT_BANK.code,
        metadata: {
          ...squadAccount.data,
          generated_customer_identifier: customerIdentifier,
        },
      })
      .select('id')
      .single();

    if (saveResult.error || !saveResult.data) {
      throw new Error(saveResult.error?.message || 'Failed to store virtual account');
    }

    await this.linkWalletToVirtualAccount(role, user.id, wallet.id, saveResult.data.id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // If virtual account creation fails due to account allocation, log but don't block
      if (errorMessage.includes('account allocation') || errorMessage.includes('allocation')) {
        console.warn(`[WalletSetup] Virtual account not available - requires Squad account allocation. User can still use the platform.`);
        // Don't throw - allow wallet to exist without virtual account
        // Virtual account can be created later when Squad account is set up
        return;
      }
      
      // For other errors, log but don't block wallet creation
      console.error(`[WalletSetup] Failed to create virtual account for ${role} ${user.id}:`, errorMessage);
      // Don't throw - wallet is created, virtual account is optional
    }
  }

  private async fetchExistingVirtualAccount(userId: string, role: WalletRole) {
    const { data, error } = await supabase
      .from('virtual_accounts')
      .select('id, account_number, bank_name, bank_code')
      .eq('profile_id', userId)
      .eq('role', role)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch virtual account: ${error.message}`);
    }

    return data;
  }

  // The database links a new virtual account to its owner's wallet
  // (link_wallet_to_virtual_account trigger), so nothing to do here.
  private async linkWalletToVirtualAccount(
    _role: WalletRole,
    _userId: string,
    _walletId: string,
    _virtualAccountId: string
  ) {
    return;
  }

  private async createSquadVirtualAccount(user: WalletSetupUser, role: WalletRole) {
    if (!user.name || !user.email) {
      throw new Error('User profile is missing name or email required for virtual account');
    }

    const [firstName, ...lastParts] = user.name.split(' ');
    const lastName = lastParts.join(' ') || firstName;

    const customerIdentifier = `${VIRTUAL_ACCOUNT_PREFIX}_${role}_${user.id.slice(0, 8)}`.toUpperCase();

    console.log(`[WalletSetup] Creating Squad virtual account for ${customerIdentifier}`);
    
    try {
      const result = await squadVirtualAccountService.createVirtualAccount({
        customerIdentifier,
        firstName,
        lastName,
        email: user.email,
        phone: user.phone || undefined,
        metadata: {
          role,
          user_id: user.id,
        },
      });
      
      console.log(`[WalletSetup] Squad virtual account created:`, result.data);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[WalletSetup] Squad API error:`, error);
      
      // If it's an allocation error, provide helpful message
      if (errorMessage.includes('No account allocation') || errorMessage.includes('allocation')) {
        console.warn(`[WalletSetup] Dynamic virtual accounts require account allocation from Squad. Contact Squad support to enable this feature.`);
        // Don't throw - allow the system to continue without virtual account
        // User can still use the platform, just won't have a virtual account yet
        throw new Error('Virtual accounts require account setup with Squad. Please contact support or use bank transfers for now.');
      }
      
      // For other errors, throw with original message
      throw new Error(`Failed to create virtual account: ${errorMessage}`);
    }
  }
}

export const walletSetupService = new WalletSetupService();

