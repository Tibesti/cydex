import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { toast } from '@/hooks/use-toast';

export interface VendorSettings {
  id: string;
  vendor_id: string;
  business_license?: string;
  category?: string;
  description?: string;
  logo_url?: string;
  notification_preferences: {
    email: boolean;
    push: boolean;
    sms: boolean;
    marketing: boolean;
  };
  security_settings: {
    two_factor_enabled: boolean;
    session_timeout: number;
  };
  created_at: string;
  updated_at: string;
}

export interface VendorProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  verified: boolean;
  created_at: string;
}

export const useVendorSettings = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<VendorSettings | null>(null);
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch vendor settings
  const fetchSettings = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('vendor_settings')
        .select('*')
        .eq('vendor_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (!data) {
        // Create initial settings record
        const { data: newSettings, error: insertError } = await supabase
          .from('vendor_settings')
          .insert({
            vendor_id: user.id,
            notification_preferences: {
              email: true,
              push: true,
              sms: false,
              marketing: false
            },
            security_settings: {
              two_factor_enabled: false,
              session_timeout: 3600
            }
          })
          .select()
          .single();

        if (insertError) throw insertError;
        setSettings(newSettings as VendorSettings);
      } else {
        setSettings(data as VendorSettings);
      }
    } catch (error) {
      console.error('Error fetching vendor settings:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load settings"
      });
    }
  };

  // Fetch vendor profile
  const fetchProfile = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error fetching vendor profile:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load profile"
      });
    }
  };

  // Update vendor settings
  const updateSettings = async (updates: Partial<VendorSettings>) => {
    if (!user?.id || !settings) return;

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('vendor_settings')
        .update(updates)
        .eq('vendor_id', user.id)
        .select()
        .single();

      if (error) throw error;
      
      setSettings(data as VendorSettings);
      toast({
        title: "Settings updated",
        description: "Your settings have been saved successfully"
      });
      
      return data;
    } catch (error) {
      console.error('Error updating vendor settings:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update settings"
      });
      throw error;
    } finally {
      setSaving(false);
    }
  };

  // Update vendor profile
  const updateProfile = async (updates: Partial<VendorProfile>) => {
    if (!user?.id) return;

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single();

      if (error) throw error;
      
      setProfile(data);
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully"
      });
      
      return data;
    } catch (error) {
      console.error('Error updating vendor profile:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update profile"
      });
      throw error;
    } finally {
      setSaving(false);
    }
  };

  // Get vendor statistics (from other tables)
  const fetchVendorStats = async () => {
    if (!user?.id) return null;

    try {
      // Fetch product count
      const { count: productCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', user.id)
        .eq('status', 'active');

      // Fetch order count for this month
      const currentMonth = new Date();
      const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      
      const { count: orderCount } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', user.id)
        .gte('created_at', firstDay.toISOString());

      // Fetch revenue for this month
      const { data: revenueData } = await supabase
        .from('vendor_transactions')
        .select('net_amount')
        .eq('vendor_id', user.id)
        .eq('type', 'sale')
        .eq('status', 'completed')
        .gte('created_at', firstDay.toISOString());

      const totalRevenue = revenueData?.reduce((sum, t) => sum + parseFloat(t.net_amount.toString()), 0) || 0;

      return {
        productCount: productCount || 0,
        orderCount: orderCount || 0,
        totalRevenue
      };
    } catch (error) {
      console.error('Error fetching vendor stats:', error);
      return null;
    }
  };

  // Get recent activity
  const fetchRecentActivity = async () => {
    if (!user?.id) return [];

    try {
      // Get recent orders
      const { data: orders } = await supabase
        .from('orders')
        .select('id, order_number, status, created_at, customer_id')
        .eq('vendor_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);

      // Get recent product updates
      const { data: products } = await supabase
        .from('products')
        .select('id, name, updated_at')
        .eq('vendor_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(3);

      const activities = [];

      // Add order activities
      orders?.forEach(order => {
        activities.push({
          type: 'order',
          title: 'New order received!',
          description: `Order ${order.order_number} placed`,
          timestamp: order.created_at
        });
      });

      // Add product activities
      products?.forEach(product => {
        activities.push({
          type: 'product',
          title: 'Product updated',
          description: `${product.name} was updated`,
          timestamp: product.updated_at
        });
      });

      // Sort by timestamp and return latest 5
      return activities
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 5);
    } catch (error) {
      console.error('Error fetching recent activity:', error);
      return [];
    }
  };

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        fetchSettings(),
        fetchProfile()
      ]);
      setLoading(false);
    };

    if (user?.id) {
      loadData();
    }
  }, [user?.id]);

  return {
    settings,
    profile,
    loading,
    saving,
    updateSettings,
    updateProfile,
    fetchVendorStats,
    fetchRecentActivity
  };
};