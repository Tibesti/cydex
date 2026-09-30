import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/SupabaseAuthContext';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean | null;
  metadata: { order_id?: string; order_number?: string } | null;
  created_at: string;
}

const LIMIT = 100;
const queryKeyFor = (userId?: string) => ['notifications', userId];

// The signed-in user's notifications (created by the database on order events;
// see docs/ORDER_FLOW.md), newest first, plus mark-as-read actions.
export const useNotifications = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = queryKeyFor(user?.id);

  const { data: notifications = [], isLoading } = useQuery({
    queryKey,
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, title, message, is_read, metadata, created_at')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(LIMIT);
      if (error) throw error;
      return data as AppNotification[];
    },
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user!.id)
        .eq('is_read', false);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  return { notifications, unreadCount, isLoading, markAllRead, markRead };
};

// Keeps the list live and pops a toast for each new notification.
// Mount once per session (DashboardLayout).
export const useNotificationsRealtime = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as AppNotification;
          toast(n.title, { description: n.message });
          queryClient.invalidateQueries({ queryKey: queryKeyFor(user.id) });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);
};
