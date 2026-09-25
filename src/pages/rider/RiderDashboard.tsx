
import React from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { useRiderLocation } from '@/hooks/useRiderLocation';
import { useRiderData } from '@/hooks/useRiderData';
import { EarningsOverview } from '@/components/rider/dashboard/EarningsOverview';
import { CurrentDeliveryCard } from '@/components/rider/dashboard/CurrentDeliveryCard';
import { AvailableOrdersList } from '@/components/rider/dashboard/AvailableOrdersList';
import { WeeklyScheduleCard } from '@/components/rider/dashboard/WeeklyScheduleCard';
import { EarningsBreakdownCard } from '@/components/rider/dashboard/EarningsBreakdownCard';

const RiderDashboard = () => {
  const { user } = useAuth();
  const {
    loading,
    availableDeliveries,
    currentDeliveries,
    todaysEarnings,
    acceptDelivery,
    updateDeliveryStatus
  } = useRiderData();
  // Online = live location coming through (no manual toggle)
  const { isOnline } = useRiderLocation();

  if (loading) {
    return (
      <DashboardLayout userRole="RIDER">
        <div className="p-2 sm:p-4 md:p-6 max-w-7xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const deliveriesCompleted = todaysEarnings.length;
  const handleAcceptOrder = async (orderId: string) => {
    await acceptDelivery(orderId);
  };

  return (
    <DashboardLayout userRole="RIDER">
      <div className="p-2 sm:p-4 md:p-6 max-w-7xl mx-auto space-y-3 sm:space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
          <div>
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold">Welcome, {user?.name}</h1>
            <p className="text-sm sm:text-base text-gray-600">
              Manage your deliveries and track your impact
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge className={`text-xs sm:text-sm ${isOnline ? 'bg-green-500' : 'bg-gray-500'}`}>
              {isOnline ? 'Available for Deliveries' : 'Offline'}
            </Badge>
            <span className="text-xs text-muted-foreground">Based on your live location</span>
          </div>
        </div>

        <EarningsOverview 
          todaysEarnings={todaysEarnings}
          deliveriesCompleted={deliveriesCompleted}
        />

        <CurrentDeliveryCard 
          currentDeliveries={currentDeliveries}
          onUpdateStatus={updateDeliveryStatus}
        />

        <AvailableOrdersList 
          availableDeliveries={availableDeliveries}
          onAcceptOrder={handleAcceptOrder}
        />
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <WeeklyScheduleCard />
          <EarningsBreakdownCard todaysEarnings={todaysEarnings} />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default RiderDashboard;
