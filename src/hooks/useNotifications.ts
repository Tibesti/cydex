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

export const NOTIFICATIONS_PAGE_SIZE = 15;
const queryKeyFor = (userId?: string) => ['notifications', userId];

// Unread count (for the badges) and mark-as-read actions
export const useNotifications = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeyFor(user?.id) });

  const { data: unreadCount = 0 } = useQuery({
    queryKey: [...queryKeyFor(user?.id), 'unread'],
    enabled: !!user?.id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user!.id)
        .eq('is_read', false);
      if (error) throw error;
      return count ?? 0;
    },
  });

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

  return { unreadCount, markAllRead, markRead };
};

// One page of the signed-in user's notifications, newest first
export const useNotificationsPage = (page: number) => {
  const { user } = useAuth();
  const from = (page - 1) * NOTIFICATIONS_PAGE_SIZE;

  const { data, isLoading } = useQuery({
    queryKey: [...queryKeyFor(user?.id), 'page', page],
    enabled: !!user?.id,
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const { data, count, error } = await supabase
        .from('notifications')
        .select('id, type, title, message, is_read, metadata, created_at', { count: 'exact' })
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .range(from, from + NOTIFICATIONS_PAGE_SIZE - 1);
      if (error) throw error;
      return { notifications: data as AppNotification[], total: count ?? 0 };
    },
  });

  return {
    notifications: data?.notifications ?? [],
    total: data?.total ?? 0,
    pageCount: Math.max(1, Math.ceil((data?.total ?? 0) / NOTIFICATIONS_PAGE_SIZE)),
    isLoading,
  };
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
