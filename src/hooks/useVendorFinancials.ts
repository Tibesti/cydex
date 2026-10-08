import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { toast } from '@/hooks/use-toast';
import { settlementService } from '@/services/settlementService';

export interface VendorTransaction {
  id: string;
  transaction_id: string;
  type: 'sale' | 'payout' | 'refund' | 'adjustment';
  amount: number;
  fee: number;
  net_amount: number;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  description: string;
  reference_id?: string;
  reference_type?: string;
  bank_account_id?: string;
  metadata: Record<string, any>;
  processed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface VendorBankAccount {
  id: string;
  vendor_id: string;
  account_name: string;
  bank_name: string;
  bank_code?: string;
  account_number: string;
  is_default: boolean;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface PayoutRequest {
  id: string;
  vendor_id: string;
  bank_account_id: string;
  amount: number;
  fee: number;
  net_amount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  failure_reason?: string;
  requested_at: string;
  processed_at?: string;
  created_at: string;
  updated_at: string;
}

export const useVendorFinancials = () => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<VendorTransaction[]>([]);
  const [bankAccounts, setBankAccounts] = useState<VendorBankAccount[]>([]);
  const [payoutRequests, setPayoutRequests] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch transactions
  const fetchTransactions = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('vendor_transactions')
        .select('*')
        .eq('vendor_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTransactions((data || []) as VendorTransaction[]);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load transactions"
      });
    }
  };

  // Fetch bank accounts
  const fetchBankAccounts = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('vendor_bank_accounts')
        .select('*')
        .eq('vendor_id', user.id)
        .order('is_default', { ascending: false });

      if (error) throw error;
      setBankAccounts(data || []);
    } catch (error) {
      console.error('Error fetching bank accounts:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load bank accounts"
      });
    }
  };

  // Fetch payout requests
  const fetchPayoutRequests = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('vendor_payout_requests')
        .select('*')
        .eq('vendor_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPayoutRequests((data || []) as PayoutRequest[]);
    } catch (error) {
      console.error('Error fetching payout requests:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load payout requests"
      });
    }
  };

  // Add bank account
  const addBankAccount = async (accountData: Omit<VendorBankAccount, 'id' | 'vendor_id' | 'created_at' | 'updated_at'>) => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('vendor_bank_accounts')
        .insert({
          vendor_id: user.id,
          ...accountData
        })
        .select()
        .single();

      if (error) throw error;
      
      setBankAccounts(prev => [...prev, data]);
      toast({
        title: "Bank account added",
        description: "Your bank account has been added successfully"
      });
      
      return data;
    } catch (error) {
      console.error('Error adding bank account:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to add bank account"
      });
      throw error;
    }
  };

  // Request payout
  const requestPayout = async (amount: number, bankAccountId: string) => {
    if (!user?.id) return;

    try {
      const payout = await settlementService.requestVendorPayout(
        user.id,
          amount,
        bankAccountId
      );

      // Refresh related data to keep UI in sync
      await Promise.all([fetchPayoutRequests(), fetchWalletBalance(), fetchTransactions()]);
      toast({
        title: "Withdrawal submitted",
        description: `₦${amount.toLocaleString()} is sent once Cydex approves it`
      });
      
      return payout;
    } catch (error) {
      console.error('Error requesting payout:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to request payout"
      });
      throw error;
    }
  };

  // Fetch wallet balance from new wallet table
  const [walletBalance, setWalletBalance] = useState({
    available_balance: 0,
    pending_balance: 0,
    total_earned: 0,
    total_withdrawn: 0
  });

  const [virtualAccount, setVirtualAccount] = useState<any>(null);

  const fetchWalletBalance = async () => {
    if (!user?.id) return;
    
    try {
      const walletData = await settlementService.getVendorWalletBalance(user.id);
      
      setWalletBalance({
        available_balance: Number(walletData.available_balance || 0),
        pending_balance: Number(walletData.pending_balance || 0),
        total_earned: Number(walletData.total_earned || 0),
        total_withdrawn: Number(walletData.total_withdrawn || 0)
      });

      // Set virtual account if available
      if (walletData.virtual_account) {
        setVirtualAccount(walletData.virtual_account);
      }
    } catch (error) {
      console.error('Error fetching wallet balance:', error);
    }
  };

  // Calculate balances
  const calculateBalance = () => {
    const completedTransactions = transactions.filter(t => t.status === 'completed');

    const salesThisMonth = completedTransactions
      .filter(t => {
        const transactionDate = new Date(t.created_at);
        const now = new Date();
        return t.type === 'sale' && 
               transactionDate.getMonth() === now.getMonth() && 
               transactionDate.getFullYear() === now.getFullYear();
      })
      .reduce((acc, t) => acc + Number(t.net_amount), 0);

    return {
      totalBalance: walletBalance.available_balance,
      salesThisMonth,
      availableForPayout: walletBalance.available_balance
    };
  };

  // Refresh all data
  const refreshData = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchTransactions(),
      fetchBankAccounts(),
      fetchPayoutRequests(),
      fetchWalletBalance()
    ]);
    setRefreshing(false);
  };

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        fetchTransactions(),
        fetchBankAccounts(),
        fetchPayoutRequests(),
        fetchWalletBalance()
      ]);
      setLoading(false);
    };

    if (user?.id) {
      loadData();
    }
  }, [user?.id]);

  return {
    transactions,
    bankAccounts,
    payoutRequests,
    loading,
    refreshing,
    addBankAccount,
    requestPayout,
    refreshData,
    balances: calculateBalance(),
    virtualAccount,
  };
};