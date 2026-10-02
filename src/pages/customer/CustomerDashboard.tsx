import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, MapPin, Store } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCustomerOrders } from '@/hooks/useCustomerOrders';
import { useVendorCards, type VendorCardData } from '@/hooks/useVendorCards';
import VendorCard from '@/components/customer/vendors/VendorCard';
import { AddressPickerDialog } from '@/components/address/AddressPickerDialog';
import { addressHeadline } from '@/lib/address';

const SECTION_SIZE = 4;

const VendorSection = ({
  title,
  description,
  vendors,
  onSelect,
}: {
  title: string;
  description: string;
  vendors: VendorCardData[];
  onSelect: (vendor: VendorCardData) => void;
}) => {
  if (vendors.length === 0) return null;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold sm:text-lg">{title}</h2>
        <p className="text-xs text-muted-foreground sm:text-sm">{description}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-4">
        {vendors.map((v) => <VendorCard key={v.vendor_id} vendor={v} onSelect={onSelect} />)}
      </div>
    </section>
  );
};

const CustomerDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { orders, loading: ordersLoading } = useCustomerOrders();
  const { vendors, defaultAddress, loading: vendorsLoading } = useVendorCards();
  const [pickerOpen, setPickerOpen] = useState(false);

  const activeOrders = orders.filter((o) => !['delivered', 'cancelled', 'rejected'].includes(o.status));
  const totalCarbonSaved = orders.reduce((total, o) => total + (o.carbon_credits_earned || 0), 0);

  // Nearby: closest first. Popular: most orders in the last 30 days.
  // Other vendors: everyone not already shown above.
  const nearby = vendors.slice(0, SECTION_SIZE);
  const popular = [...vendors]
    .filter((v) => v.recent_orders > 0)
    .sort((a, b) => b.recent_orders - a.recent_orders || (b.average_rating ?? 0) - (a.average_rating ?? 0))
    .slice(0, SECTION_SIZE);
  const shown = new Set([...nearby, ...popular].map((v) => v.vendor_id));
  const others = vendors.filter((v) => !shown.has(v.vendor_id));

  const openVendor = (v: VendorCardData) =>
    navigate(`/customer/new-order?vendor=${v.vendor_id}&vendorName=${encodeURIComponent(v.name)}`);

  return (
    <DashboardLayout userRole="CUSTOMER">
      <div className="mx-auto max-w-7xl space-y-4 p-2 sm:p-4 md:space-y-6 md:p-6">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-lg font-bold sm:text-xl md:text-2xl">
              Welcome, {user?.name || user?.email?.split('@')[0] || 'Customer'}
            </h1>
            <p className="text-sm text-muted-foreground sm:text-base">Order from vendors near you</p>
          </div>
          <Button
            className="w-full bg-primary text-sm text-black hover:bg-primary-hover sm:w-auto sm:text-base"
            onClick={() => navigate('/customer/new-order')}
          >
            See all vendors
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-6">
          <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => navigate('/customer/orders')}>
            <CardHeader className="pb-1 sm:pb-2">
              <CardTitle className="text-sm font-medium sm:text-base">Active Orders</CardTitle>
            </CardHeader>
            <CardContent className="pt-1 sm:pt-2">
              <div className="text-2xl font-bold sm:text-3xl">{ordersLoading ? '–' : activeOrders.length}</div>
              <p className="text-xs text-muted-foreground sm:text-sm">In progress</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 sm:pb-2">
              <CardTitle className="text-sm font-medium sm:text-base">Carbon Savings</CardTitle>
            </CardHeader>
            <CardContent className="pt-1 sm:pt-2">
              <div className="text-2xl font-bold sm:text-3xl">{totalCarbonSaved.toFixed(1)} kg</div>
              <p className="text-xs text-muted-foreground sm:text-sm">CO₂ reduced</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => navigate('/customer/orders')}>
            <CardHeader className="pb-1 sm:pb-2">
              <CardTitle className="text-sm font-medium sm:text-base">Total Orders</CardTitle>
            </CardHeader>
            <CardContent className="pt-1 sm:pt-2">
              <div className="text-2xl font-bold sm:text-3xl">{ordersLoading ? '–' : orders.length}</div>
              <p className="text-xs text-muted-foreground sm:text-sm">Orders placed</p>
            </CardContent>
          </Card>
        </div>

        {vendorsLoading ? (
          <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-48 animate-pulse rounded-lg bg-muted" />)}
          </div>
        ) : !defaultAddress ? (
          <Card className="flex flex-col items-center gap-3 p-8 text-center">
            <MapPin className="h-10 w-10 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Add your delivery address</h2>
            <p className="text-sm text-muted-foreground">We'll show vendors within 5 km of where you want your orders delivered.</p>
            <Button onClick={() => setPickerOpen(true)}>Add delivery address</Button>
            <AddressPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} />
          </Card>
        ) : vendors.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 p-8 text-center">
            <Store className="h-10 w-10 text-muted-foreground" />
            <h2 className="text-lg font-semibold">No vendors near {addressHeadline(defaultAddress)} yet</h2>
            <p className="text-sm text-muted-foreground">Try another address from the "Deliver to" bar.</p>
          </Card>
        ) : (
          <>
            <VendorSection
              title="Vendors nearby"
              description={`Closest to ${addressHeadline(defaultAddress)}`}
              vendors={nearby}
              onSelect={openVendor}
            />
            <VendorSection
              title="Popular vendors"
              description="Most ordered from in the last 30 days"
              vendors={popular}
              onSelect={openVendor}
            />
            <VendorSection
              title="Other vendors"
              description="More vendors within 5 km"
              vendors={others}
              onSelect={openVendor}
            />
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => navigate('/customer/new-order')}>
                See all vendors
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default CustomerDashboard;
