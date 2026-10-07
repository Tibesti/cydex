import { supabase } from '@/integrations/supabase/client';

// Browser push (Web Push). The send side is the send-push Edge Function.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushSupport = 'supported' | 'ios-needs-install' | 'unsupported';

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const isInstalled = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

// iPhones and iPads only allow push for apps added to the Home Screen
export const pushSupport = (): PushSupport => {
  if (typeof window === 'undefined') return 'unsupported';
  const capable = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!VAPID_PUBLIC_KEY;
  if (isIos() && !isInstalled()) return 'ios-needs-install';
  return capable ? 'supported' : 'unsupported';
};

export const pushPermission = (): NotificationPermission | 'unsupported' =>
  typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;

const keyBytes = (base64: string) => {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

const registration = () => navigator.serviceWorker.register('/sw.js');

// Is this browser subscribed right now?
export const currentSubscription = async (): Promise<PushSubscription | null> => {
  if (pushSupport() !== 'supported') return null;
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  return (await reg?.pushManager.getSubscription()) ?? null;
};

// Asks for permission (the browser's prompt), subscribes this browser and
// saves it for the signed-in user. Throws with a readable message.
export const enablePush = async () => {
  if (pushSupport() !== 'supported') throw new Error("This browser can't receive push notifications");
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notifications are blocked for this site. Allow them in your browser settings, then try again.');
  }
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY!) }));
  const json = sub.toJSON();
  const { error } = await supabase.rpc('register_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
    p_user_agent: navigator.userAgent.slice(0, 200),
  });
  if (error) throw new Error(error.message);
};

// Turns push off for the user and unsubscribes this browser
export const disablePush = async (userId: string) => {
  const sub = await currentSubscription();
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe().catch(() => undefined);
  }
  const { error } = await supabase
    .from('notification_settings')
    .upsert({ profile_id: userId, push_enabled: false, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
};
