
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

const PaymentSettings = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Settings</CardTitle>
        <CardDescription>Manage your payout preferences</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="border rounded-lg p-3">
            <div className="flex justify-between">
              <div className="flex items-center">
                <div className="h-10 w-10 rounded-md bg-blue-100 flex items-center justify-center text-blue-600 mr-3">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="5" width="20" height="14" rx="2"></rect>
                    <line x1="2" y1="10" x2="22" y2="10"></line>
                  </svg>
                </div>
                <div>
                  <p className="font-medium">Zenith Bank</p>
                  <p className="text-xs text-gray-500">****4587</p>
                </div>
              </div>
              <Badge>Default</Badge>
            </div>
          </div>
          
          <div className="flex items-center">
            <div className="flex-1">
              <p className="font-medium">Auto Withdrawal</p>
              <p className="text-xs text-gray-500">Withdraw earnings every week</p>
            </div>
            <Switch />
          </div>
          
          <div className="flex items-center">
            <div className="flex-1">
              <p className="font-medium">Payment Notifications</p>
              <p className="text-xs text-gray-500">Get alerts for new payments</p>
            </div>
            <Switch checked />
          </div>
          
          <div className="flex items-center">
            <div className="flex-1">
              <p className="font-medium">Minimum Withdrawal</p>
              <p className="text-xs text-gray-500">The smallest amount you can withdraw at once</p>
            </div>
            <div className="font-bold">₦3,000</div>
          </div>
        </div>
        
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="outline">
            Add Bank Account
          </Button>
          <Button className="bg-primary hover:bg-primary-hover text-black">
            Update Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default PaymentSettings;
