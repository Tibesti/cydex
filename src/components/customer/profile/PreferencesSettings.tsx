
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import NotificationSettingsCard from '@/components/notifications/NotificationSettingsCard';

const PreferencesSettings = () => {
  return (
    <div className="space-y-4">
      <NotificationSettingsCard />

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Customize the look and feel of your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button>Change Theme</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default PreferencesSettings;
