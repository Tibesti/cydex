import React, { useMemo, useState } from 'react';
import { Search, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import LoadingDisplay from '@/components/ui/LoadingDisplay';
import { addressHeadline } from '@/lib/address';
import { AddressPickerDialog } from '@/components/address/AddressPickerDialog';
import { useVendorCards } from '@/hooks/useVendorCards';
import VendorCard from './vendors/VendorCard';

interface VendorSelectionPageProps {
  onVendorSelect: (vendorId: string, vendorName: string) => void;
}

// All vendors within 5 km of the customer's delivery address (the "Deliver to" bar)
export const VendorSelectionPage: React.FC<VendorSelectionPageProps> = ({
  onVendorSelect
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { vendors, defaultAddress, loading } = useVendorCards();
  const allCategories = useMemo(
    () => Array.from(new Set(vendors.flatMap((v) => v.categories))).sort(),
    [vendors]
  );

  const filteredVendors = vendors.filter(vendor => {
    const matchesSearch = vendor.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         vendor.categories.some(cat => 
                           cat.toLowerCase().includes(searchQuery.toLowerCase())
                         );
    
    const matchesCategory = !selectedCategory || 
                           vendor.categories.includes(selectedCategory);
    
    return matchesSearch && matchesCategory;
  });

  if (loading) {
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
            <VendorCard
              key={vendor.vendor_id}
              vendor={vendor}
              onSelect={(v) => onVendorSelect(v.vendor_id, v.name)}
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