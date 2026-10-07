import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { currentSubscription, disablePush, enablePush, pushPermission, pushSupport, type PushSupport } from '@/lib/push';

// Email and push notification settings for the signed-in user, plus whether
// THIS browser is set up to receive push
export const useNotificationSettings = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ['notification-settings', user?.id];
  const [deviceSubscribed, setDeviceSubscribed] = useState<boolean | null>(null);
  const [support] = useState<PushSupport>(() => pushSupport());

  const { data: settings, isLoading } = useQuery({
    queryKey: key,
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_settings')
        .select('email_enabled, push_enabled')
        .eq('profile_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data ?? { email_enabled: true, push_enabled: false };
    },
  });

  useEffect(() => {
    currentSubscription().then((s) => setDeviceSubscribed(!!s)).catch(() => setDeviceSubscribed(false));
  }, []);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notification-settings'] });

  const setEmail = async (enabled: boolean) => {
    const { error } = await supabase
      .from('notification_settings')
      .upsert({ profile_id: user!.id, email_enabled: enabled, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    refresh();
  };

  const setPush = async (enabled: boolean) => {
    if (enabled) await enablePush();
    else await disablePush(user!.id);
    setDeviceSubscribed(enabled);
    refresh();
  };

  return {
    loading: isLoading,
    emailEnabled: settings?.email_enabled ?? true,
    // Push is "on" here only when it's on for the account AND this browser is subscribed
    pushOnHere: !!settings?.push_enabled && deviceSubscribed === true,
    deviceChecked: deviceSubscribed !== null,
    support,
    permission: pushPermission(),
    setEmail,
    setPush,
  };
};
