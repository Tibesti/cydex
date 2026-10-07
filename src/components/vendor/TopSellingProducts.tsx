import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Plus, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { formatNaira } from '@/lib/pricing';

interface TopProduct {
  key: string;
  name: string;
  units: number;
  sales: number;
}

// The vendor's 5 best sellers by units sold, from paid orders that weren't
// cancelled or rejected.
const TopSellingProducts = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: top = [], isLoading } = useQuery({
    queryKey: ['vendor-top-products', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<TopProduct[]> => {
      const { data, error } = await supabase
        .from('orders')
        .select('order_items(product_id, product_name, quantity, total_price)')
        .eq('vendor_id', user!.id)
        .eq('payment_status', 'paid')
        .not('status', 'in', '(cancelled,rejected)');
      if (error) throw error;

      const totals = new Map<string, TopProduct>();
      for (const order of data ?? []) {
        for (const item of order.order_items ?? []) {
          const key = item.product_id ?? item.product_name;
          const row = totals.get(key) ?? { key, name: item.product_name, units: 0, sales: 0 };
          row.units += Number(item.quantity ?? 0);
          row.sales += Number(item.total_price ?? 0);
          totals.set(key, row);
        }
      }
      return [...totals.values()].sort((a, b) => b.units - a.units || b.sales - a.sales).slice(0, 5);
    },
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center text-sm sm:text-base">
            <TrendingUp className="mr-2 h-4 w-4" />
            Top selling products
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 text-xs sm:flex-none" onClick={() => navigate('/vendor/products')}>
              All products
              <ChevronRight className="ml-1 h-3 w-3" />
            </Button>
            <Button size="sm" className="flex-1 text-xs sm:flex-none" onClick={() => navigate('/vendor/add-product')}>
              <Plus className="mr-1 h-3 w-3" />
              Add product
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded bg-muted" />)}
          </div>
        ) : top.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            No sales yet. Your best sellers will show here once customers start ordering.
          </p>
        ) : (
          <ol className="divide-y">
            {top.map((p, i) => (
              <li key={p.key} className="flex items-center gap-3 p-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 break-words text-sm font-medium">{p.name}</span>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">{p.units} sold</p>
                  <p className="text-xs text-muted-foreground">{formatNaira(p.sales)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
};

export default TopSellingProducts;
