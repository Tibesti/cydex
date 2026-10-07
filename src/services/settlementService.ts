// Settlement Service for Cydex Platform
// Handles fund settlement, escrow management, and payout operations

import { supabase } from '@/integrations/supabase/client';
import { invokeFunction } from '@/lib/edgeFunctions';

interface PaymentHold {
  id: string;
  order_id: string;
  payment_reference: string;
  total_amount: number;
  vendor_amount: number;
  rider_amount: number;
  platform_fee: number;
  status: 'held' | 'partial_release' | 'released' | 'refunded';
}

interface Settlement {
  id: string;
  order_id: string;
  recipient_id: string;
  recipient_type: 'vendor' | 'rider';
  amount: number;
  fee: number;
  net_amount: number;
  status: 'pending' | 'completed' | 'failed';
}

class SettlementService {
  /**
   * Get payment hold for an order
   */
  async getPaymentHold(orderId: string): Promise<PaymentHold | null> {
    const { data, error } = await supabase
      .from('payment_holds')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (error) {
      console.error('Error fetching payment hold:', error);
      return null;
    }

    return data as PaymentHold;
  }

  /**
   * Get settlements for an order
   */
  async getOrderSettlements(orderId: string): Promise<Settlement[]> {
    const { data, error } = await supabase
      .from('settlements')
      .select('*')
      .eq('order_id', orderId);

    if (error) {
      console.error('Error fetching settlements:', error);
      return [];
    }

    return data as Settlement[];
  }

  /**
   * Get user settlements (vendor or rider)
   */
  async getUserSettlements(
    userId: string,
    userType: 'vendor' | 'rider'
  ): Promise<Settlement[]> {
    const { data, error } = await supabase
      .from('settlements')
      .select('*')
      .eq('recipient_id', userId)
      .eq('recipient_type', userType)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching user settlements:', error);
      return [];
    }

    return data as Settlement[];
  }

  /**
   * Get vendor wallet balance with virtual account info
   */
  async getVendorWalletBalance(vendorId: string) {
    // First get wallet
    const { data: wallet, error: walletError } = await supabase
      .from('vendor_wallet')
      .select('*')
      .eq('vendor_id', vendorId)
      .single();

    if (walletError) {
      // Wallet doesn't exist yet, return zero balance
      return {
        available_balance: 0,
        pending_balance: 0,
        total_earned: 0,
        total_withdrawn: 0,
        virtual_account: null,
      };
    }

    // Fetch virtual account separately
    let virtualAccount = null;
    if (wallet.virtual_account_id) {
      const { data: vaData, error: vaError } = await supabase
        .from('virtual_accounts')
        .select('account_number, account_name, bank_name, bank_code, is_active')
        .eq('id', wallet.virtual_account_id)
        .single();
      
      if (!vaError && vaData) {
        virtualAccount = vaData;
      }
    } else {
      // Try to find virtual account by profile_id and role
      const { data: vaData, error: vaError } = await supabase
        .from('virtual_accounts')
        .select('account_number, account_name, bank_name, bank_code, is_active')
        .eq('profile_id', vendorId)
        .eq('role', 'vendor')
        .maybeSingle();
      
      if (!vaError && vaData) {
        virtualAccount = vaData;
      }
    }

    return {
      ...wallet,
      virtual_account: virtualAccount,
    };
  }

  /**
   * Get rider wallet balance with virtual account info
   */
  async getRiderWalletBalance(riderId: string) {
    // First get wallet
    const { data: wallet, error: walletError } = await supabase
      .from('rider_wallet')
      .select('*')
      .eq('rider_id', riderId)
      .single();

    if (walletError) {
      // Wallet doesn't exist yet, return zero balance
      return {
        available_balance: 0,
        pending_balance: 0,
        total_earned: 0,
        total_withdrawn: 0,
        carbon_credits: 0,
        virtual_account: null,
      };
    }

    // Fetch virtual account separately
    let virtualAccount = null;
    if (wallet.virtual_account_id) {
      const { data: vaData, error: vaError } = await supabase
        .from('virtual_accounts')
        .select('account_number, account_name, bank_name, bank_code, is_active')
        .eq('id', wallet.virtual_account_id)
        .single();
      
      if (!vaError && vaData) {
        virtualAccount = vaData;
      }
    } else {
      // Try to find virtual account by profile_id and role
      const { data: vaData, error: vaError } = await supabase
        .from('virtual_accounts')
        .select('account_number, account_name, bank_name, bank_code, is_active')
        .eq('profile_id', riderId)
        .eq('role', 'rider')
        .maybeSingle();
      
      if (!vaError && vaData) {
        virtualAccount = vaData;
      }
    }

    return {
      ...wallet,
      virtual_account: virtualAccount,
    };
  }

  /**
   * Get customer wallet balance with virtual account info
   */
  async getCustomerWalletBalance(customerId: string) {
    // First get wallet
    const { data: wallet, error: walletError } = await supabase
      .from('customer_wallet')
      .select('*')
      .eq('customer_id', customerId)
      .single();

    if (walletError) {
      // Wallet doesn't exist yet, return zero balance
      return {
        available_balance: 0,
        bonus_balance: 0,
        carbon_credits: 0,
        total_spent: 0,
        virtual_account: null,
      };
    }

    // Fetch virtual account separately if wallet has virtual_account_id
    let virtualAccount = null;
    if (wallet.virtual_account_id) {
      const { data: vaData, error: vaError } = await supabase
        .from('virtual_accounts')
        .select('account_number, account_name, bank_name, bank_code, is_active')
        .eq('id', wallet.virtual_account_id)
        .single();
      
      if (!vaError && vaData) {
        virtualAccount = vaData;
      }
    } else {
      // Try to find virtual account by profile_id and role
      const { data: vaData, error: vaError } = await supabase
        .from('virtual_accounts')
        .select('account_number, account_name, bank_name, bank_code, is_active')
        .eq('profile_id', customerId)
        .eq('role', 'customer')
        .maybeSingle();
      
      if (!vaError && vaData) {
        virtualAccount = vaData;
      }
    }

    return {
      ...wallet,
      virtual_account: virtualAccount,
    };
  }

  /**
   * Get pending earnings for rider
   */
  async getRiderPendingEarnings(riderId: string) {
    const { data, error } = await supabase
      .from('rider_earnings')
      .select('total_earnings')
      .eq('rider_id', riderId)
      .in('status', ['pending', 'held']);

    if (error) {
      console.error('Error fetching pending earnings:', error);
      return 0;
    }

    return data.reduce((sum, earning) => sum + Number(earning.total_earnings), 0);
  }

  /**
   * Get pending balance for vendor
   */
  async getVendorPendingBalance(vendorId: string) {
    // Get orders that are paid but not yet delivered
    const { data, error } = await supabase
      .from('orders')
      .select('subtotal')
      .eq('vendor_id', vendorId)
      .eq('payment_status', 'paid')
      .neq('status', 'delivered');

    if (error) {
      console.error('Error fetching pending balance:', error);
      return 0;
    }

    // Calculate vendor's share (90% of subtotal)
    return data.reduce((sum, order) => sum + (Number(order.subtotal) * 0.9), 0);
  }

  /**
   * Withdraw from the signed-in user's wallet to one of their bank accounts.
   * The database checks and deducts the balance; the squad-payout Edge
   * Function sends the transfer and restores the balance if it fails.
   */
  private async requestPayout(amount: number, bankAccountId: string) {
    const { payout } = await invokeFunction<{ payout: unknown }>('squad-payout', {
      action: 'request', amount, bank_account_id: bankAccountId,
    });
    return payout;
  }

  async requestVendorPayout(_vendorId: string, amount: number, bankAccountId: string) {
    return this.requestPayout(amount, bankAccountId);
  }

  async requestRiderPayout(_riderId: string, amount: number, bankAccountId: string) {
    return this.requestPayout(amount, bankAccountId);
  }

  async requestCustomerWithdrawal(_customerId: string, amount: number, bankAccountId: string) {
    return this.requestPayout(amount, bankAccountId);
  }

  /**
   * Ask Squad for a payout's transfer status (a failed transfer is refunded to the wallet)
   */
  async requeryPayoutStatus(payoutRequestId: string, _userType: 'vendor' | 'rider' | 'customer') {
    const { payout } = await invokeFunction<{ payout: unknown }>('squad-payout', {
      action: 'requery', payout_id: payoutRequestId,
    });
    return payout;
  }

  /**
   * Get transaction history for user
   */
  async getTransactionHistory(
    userId: string,
    userType: 'vendor' | 'rider' | 'customer',
    limit = 50
  ) {
    // One typed query per role (a table name held in a string can't be type-checked)
    const fetchHistory = () => {
      switch (userType) {
        case 'vendor':
          return supabase
            .from('vendor_transactions')
            .select('*')
            .eq('vendor_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);
        case 'rider':
          return supabase
            .from('rider_transactions')
            .select('*')
            .eq('rider_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);
        case 'customer':
          return supabase
            .from('customer_transactions')
            .select('*')
            .eq('customer_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);
      }
    };

    const { data, error } = await fetchHistory();

    if (error) {
      console.error('Error fetching transaction history:', error);
      return [];
    }

    return data;
  }

  /**
   * Check if order can be refunded
   * @param orderId - Order ID to check
   * @param bypassTimeCheck - If true, bypasses the 24-hour window check (for vendor rejections)
   */
  async canRefundOrder(orderId: string, bypassTimeCheck: boolean = false): Promise<boolean> {
    const { data: order, error } = await supabase
      .from('orders')
      .select('status, payment_status, created_at')
      .eq('id', orderId)
      .single();

    if (error || !order) return false;

    // Can refund if order is not delivered and payment is confirmed
    if (order.status === 'delivered') return false;
    if (order.payment_status !== 'paid') return false;

    // If bypassing time check (e.g., vendor rejection), allow refund
    if (bypassTimeCheck) return true;

    // Check if order is within refund window (e.g., 24 hours)
    const orderDate = new Date(order.created_at);
    const now = new Date();
    const hoursSinceOrder = (now.getTime() - orderDate.getTime()) / (1000 * 60 * 60);

    return hoursSinceOrder <= 24;
  }

  /**
   * Get settlement statistics
   */
  async getSettlementStats(
    userId: string,
    userType: 'vendor' | 'rider',
    period: 'today' | 'week' | 'month' | 'all' = 'all'
  ) {
    let startDate = new Date();
    
    switch (period) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'all':
        startDate = new Date(0); // Beginning of time
        break;
    }

    const { data, error } = await supabase
      .from('settlements')
      .select('amount, net_amount, status, created_at')
      .eq('recipient_id', userId)
      .eq('recipient_type', userType)
      .gte('created_at', startDate.toISOString());

    if (error) {
      console.error('Error fetching settlement stats:', error);
      return {
        total_settlements: 0,
        total_amount: 0,
        completed_amount: 0,
        pending_amount: 0,
      };
    }

    const stats = data.reduce(
      (acc, settlement) => {
        acc.total_settlements++;
        acc.total_amount += Number(settlement.amount);
        
        if (settlement.status === 'completed') {
          acc.completed_amount += Number(settlement.net_amount);
        } else if (settlement.status === 'pending') {
          acc.pending_amount += Number(settlement.amount);
        }
        
        return acc;
      },
      {
        total_settlements: 0,
        total_amount: 0,
        completed_amount: 0,
        pending_amount: 0,
      }
    );

    return stats;
  }
}

// Export singleton instance
export const settlementService = new SettlementService();

// Export class for testing
export default SettlementService;

