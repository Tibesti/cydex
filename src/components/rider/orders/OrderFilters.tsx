
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SortAsc } from 'lucide-react';

interface OrderFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  sortBy: string;
  onSortChange: (value: string) => void;
}

export const OrderFilters: React.FC<OrderFiltersProps> = ({
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange
}) => {
  return (
    <Card>
      <CardHeader className="pb-3 sm:pb-4">
        <CardTitle className="text-base sm:text-lg">Find Your Next Delivery</CardTitle>
        <CardDescription className="text-sm">
          Explore available orders and accept the ones that fit your route
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-col sm:grid sm:grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
          <div className="md:col-span-2">
            <Input
              type="text"
              placeholder="Search by vendor or customer..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full text-sm sm:text-base h-8 sm:h-9"
            />
          </div>
          <div className="flex items-center justify-start sm:justify-end space-x-2">
            <Button
              variant="outline"
              className="text-xs sm:text-sm h-8 sm:h-9"
              onClick={() => onSortChange(sortBy === 'distance' ? 'fee' : 'distance')}
            >
              <SortAsc className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
              {sortBy === 'fee' ? 'Highest pay' : 'Nearest'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
