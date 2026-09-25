import React from 'react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Star, MapPin, Leaf, ChefHat } from 'lucide-react';
import { useVendorRatings } from '@/hooks/useVendorRatings';

interface VendorSelectionCardProps {
  vendor: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
    productCount: number;
    categories: string[];
    distanceKm: number;
  };
  onSelect: (vendorId: string) => void;
}

export const VendorSelectionCard: React.FC<VendorSelectionCardProps> = ({
  vendor,
  onSelect
}) => {
  const { getRatingForVendor } = useVendorRatings();
  const vendorRating = getRatingForVendor(vendor.id);
  const displayRating = vendorRating.average_rating > 0 ? vendorRating.average_rating : 4.5;

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer group" onClick={() => onSelect(vendor.id)}>
      <div className="relative h-32 w-full flex-shrink-0 bg-gradient-to-br from-primary/10 to-primary/5">
        {vendor.avatar ? (
          <img 
            src={vendor.avatar} 
            alt={vendor.name} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ChefHat className="h-12 w-12 text-primary/40" />
          </div>
        )}
        <div className="absolute top-2 right-2 bg-card/90 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1">
          <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
          <span className="text-xs font-medium">{displayRating.toFixed(1)}</span>
        </div>
      </div>
      
      <CardContent className="p-4">
        <div className="space-y-2">
          <h3 className="font-semibold text-lg line-clamp-1">{vendor.name}</h3>
          
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <Leaf className="h-4 w-4 text-green-500" />
              <span>{vendor.productCount} products</span>
            </div>
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span>{vendor.distanceKm.toFixed(1)} km away</span>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-1">
            {vendor.categories.slice(0, 3).map((category, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {category}
              </Badge>
            ))}
            {vendor.categories.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{vendor.categories.length - 3} more
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
      
      <CardFooter className="p-4 pt-0">
        <Button 
          className="w-full bg-primary hover:bg-primary/90 text-black"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(vendor.id);
          }}
        >
          View Menu
        </Button>
      </CardFooter>
    </Card>
  );
};