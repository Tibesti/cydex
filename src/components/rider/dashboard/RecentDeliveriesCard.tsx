import { useNavigate } from 'react-router-dom';
import { ChevronRight, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRiderDeliveryHistory } from '@/hooks/rider/useRiderDeliveryHistory';
import RiderDeliveryList from '@/components/rider/RiderDeliveryList';

// The rider's 5 latest deliveries with their statuses
export const RecentDeliveriesCard = () => {
  const navigate = useNavigate();
  const { items, total, isLoading } = useRiderDeliveryHistory(1, 5);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3 sm:pb-4">
        <div>
          <CardTitle className="text-base sm:text-lg">Recent Deliveries</CardTitle>
          <CardDescription className="text-sm">Your latest orders and their status</CardDescription>
        </div>
        {total > 0 && (
          <Button variant="outline" size="sm" onClick={() => navigate('/rider/deliveries')}>
            See all
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0 pb-2">
        {isLoading ? (
          <div className="space-y-2 px-4 pb-2">
            {[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded bg-muted" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <Package className="mx-auto mb-2 h-10 w-10 opacity-50" />
            <p className="text-sm">No deliveries yet</p>
          </div>
        ) : (
          <RiderDeliveryList items={items} />
        )}
      </CardContent>
    </Card>
  );
};
