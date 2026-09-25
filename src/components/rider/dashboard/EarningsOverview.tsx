
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RiderEarnings } from '@/hooks/useRiderData';

interface EarningsOverviewProps {
  todaysEarnings: RiderEarnings[];
  deliveriesCompleted: number;
  dailyGoal?: number;
}

export const EarningsOverview: React.FC<EarningsOverviewProps> = ({
  todaysEarnings,
  deliveriesCompleted,
  dailyGoal = 10
}) => {
  const totalEarnings = todaysEarnings.reduce((sum, earning) => sum + Number(earning.total_earnings), 0);
  const progressPercentage = Math.min((deliveriesCompleted / dailyGoal) * 100, 100);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
      <Card>
        <CardHeader className="pb-1 sm:pb-2">
          <CardTitle className="text-sm sm:text-base font-medium">Today's Earnings</CardTitle>
        </CardHeader>
        <CardContent className="pt-1 sm:pt-2">
          <div className="text-xl sm:text-2xl md:text-3xl font-bold">
            ₦{totalEarnings.toLocaleString('en-NG', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="pb-1 sm:pb-2">
          <CardTitle className="text-sm sm:text-base font-medium">Carbon Impact</CardTitle>
        </CardHeader>
        <CardContent className="pt-1 sm:pt-2">
          <div className="text-xl sm:text-2xl md:text-3xl font-bold">
            {(todaysEarnings.reduce((sum, earning) => sum + Number(earning.carbon_credits_earned || 0), 0) / 1000).toFixed(1)} kg
          </div>
          <p className="text-xs sm:text-sm text-gray-500">CO₂ emissions prevented today</p>
        </CardContent>
      </Card>
      
      <Card className="sm:col-span-2 md:col-span-1">
        <CardHeader className="pb-1 sm:pb-2">
          <CardTitle className="text-sm sm:text-base font-medium">Deliveries</CardTitle>
        </CardHeader>
        <CardContent className="pt-1 sm:pt-2">
          <div className="text-xl sm:text-2xl md:text-3xl font-bold">{deliveriesCompleted}</div>
          <div className="mt-2">
            <div className="flex justify-between items-center text-xs mb-1">
              <span>Daily Goal Progress</span>
              <span>{Math.round(progressPercentage)}%</span>
            </div>
            <Progress value={progressPercentage} className="h-2 bg-gray-100" />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {Math.max(0, dailyGoal - deliveriesCompleted)} more deliveries to reach your daily goal
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
