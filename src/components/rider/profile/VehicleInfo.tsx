
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Car, Bike, User, Zap } from 'lucide-react';

interface VehicleInfoProps {
  vehicle: any;
  onUpdateVehicle: () => void;
}

const VehicleInfo = ({ vehicle, onUpdateVehicle }: VehicleInfoProps) => {
  if (!vehicle) return null;

  const getVehicleIcon = () => {
    switch (vehicle.type) {
      case 'walking':
        return <User className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />;
      case 'bicycle':
        return <Bike className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />;
      case 'electric_bike':
        return <Zap className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />;
      default:
        return <User className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />;
    }
  };

  const getVehicleDisplayName = () => {
    switch (vehicle.type) {
      case 'walking':
        return 'Walking';
      case 'bicycle':
        return 'Bicycle';
      case 'electric_bike':
        return 'Electric Bike';
      default:
        return vehicle.type;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base sm:text-lg flex items-center">
          {getVehicleIcon()}
          Vehicle Info
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0">
        <div className="space-y-2 sm:space-y-3">
          <div className="flex justify-between">
            <span className="text-xs sm:text-sm text-muted-foreground">Type</span>
            <span className="text-xs sm:text-sm font-medium capitalize">{getVehicleDisplayName()}</span>
          </div>
          
          {vehicle.type !== 'walking' && (
            <>
              <div className="flex justify-between">
                <span className="text-xs sm:text-sm text-muted-foreground">Model</span>
                <span className="text-xs sm:text-sm font-medium">{vehicle.model}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs sm:text-sm text-muted-foreground">Year</span>
                <span className="text-xs sm:text-sm font-medium">{vehicle.year}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs sm:text-sm text-muted-foreground">Color</span>
                <span className="text-xs sm:text-sm font-medium">{vehicle.color}</span>
              </div>
            </>
          )}
          
          <div className="flex justify-between">
            <span className="text-xs sm:text-sm text-muted-foreground">Status</span>
            <Badge variant="secondary" className="text-xs">Coming soon</Badge>
          </div>
        </div>
        
        <Button 
          variant="outline" 
          className="w-full mt-3 sm:mt-4 text-xs sm:text-sm h-8 sm:h-9"
          onClick={onUpdateVehicle}
        >
          Update Vehicle
        </Button>
      </CardContent>
    </Card>
  );
};

export default VehicleInfo;
