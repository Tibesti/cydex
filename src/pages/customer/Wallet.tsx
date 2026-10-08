import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Wallet, ArrowUp, ArrowDown, RefreshCw, Search, CreditCard, 
  DollarSign, Filter, Info, AlertCircle, CheckCircle, XCircle, 
  TrendingUp, Loader2, Clock, Copy
} from 'lucide-react';
import { useCustomerWallet } from '@/hooks/useCustomerWallet';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';
import PagedList from '@/components/ui/paged-list';

const CustomerWalletPage = () => {
  const isMobile = useIsMobile();
  const { 
    wallet, 
    transactions, 
    loading, 
    refreshing,
    refreshData 
  } = useCustomerWallet();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [filteredTransactions, setFilteredTransactions] = useState(transactions);

  // Filter transactions based on active tab and search
  React.useEffect(() => {
    let filtered = transactions;

    // Filter by tab
    if (activeTab !== 'all') {
      filtered = filtered.filter(t => t.type === activeTab);
    }

    // Filter by search
    if (searchQuery) {
      filtered = filtered.filter(t => 
        t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.transaction_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.reference_id && t.reference_id.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    setFilteredTransactions(filtered);
  }, [transactions, activeTab, searchQuery]);
  
  const formatAmount = (amount: number) => {
    return amount.toLocaleString('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: isMobile ? 0 : 2,
      maximumFractionDigits: isMobile ? 0 : 2
    });
  };
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-NG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    }).format(date);
  };
  
  const getTransactionIcon = (type: string, status: string) => {
    if (status === 'failed') {
      return <XCircle className="h-4 w-4 sm:h-6 sm:w-6 text-red-500" />;
    }
    
    switch (type) {
      case 'payment':
        return <ArrowDown className="h-4 w-4 sm:h-6 sm:w-6 text-red-500" />;
      case 'refund':
        return <ArrowUp className="h-4 w-4 sm:h-6 sm:w-6 text-green-500" />;
      case 'bonus':
        return <TrendingUp className="h-4 w-4 sm:h-6 sm:w-6 text-blue-500" />;
      case 'reward':
        return <CreditCard className="h-4 w-4 sm:h-6 sm:w-6 text-purple-500" />;
      default:
        return <DollarSign className="h-4 w-4 sm:h-6 sm:w-6 text-muted-foreground" />;
    }
  };

  const getTransactionStatus = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500 text-white text-xs">Completed</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500 text-white text-xs">Pending</Badge>;
      case 'failed':
        return <Badge className="bg-red-500 text-white text-xs">Failed</Badge>;
      case 'cancelled':
        return <Badge className="bg-gray-500 text-white text-xs">Cancelled</Badge>;
      default:
        return <Badge className="bg-muted text-foreground text-xs">{status}</Badge>;
    }
  };

  const getTransactionTypeLabel = (type: string) => {
    switch (type) {
      case 'payment':
        return 'Payment';
      case 'refund':
        return 'Refund';
      case 'bonus':
        return 'Bonus';
      case 'reward':
        return 'Reward';
      case 'adjustment':
        return 'Adjustment';
      default:
        return type;
    }
  };

  if (loading) {
    return (
      <DashboardLayout userRole="CUSTOMER">
        <div className="p-4 sm:p-6 max-w-6xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="CUSTOMER">
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Wallet</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              Manage your funds and transactions
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshData}
            disabled={refreshing}
            className="w-full sm:w-auto"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Balance Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Available Balance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl sm:text-3xl font-bold">
                {formatAmount(wallet?.available_balance || 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Ready to use</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Bonus Balance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl sm:text-3xl font-bold">
                {formatAmount(wallet?.bonus_balance || 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Promotional credits</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Carbon Credits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl sm:text-3xl font-bold">
                {(wallet?.carbon_credits || 0).toFixed(1)} kg
              </div>
              <p className="text-xs text-muted-foreground mt-1">CO₂ saved</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Spent</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl sm:text-3xl font-bold">
                {formatAmount(wallet?.total_spent || 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Lifetime spending</p>
            </CardContent>
          </Card>
        </div>

        {/* Virtual Account - Coming Soon */}
        <Card className="border-2 border-dashed">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              <CardTitle>Virtual Account</CardTitle>
            </div>
            <CardDescription>Receive refunds directly to your account</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center gap-2 text-muted-foreground py-4">
              <Clock className="h-5 w-5" />
              <p className="text-sm">Virtual account feature coming soon</p>
            </div>
            <p className="text-xs text-muted-foreground text-center max-w-md mx-auto">
              When available, you'll receive a unique virtual account number where refunds will be automatically credited.
            </p>
          </CardContent>
        </Card>

        {/* Transactions */}
        <Card>
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
            <CardDescription>View all your wallet transactions</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search transactions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="all" className="text-xs sm:text-sm">All</TabsTrigger>
                <TabsTrigger value="payment" className="text-xs sm:text-sm">Payments</TabsTrigger>
                <TabsTrigger value="refund" className="text-xs sm:text-sm">Refunds</TabsTrigger>
                <TabsTrigger value="bonus" className="text-xs sm:text-sm">Bonuses</TabsTrigger>
                <TabsTrigger value="reward" className="text-xs sm:text-sm">Rewards</TabsTrigger>
              </TabsList>

              <TabsContent value={activeTab} className="mt-4">
                {filteredTransactions.length === 0 ? (
                  <div className="text-center py-8">
                    <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
                    <p className="text-muted-foreground">
                      {searchQuery ? 'No transactions found matching your search' : 'No transactions yet'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <PagedList items={filteredTransactions} getKey={(t) => t.id} resetKey={`${activeTab}|${searchQuery}`} render={(transaction) => (
                      <div
                        className="flex items-center justify-between p-3 sm:p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                          <div className="flex-shrink-0">
                            {getTransactionIcon(transaction.type, transaction.status)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium text-sm sm:text-base">
                                {getTransactionTypeLabel(transaction.type)}
                              </p>
                              {getTransactionStatus(transaction.status)}
                            </div>
                            <p className="text-xs sm:text-sm text-muted-foreground truncate">
                              {transaction.description}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-xs text-muted-foreground">
                                {formatDate(transaction.created_at)}
                              </p>
                              {transaction.transaction_id && (
                                <>
                                  <span className="text-muted-foreground">•</span>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(transaction.transaction_id);
                                      toast.success('Transaction ID copied');
                                    }}
                                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                                  >
                                    <Copy className="h-3 w-3" />
                                    {transaction.transaction_id.slice(0, 8)}...
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p
                              className={`font-semibold text-sm sm:text-base ${
                                transaction.type === 'refund' || transaction.type === 'bonus' || transaction.type === 'reward'
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-red-600 dark:text-red-400'
                              }`}
                            >
                              {transaction.type === 'refund' || transaction.type === 'bonus' || transaction.type === 'reward' ? '+' : '-'}
                              {formatAmount(Math.abs(transaction.amount))}
                            </p>
                          </div>
                        </div>
                      </div>
                    )} />
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default CustomerWalletPage;
