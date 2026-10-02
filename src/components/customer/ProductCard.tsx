import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Star, Plus } from 'lucide-react';
import { Product } from '@/hooks/useProducts';
import { useVendorRatings } from '@/hooks/useVendorRatings';
import { isAvailable, stockLabel } from '@/lib/products';
import { cn } from '@/lib/utils';

interface ProductCardProps {
  product: Product;
  addToCart: () => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, addToCart }) => {
  const navigate = useNavigate();
  const { getRatingForVendor } = useVendorRatings();

  const handleClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking the add to cart button
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    navigate(`/customer/products/${product.id}`);
  };

  const available = isAvailable(product);
  const stock = stockLabel(product);
  const vendorRating = getRatingForVendor(product.vendor_id);
  const displayRating = vendorRating.average_rating > 0 ? vendorRating.average_rating : 4.5; // Fallback rating

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer h-full flex flex-col group" onClick={handleClick}>
      <div className="relative h-28 xs:h-32 sm:h-40 w-full flex-shrink-0">
        <img 
          src={product.image_url || '/placeholder.svg'} 
          alt={product.name} 
          className={cn(
            "w-full h-full object-cover group-hover:scale-105 transition-transform duration-300",
            !available && "opacity-50 grayscale"
          )}
        />
        {!available && (
          <span className="absolute left-1.5 top-1.5 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold sm:text-xs">
            {stock}
          </span>
        )}
      </div>
      
      <CardContent className="p-1.5 xs:p-2 sm:p-3 flex-1 flex flex-col">
        <div className="flex items-start justify-between mb-1">
          <h3 className="font-medium line-clamp-1 text-xs sm:text-sm flex-1 mr-1 leading-tight">{product.name}</h3>
          <span className="font-bold text-xs sm:text-sm text-primary whitespace-nowrap">₦{product.price.toLocaleString()}</span>
        </div>
        
        {available && stock && <p className="text-xs text-muted-foreground mb-1 hidden xs:block">{stock}</p>}
        
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-600 truncate flex-1 mr-1">{product.vendor?.name || 'Unknown Vendor'}</span>
          <div className="flex items-center flex-shrink-0">
            <Star className="h-2.5 w-2.5 text-yellow-500 mr-0.5 fill-yellow-500" />
            <span className="text-xs">
              {displayRating.toFixed(1)}
              {vendorRating.total_ratings > 0 && (
                <span className="text-gray-400 ml-0.5 hidden sm:inline">({vendorRating.total_ratings})</span>
              )}
            </span>
          </div>
        </div>
        
        <p className="text-xs text-gray-600 line-clamp-2 flex-1 hidden sm:block">{product.description}</p>
      </CardContent>
      
      <CardFooter className="p-1.5 xs:p-2 sm:p-3 pt-0 mt-auto">
        <Button 
          className="w-full bg-primary hover:bg-primary/80 text-black text-xs sm:text-sm h-6 xs:h-7 sm:h-8 transition-all duration-200 flex items-center justify-center"
          onClick={(e) => {
            e.stopPropagation();
            if (available) addToCart();
          }}
          disabled={!available}
          title={available ? 'Add to Cart' : stock ?? 'Unavailable'}
        >
          {available ? <Plus className="h-3 w-3 sm:h-4 sm:w-4" /> : <span className="text-[10px] sm:text-xs">{stock}</span>}
        </Button>
      </CardFooter>
    </Card>
  );
};
