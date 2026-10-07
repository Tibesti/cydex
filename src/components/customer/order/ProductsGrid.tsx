
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProductCard } from '@/components/customer/ProductCard';
import { stockLimit } from '@/lib/products';
import type { CartItem } from '@/hooks/useCart';
import { Product } from '@/hooks/useProducts';

interface ProductsGridProps {
  selectedCategory: string | null;
  filteredProducts: Product[];
  currentProducts: Product[];
  selectedVendor: string | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: string | null) => void;
  setSelectedVendor: (vendorId: string | null) => void;
  addToCart: (item: Omit<CartItem, 'quantity'>) => void;
}

export const ProductsGrid: React.FC<ProductsGridProps> = ({
  selectedCategory,
  filteredProducts,
  currentProducts,
  selectedVendor,
  searchQuery,
  setSearchQuery,
  setSelectedCategory,
  setSelectedVendor,
  addToCart
}) => {
  return (
    <div className="flex-1">
      {/* Products Header */}
      <div className="flex justify-between items-center mb-2 sm:mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm sm:text-base font-medium">
            {selectedCategory || 'All Products'}
          </h2>
          <Badge variant="outline" className="text-xs px-2 py-0.5">
            {filteredProducts.length}
          </Badge>
        </div>
        
        {/* Clear Filters (if any active) */}
        {(selectedCategory || selectedVendor || searchQuery) && (
          <Button 
            variant="ghost" 
            size="sm"
            className="text-xs h-6 px-2"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory(null);
              setSelectedVendor(null);
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Products Grid - Optimized for mobile */}
      {currentProducts.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3">
          {currentProducts.map(product => (
            <ProductCard 
              key={product.id} 
              product={product} 
              addToCart={() => addToCart({
                id: product.id,
                name: product.name,
                price: product.price,
                vendor_id: product.vendor_id,
                vendor_name: product.vendor?.name || 'Unknown Vendor',
                max_quantity: stockLimit(product)
              })} 
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 bg-card rounded-lg border border-border">
          <p className="text-muted-foreground text-sm mb-2">No products found</p>
          <Button 
            variant="link" 
            size="sm"
            className="text-xs"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory(null);
              setSelectedVendor(null);
            }}
          >
            Clear all filters
          </Button>
        </div>
      )}
    </div>
  );
};
