import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Banknote } from 'lucide-react';
import AdminPage from '@/components/admin/AdminPage';
import CustomerTransactionsTab from '@/components/admin/money/CustomerTransactionsTab';
import EarningsTab from '@/components/admin/money/EarningsTab';
import HeldFundsTab from '@/components/admin/money/HeldFundsTab';
import PayoutsTab from '@/components/admin/money/PayoutsTab';
import WalletsTab from '@/components/admin/money/WalletsTab';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';

const TABS = ['earnings', 'payouts', 'wallets', 'held', 'transactions'] as const;

const AdminPayments = () => {
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab') as (typeof TABS)[number]) ? params.get('tab')! : 'earnings';
  const { data: pending = 0 } = useQuery({
    queryKey: ['admin-payouts', 'pending-count'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase.rpc('admin_payouts', { p_status: 'pending', p_limit: 1 });
      return Number(data?.[0]?.total_count ?? 0);
    },
  });

  return (
    <AdminPage title="Money" icon={Banknote} description="What Cydex earns, withdrawals to approve, and every wallet.">
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
          <TabsList>
            <TabsTrigger value="earnings">Earnings</TabsTrigger>
            <TabsTrigger value="payouts">
              Withdrawals {pending > 0 && <Badge className="ml-2 h-5 px-1.5">{pending}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="wallets">Wallets</TabsTrigger>
            <TabsTrigger value="held">Held funds</TabsTrigger>
            <TabsTrigger value="transactions">Customer payments</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="earnings"><EarningsTab /></TabsContent>
        <TabsContent value="payouts"><PayoutsTab /></TabsContent>
        <TabsContent value="wallets"><WalletsTab /></TabsContent>
        <TabsContent value="held"><HeldFundsTab /></TabsContent>
        <TabsContent value="transactions"><CustomerTransactionsTab /></TabsContent>
      </Tabs>
    </AdminPage>
  );
};

export default AdminPayments;
