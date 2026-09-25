import React, { useState, useEffect } from 'react';
import { Search, MapPin, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { VendorSelectionCard } from './VendorSelectionCard';
import LoadingDisplay from '@/components/ui/LoadingDisplay';
import { useAddresses } from '@/hooks/useAddresses';
import { addressHeadline } from '@/lib/address';
import { AddressPickerDialog } from '@/components/address/AddressPickerDialog';

interface Vendor {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  productCount: number;
  categories: string[];
  distanceKm: number;
}

interface VendorSelectionPageProps {
  onVendorSelect: (vendorId: string, vendorName: string) => void;
}

export const VendorSelectionPage: React.FC<VendorSelectionPageProps> = ({
  onVendorSelect
}) => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Vendors are listed for the customer's delivery address (the "Deliver to" bar)
  const { defaultAddress, hasLoaded: addressesLoaded } = useAddresses();

  useEffect(() => {
    if (!addressesLoaded) return;
    if (!defaultAddress) {
      setVendors([]);
      setAllCategories([]);
      setLoading(false);
      return;
    }
    fetchVendors(defaultAddress.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressesLoaded, defaultAddress?.id]);

  const fetchVendors = async (addressId: string) => {
    try {
      setLoading(true);

      // Only vendors whose store is within 5 km of the delivery address
      const { data: nearby, error: nearbyError } = await supabase.rpc('vendors_near_address', {
        p_address_id: addressId,
      });
      if (nearbyError) throw nearbyError;
      const distances = new Map((nearby ?? []).map((v) => [v.vendor_id, Number(v.distance_km)]));
      if (distances.size === 0) {
        setVendors([]);
        setAllCategories([]);
        return;
      }

      const { data: vendorData, error } = await supabase
        .from('profiles')
        .select('id, name, email, avatar')
        .eq('role', 'vendor')
        .eq('status', 'active')
        .in('id', Array.from(distances.keys()));

      if (error) throw error;

      if (!vendorData || vendorData.length === 0) {
        console.log('No active vendors found');
        setVendors([]);
        return;
      }

      // Then fetch products for each vendor
      const vendorsWithProducts = await Promise.all(
        vendorData.map(async (vendor) => {
          const { data: products } = await supabase
            .from('products')
            .select('id, name, category, status, stock_quantity')
            .eq('vendor_id', vendor.id)
            .eq('status', 'active')
            .gt('stock_quantity', 0);

          const activeProducts = products || [];
          const categories = Array.from(
            new Set(activeProducts.map(p => p.category).filter(Boolean))
          );

          return {
            id: vendor.id,
            name: vendor.name,
            email: vendor.email,
            avatar: vendor.avatar,
            productCount: activeProducts.length,
            categories: categories as string[],
            distanceKm: distances.get(vendor.id) ?? 0
          };
        })
      );

      // Vendors with products, nearest first
      const processedVendors = vendorsWithProducts
        .filter(vendor => vendor.productCount > 0)
        .sort((a, b) => a.distanceKm - b.distanceKm);
      
      console.log('Processed vendors:', processedVendors);
      setVendors(processedVendors);
      
      // Extract all unique categories
      const uniqueCategories = Array.from(
        new Set(processedVendors.flatMap(v => v.categories))
      );
      setAllCategories(uniqueCategories);
      
    } catch (error) {
      console.error('Error fetching vendors:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredVendors = vendors.filter(vendor => {
    const matchesSearch = vendor.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         vendor.categories.some(cat => 
                           cat.toLowerCase().includes(searchQuery.toLowerCase())
                         );
    
    const matchesCategory = !selectedCategory || 
                           vendor.categories.includes(selectedCategory);
    
    return matchesSearch && matchesCategory;
  });

  if (loading || !addressesLoaded) {
    return <LoadingDisplay message="Loading vendors..." />;
  }

  if (!defaultAddress) {
    return (
      <div className="text-center py-12 space-y-4">
        <MapPin className="h-12 w-12 text-muted-foreground mx-auto" />
        <h3 className="text-lg font-semibold">Add your delivery address</h3>
        <p className="text-muted-foreground">We'll show vendors within 5 km of where you want your order delivered.</p>
        <Button onClick={() => setPickerOpen(true)}>
          <MapPin className="mr-1 h-4 w-4" />
          Add delivery address
        </Button>
        <AddressPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl md:text-3xl font-bold mb-2">Choose Your Vendor</h1>
        <p className="text-muted-foreground">
          Vendors within 5 km of {addressHeadline(defaultAddress)}. Change your address from the "Deliver to" bar.
        </p>
      </div>

      {/* Search and Filters */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            type="text"
            placeholder="Search vendors or cuisine types..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={selectedCategory === null ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(null)}
            className="text-xs"
          >
            All Cuisines
          </Button>
          {allCategories.map(category => (
            <Button
              key={category}
              variant={selectedCategory === category ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(category)}
              className="text-xs"
            >
              {category}
            </Button>
          ))}
        </div>
      </div>

      {/* Results Summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">
            {selectedCategory ? `${selectedCategory} Vendors` : 'All Vendors'}
          </h2>
          <Badge variant="outline">{filteredVendors.length}</Badge>
        </div>
        
        {(searchQuery || selectedCategory) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory(null);
            }}
          >
            Clear Filters
          </Button>
        )}
      </div>

      {/* Vendors Grid */}
      {filteredVendors.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredVendors.map(vendor => (
            <VendorSelectionCard
              key={vendor.id}
              vendor={vendor}
              onSelect={(vendorId) => onVendorSelect(vendorId, vendor.name)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="mb-4">
            <MapPin className="h-12 w-12 text-gray-400 mx-auto" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No vendors found</h3>
          <p className="text-gray-600 mb-4">
            {searchQuery || selectedCategory
              ? "Try adjusting your search or filter criteria"
              : "No vendors within 5 km of your delivery address. Try another address from the \"Deliver to\" bar."
            }
          </p>
          {(searchQuery || selectedCategory) && (
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory(null);
              }}
            >
              Clear Filters
            </Button>
          )}
        </div>
      )}
    </div>
  );
};