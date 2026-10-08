import { useState } from 'react';
import { Package } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import SimplePagination from '@/components/ui/simple-pagination';
import { useRiderDeliveryHistory } from '@/hooks/rider/useRiderDeliveryHistory';
import RiderDeliveryList from '@/components/rider/RiderDeliveryList';
import { PAGE_SIZE } from '@/lib/pagination';


// Every order the rider has taken, with its status
const DeliveryHistory = () => {
  const [page, setPage] = useState(1);
  const { items, total, pageCount, isLoading } = useRiderDeliveryHistory(page, PAGE_SIZE);

  return (
    <DashboardLayout userRole="RIDER">
      <div className="mx-auto max-w-3xl space-y-4 p-3 sm:p-4 md:p-6">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">My Deliveries</h1>
          <p className="text-sm text-muted-foreground">
            {total > 0 ? `${total} deliver${total === 1 ? 'y' : 'ies'}` : 'All the orders you take will show here'}
          </p>
        </div>
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded bg-muted" />)}
              </div>
            ) : items.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Package className="mx-auto mb-2 h-10 w-10 opacity-50" />
                <p>No deliveries yet</p>
              </div>
            ) : (
              <RiderDeliveryList items={items} />
            )}
          </CardContent>
        </Card>
        <SimplePagination
          page={page}
          pageCount={pageCount}
          onPageChange={(p) => {
            setPage(p);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      </div>
    </DashboardLayout>
  );
};

export default DeliveryHistory;
