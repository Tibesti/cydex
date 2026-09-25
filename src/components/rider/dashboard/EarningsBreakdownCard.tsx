
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Wallet } from 'lucide-react';
import { RiderEarnings } from '@/hooks/useRiderData';

interface EarningsBreakdownCardProps {
  todaysEarnings: RiderEarnings[];
}

export const EarningsBreakdownCard: React.FC<EarningsBreakdownCardProps> = ({
  todaysEarnings
}) => {
  return (
    <Card>
      <CardHeader className="pb-3 sm:pb-4">
        <CardTitle className="text-base sm:text-lg">Earnings Overview</CardTitle>
        <CardDescription className="text-sm">Track your income and bonuses</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="mb-4 sm:mb-6">
          <Tabs defaultValue="week">
            <TabsList className="mb-3 sm:mb-4 w-full">
              <TabsTrigger value="week" className="text-xs sm:text-sm flex-1">This Week</TabsTrigger>
              <TabsTrigger value="month" className="text-xs sm:text-sm flex-1">This Month</TabsTrigger>
            </TabsList>
            
            <TabsContent value="week">
              <div className="space-y-3 sm:space-y-4">
                <div className="flex justify-between items-center">
                  <p className="text-gray-600 text-xs sm:text-sm">Delivery Fees</p>
                  <p className="font-medium text-xs sm:text-sm">₦234,178.25</p>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-gray-600 text-xs sm:text-sm">Tips</p>
                  <p className="font-medium text-xs sm:text-sm">₦64,390.20</p>
                </div>
                <div className="border-t pt-3 flex justify-between items-center">
                  <p className="font-bold text-sm sm:text-base">Total</p>
                  <p className="text-lg sm:text-xl font-bold">₦342,261.80</p>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="month">
              <div className="space-y-3 sm:space-y-4">
                <div className="flex justify-between items-center">
                  <p className="text-gray-600 text-xs sm:text-sm">Delivery Fees</p>
                  <p className="font-medium text-xs sm:text-sm">₦869,588.83</p>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-gray-600 text-xs sm:text-sm">Tips</p>
                  <p className="font-medium text-xs sm:text-sm">₦234,564.30</p>
                </div>
                <div className="border-t pt-3 flex justify-between items-center">
                  <p className="font-bold text-sm sm:text-base">Total</p>
                  <p className="text-lg sm:text-xl font-bold">₦1,241,364.58</p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
        
        <Button className="w-full flex items-center justify-center bg-primary hover:bg-primary-hover text-black text-xs sm:text-sm h-8 sm:h-9">
          <Wallet className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
          <span>Withdraw Earnings</span>
        </Button>
      </CardContent>
    </Card>
  );
};
