
import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useRiderData } from '@/hooks/useRiderData';
import { useRiderWallet } from '@/hooks/useRiderWallet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  TrendingUp, 
  Wallet, 
  Calendar,
  RefreshCw,
  Download,
  ArrowDown,
  Plus
} from 'lucide-react';
import { toast } from 'sonner';
import { NIGERIAN_BANKS } from '@/utils/nigerianBanks';
import RecentTransactions from '@/components/rider/earnings/RecentTransactions';
import WithdrawalBreakdown from '@/components/wallet/WithdrawalBreakdown';

const EarningsPage = () => {
  const { 
    todaysEarnings, 
    weeklyEarnings, 
    monthlyEarnings, 
    riderProfile, 
    loading,
    refetch
  } = useRiderData();
  
  const {
    walletBalance,
    bankAccounts,
    payoutRequests,
    loading: walletLoading,
    refreshing: walletRefreshing,
    addBankAccount,
    requestPayout,
    refreshData: refreshWalletData
  } = useRiderWallet();
  
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [showAddBankDialog, setShowAddBankDialog] = useState(false);
  const [newBankAccount, setNewBankAccount] = useState({
    account_name: '',
    bank_name: '',
    bank_code: '',
    account_number: '',
    is_default: false,
    is_verified: false
  });

  // Auto-refresh earnings every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetch.todaysEarnings();
      refetch.weeklyEarnings();
      refetch.monthlyEarnings();
    }, 60000);

    return () => clearInterval(interval);
  }, [refetch]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetch.todaysEarnings(),
        refetch.weeklyEarnings(),
        refetch.monthlyEarnings(),
        refreshWalletData()
      ]);
      toast.success('Earnings refreshed');
    } catch (error) {
      toast.error('Failed to refresh earnings');
    } finally {
      setRefreshing(false);
    }
  };

  const handleAddBankAccount = async () => {
    try {
      await addBankAccount(newBankAccount);
      setNewBankAccount({
        account_name: '',
        bank_name: '',
        bank_code: '',
        account_number: '',
        is_default: false,
        is_verified: false
      });
      setShowAddBankDialog(false);
    } catch (error) {
      // Error handled in hook
    }
  };

  const handleRequestWithdrawal = async () => {
    if (!withdrawAmount) {
      toast.error('Please enter an amount');
      return;
    }

    // Find default bank account or use first available
    const defaultAccount = bankAccounts.find(acc => acc.is_default) || bankAccounts[0];
    
    if (!defaultAccount) {
      toast.error('Please add a bank account first');
      setShowWithdrawDialog(false);
      setShowAddBankDialog(true);
      return;
    }
    
    try {
      await requestPayout(parseFloat(withdrawAmount), defaultAccount.id);
      setWithdrawAmount('');
      setShowWithdrawDialog(false);
    } catch (error) {
      // Error handled in hook
    }
  };

  if (loading) {
    return (
      <DashboardLayout userRole="RIDER">
        <div className="p-2 sm:p-4 max-w-7xl mx-auto">
          <div className="animate-pulse space-y-3">
            <div className="h-6 bg-gray-200 rounded w-1/3"></div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-20 bg-gray-200 rounded"></div>
              ))}
            </div>
            <div className="h-40 bg-gray-200 rounded"></div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Calculate totals
  const todaysTotal = todaysEarnings.reduce((sum, earning) => 
    sum + (earning.delivery_fee + earning.tip_amount), 0
  );
  
  const weeklyTotal = weeklyEarnings.reduce((sum, earning) => 
    sum + (earning.delivery_fee + earning.tip_amount), 0
  );
  
  const monthlyTotal = monthlyEarnings.reduce((sum, earning) => 
    sum + (earning.delivery_fee + earning.tip_amount), 0
  );

  const deliveriesCompleted = todaysEarnings.length;
  const weeklyDeliveries = weeklyEarnings.length;
  const monthlyDeliveries = monthlyEarnings.length;

  const formatCurrency = (amount: number) => 
    `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const getEarningsData = () => {
    switch (selectedPeriod) {
      case 'today':
        return { total: todaysTotal, deliveries: deliveriesCompleted };
      case 'week':
        return { total: weeklyTotal, deliveries: weeklyDeliveries };
      case 'month':
        return { total: monthlyTotal, deliveries: monthlyDeliveries };
      default:
        return { total: todaysTotal, deliveries: deliveriesCompleted };
    }
  };

  const currentData = getEarningsData();
  const dailyGoal = 8; // Target deliveries per day
  const progressPercentage = selectedPeriod === 'today' 
    ? Math.min((deliveriesCompleted / dailyGoal) * 100, 100)
    : 100;

  return (
    <DashboardLayout userRole="RIDER">
      <div className="p-2 sm:p-4 max-w-7xl mx-auto space-y-3 sm:space-y-4">
        {/* Compact Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4">
          <div>
            <h1 className="text-lg sm:text-xl font-bold">Earnings</h1>
            <p className="text-xs sm:text-sm text-gray-600">Track your income and performance</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1 h-8"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-1 h-8"
            >
              <Download className="h-3 w-3" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          </div>
        </div>

        {/* Period Selector - Compact */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
          {(['today', 'week', 'month'] as const).map((period) => (
            <button
              key={period}
              onClick={() => setSelectedPeriod(period)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                selectedPeriod === period 
                  ? 'bg-white text-primary shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {period === 'today' ? 'Today' : period === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>

        {/* Compact Overview Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          {/* Available Balance */}
          <Card className="p-3">
            <CardContent className="p-0">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-500 truncate">Available</p>
                  <h3 className="text-sm sm:text-base font-bold truncate">
                    {formatCurrency(walletBalance.available_balance)}
                  </h3>
                </div>
                <div className="flex-shrink-0 p-1.5 bg-primary/10 rounded-full">
                  <Wallet className="h-3 w-3 text-primary" />
                </div>
              </div>
              <Dialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
                <DialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full mt-2 h-7 text-xs"
                    disabled={walletBalance.available_balance <= 0}
                  >
                    Withdraw
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Request Withdrawal</DialogTitle>
                    <DialogDescription>
                      Withdraw your earnings to your bank account. Cydex approves withdrawals before they're sent.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="amount">Amount (₦)</Label>
                      <Input
                        id="amount"
                        type="number"
                        placeholder="Enter amount"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                      />
                      <p className="text-sm text-muted-foreground mt-1">
                        Available: {formatCurrency(walletBalance.available_balance)}
                      </p>
                      <div className="mt-3">
                        <WithdrawalBreakdown amount={withdrawAmount} available={walletBalance.available_balance} />
                      </div>
                      {bankAccounts.length > 0 && (
                        <p className="text-xs text-gray-400 mt-2">
                          Withdrawal will be sent to: {bankAccounts.find(acc => acc.is_default)?.bank_name || bankAccounts[0]?.bank_name} - **** {bankAccounts.find(acc => acc.is_default)?.account_number.slice(-4) || bankAccounts[0]?.account_number.slice(-4)}
                        </p>
                      )}
                      {bankAccounts.length === 0 && (
                        <p className="text-xs text-red-500 mt-2">
                          No bank account added.{' '}
                          <button 
                            onClick={() => {
                              setShowWithdrawDialog(false);
                              setShowAddBankDialog(true);
                            }}
                            className="text-primary underline"
                          >
                            Add one now
                          </button>
                        </p>
                      )}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowWithdrawDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleRequestWithdrawal} disabled={!withdrawAmount || bankAccounts.length === 0}>
                      Request Withdrawal
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          {/* Current Period Earnings */}
          <Card className="p-3">
            <CardContent className="p-0">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-500 truncate">
                    {selectedPeriod === 'today' ? "Today's" : selectedPeriod === 'week' ? "This Week" : "This Month"}
                  </p>
                  <h3 className="text-sm sm:text-base font-bold truncate">
                    {formatCurrency(currentData.total)}
                  </h3>
                </div>
                <div className="flex-shrink-0 p-1.5 bg-green-100 rounded-full">
                  <TrendingUp className="h-3 w-3 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Deliveries */}
          <Card className="p-3">
            <CardContent className="p-0">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-500 truncate">Deliveries</p>
                  <h3 className="text-sm sm:text-base font-bold">
                    {currentData.deliveries}
                  </h3>
                </div>
                <div className="flex-shrink-0 p-1.5 bg-blue-100 rounded-full">
                  <Calendar className="h-3 w-3 text-blue-600" />
                </div>
              </div>
              {selectedPeriod === 'today' && (
                <div className="mt-1">
                  <div className="flex justify-between text-xs mb-0.5">
                    <span>Goal Progress</span>
                    <span>{Math.round(progressPercentage)}%</span>
                  </div>
                  <Progress value={progressPercentage} className="h-1" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Rating */}
          <Card className="p-3">
            <CardContent className="p-0">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-500 truncate">Rating</p>
                  <h3 className="text-sm sm:text-base font-bold">
                    {(riderProfile?.rating || 0).toFixed(1)}
                  </h3>
                </div>
                <div className="flex text-yellow-400">
                  {[1,2,3,4,5].map(star => (
                    <svg key={star} className="h-2 w-2 fill-current" viewBox="0 0 24 24">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  ))}
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {riderProfile?.total_deliveries || 0} total trips
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Performance Stats - Compact */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Earnings Breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Earnings Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">Delivery Fees</span>
                <span className="font-medium">
                  {formatCurrency(currentData.total)}
                </span>
              </div>
              <div className="border-t pt-2 flex justify-between items-center">
                <span className="font-bold text-sm">Total</span>
                <span className="text-base font-bold">{formatCurrency(currentData.total)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Performance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">On-Time Rate</span>
                <span className="font-medium">97%</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">Avg. Delivery Time</span>
                <span className="font-medium">23 mins</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">CO₂ Saved</span>
                <span className="font-medium text-green-600">
                  {(todaysEarnings.reduce((sum, earning) => sum + Number(earning.carbon_credits_earned || 0), 0) / 1000).toFixed(1)} kg
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Wallet Balance Details */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Wallet Balance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">Available Balance</span>
              <span className="font-medium text-green-600">
                {formatCurrency(walletBalance.available_balance)}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">Pending Earnings</span>
              <span className="font-medium text-amber-600">
                {formatCurrency(walletBalance.pending_balance)}
              </span>
            </div>
            <div className="border-t pt-2 flex justify-between items-center">
              <span className="font-bold text-sm">Total Earned</span>
              <span className="text-base font-bold">{formatCurrency(walletBalance.total_earned)}</span>
            </div>
            <div className="pt-2">
              <Dialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
                <DialogTrigger asChild>
                  <Button 
                    className="w-full" 
                    size="sm"
                    disabled={walletBalance.available_balance <= 0}
                  >
                    <ArrowDown className="h-3 w-3 mr-2" />
                    Withdraw Funds
                  </Button>
                </DialogTrigger>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        {/* Recent Transactions: delivery earnings and withdrawals */}
        <RecentTransactions payoutRequests={payoutRequests} />

        {/* Bank Accounts Section */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Bank Accounts</CardTitle>
            <p className="text-xs text-gray-500 mt-1">Manage your bank accounts for withdrawals</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {bankAccounts.length > 0 ? (
                bankAccounts.map((account) => (
                  <div key={account.id} className="p-2 border rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div>
                        <p className="font-medium text-sm">{account.bank_name}</p>
                        <p className="text-xs text-gray-500">**** {account.account_number.slice(-4)}</p>
                      </div>
                    </div>
                    {account.is_default && (
                      <Badge variant="outline" className="border-green-500 text-green-500 text-xs">
                        Default
                      </Badge>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">
                  No bank accounts added yet
                </p>
              )}
              
              <Dialog open={showAddBankDialog} onOpenChange={setShowAddBankDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full border-dashed text-xs">
                    <Plus className="mr-2 h-3 w-3" />
                    Add Bank Account
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Bank Account</DialogTitle>
                    <DialogDescription>
                      Add a new bank account for withdrawals
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="account-name">Account Name</Label>
                      <Input
                        id="account-name"
                        placeholder="Account holder name"
                        value={newBankAccount.account_name}
                        onChange={(e) => setNewBankAccount(prev => ({ ...prev, account_name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="bank-select">Select Bank</Label>
                      <Select
                        value={newBankAccount.bank_code}
                        onValueChange={(code) => {
                          const bank = NIGERIAN_BANKS.find(b => b.code === code);
                          if (bank) {
                            setNewBankAccount(prev => ({
                              ...prev,
                              bank_name: bank.name,
                              bank_code: bank.code
                            }));
                          }
                        }}
                      >
                        <SelectTrigger id="bank-select">
                          <SelectValue placeholder="Select your bank" />
                        </SelectTrigger>
                        <SelectContent>
                          {NIGERIAN_BANKS.map((bank) => (
                            <SelectItem key={bank.code} value={bank.code}>
                              {bank.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500 mt-1">
                        Select your bank from the list. The bank code will be automatically filled.
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="account-number">Account Number</Label>
                      <Input
                        id="account-number"
                        placeholder="Account number"
                        value={newBankAccount.account_number}
                        onChange={(e) => setNewBankAccount(prev => ({ ...prev, account_number: e.target.value }))}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is-default"
                        checked={newBankAccount.is_default}
                        onChange={(e) => setNewBankAccount(prev => ({ ...prev, is_default: e.target.checked }))}
                        className="rounded"
                      />
                      <Label htmlFor="is-default" className="text-sm cursor-pointer">
                        Set as default account
                      </Label>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowAddBankDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleAddBankAccount}>
                      Add Account
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default EarningsPage;
