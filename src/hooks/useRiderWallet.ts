import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { toast } from 'sonner';
import { settlementService } from '@/services/settlementService';

export interface RiderWalletBalance {
  available_balance: number;
  pending_balance: number;
  total_earned: number;
  total_withdrawn: number;
  carbon_credits?: number;
  virtual_account?: {
    account_number: string;
    account_name: string;
    bank_name: string;
    bank_code: string;
    is_active: boolean;
  } | null;
}

export interface RiderBankAccount {
  id: string;
  rider_id: string;
  account_name: string;
  bank_name: string;
  bank_code?: string;
  account_number: string;
  is_default: boolean;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface RiderPayoutRequest {
  id: string;
  rider_id: string;
  bank_account_id: string;
  amount: number;
  fee: number;
  net_amount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  failure_reason?: string;
  transfer_reference?: string;
  requested_at: string;
  processed_at?: string;
  created_at: string;
  updated_at: string;
}

export const useRiderWallet = () => {
  const { user } = useAuth();
  const [walletBalance, setWalletBalance] = useState<RiderWalletBalance>({
    available_balance: 0,
    pending_balance: 0,
    total_earned: 0,
    total_withdrawn: 0,
    carbon_credits: 0,
    virtual_account: null,
  });
  const [bankAccounts, setBankAccounts] = useState<RiderBankAccount[]>([]);
  const [payoutRequests, setPayoutRequests] = useState<RiderPayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch wallet balance
  const fetchWalletBalance = async () => {
    if (!user?.id) return;
    
    try {
      const balance = await settlementService.getRiderWalletBalance(user.id);
      setWalletBalance(balance as RiderWalletBalance);
    } catch (error) {
      console.error('Error fetching wallet balance:', error);
      toast.error('Failed to load wallet balance');
    }
  };

  // Fetch bank accounts
  const fetchBankAccounts = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('rider_bank_details')
        .select('*')
        .eq('rider_id', user.id)
        .order('is_default', { ascending: false });

      if (error) throw error;
      setBankAccounts(data || []);
    } catch (error) {
      console.error('Error fetching bank accounts:', error);
      toast.error('Failed to load bank accounts');
    }
  };

  // Fetch payout requests
  const fetchPayoutRequests = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('rider_payout_requests')
        .select('*')
        .eq('rider_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPayoutRequests((data || []) as RiderPayoutRequest[]);
    } catch (error) {
      console.error('Error fetching payout requests:', error);
      toast.error('Failed to load payout requests');
    }
  };

  // Add bank account
  const addBankAccount = async (accountData: Omit<RiderBankAccount, 'id' | 'rider_id' | 'created_at' | 'updated_at'>) => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('rider_bank_details')
        .insert({
          rider_id: user.id,
          ...accountData
        })
        .select()
        .single();

      if (error) throw error;
      
      setBankAccounts(prev => [...prev, data]);
      toast.success('Bank account added successfully');
      
      return data;
    } catch (error) {
      console.error('Error adding bank account:', error);
      toast.error('Failed to add bank account');
      throw error;
    }
  };

  // Request payout
  const requestPayout = async (amount: number, bankAccountId: string) => {
    if (!user?.id) return;

    try {
      const payout = await settlementService.requestRiderPayout(
        user.id,
        amount,
        bankAccountId
      );

      // Refresh related data to keep UI in sync
      await Promise.all([fetchPayoutRequests(), fetchWalletBalance()]);
      toast.success(`Withdrawal of ₦${amount.toLocaleString()} submitted. It's sent once Cydex approves it.`);
      
      return payout;
    } catch (error) {
      console.error('Error requesting payout:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to request payout');
      throw error;
    }
  };

  // Refresh all data
  const refreshData = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        fetchWalletBalance(),
        fetchBankAccounts(),
        fetchPayoutRequests()
      ]);
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      if (user?.id) {
        setLoading(true);
        await Promise.all([
          fetchWalletBalance(),
          fetchBankAccounts(),
          fetchPayoutRequests()
        ]);
        setLoading(false);
      }
    };

    loadData();
  }, [user?.id]);

  return {
    walletBalance,
    bankAccounts,
    payoutRequests,
    loading,
    refreshing,
    addBankAccount,
    requestPayout,
    refreshData,
  };
};

