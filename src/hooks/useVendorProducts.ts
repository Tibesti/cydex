
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { toast } from 'sonner';

export interface VendorProduct {
  id: string;
  vendor_id: string;
  name: string;
  description?: string;
  price: number;
  category?: string;
  is_eco_friendly: boolean;
  carbon_impact: number;
  stock_quantity: number | null;
  /** When true, stock_quantity is required and drives availability */
  track_stock: boolean;
  image_url?: string;
  status: 'active' | 'inactive' | 'out_of_stock';
  created_at: string;
  updated_at: string;
}

export const useVendorProducts = () => {
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const fetchProducts = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('products')
        .select('*')
        .eq('vendor_id', user.id)
        .order('created_at', { ascending: false });

      if (fetchError) {
        console.error('Error fetching vendor products:', fetchError);
        throw fetchError;
      }

      // Transform the data to ensure proper typing
      const typedData: VendorProduct[] = (data || []).map(product => ({
        ...product,
        status: product.status as 'active' | 'inactive' | 'out_of_stock'
      }));

      setProducts(typedData);
    } catch (err: any) {
      console.error('Error in fetchProducts:', err);
      setError(err.message || 'Failed to fetch products');
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const addProduct = async (productData: {
    name: string;
    description?: string;
    price: number;
    category?: string;
    is_eco_friendly: boolean;
    carbon_impact: number;
    track_stock: boolean;
    stock_quantity: number | null;
    image_url?: string;
    status: 'active' | 'inactive' | 'out_of_stock';
  }) => {
    if (!user?.id) {
      toast.error('You must be logged in to add products');
      return false;
    }

    try {
      const { data, error } = await supabase
        .from('products')
        .insert({
          ...productData,
          vendor_id: user.id
        })
        .select()
        .single();

      if (error) throw error;

      await fetchProducts();
      toast.success('Product added successfully!');
      return true;
    } catch (error: any) {
      console.error('Error adding product:', error);
      toast.error(error?.message || 'Failed to add product');
      return false;
    }
  };

  const updateProduct = async (productId: string, updates: Partial<VendorProduct>) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', productId)
        .eq('vendor_id', user?.id);

      if (error) throw error;

      await fetchProducts();
      toast.success('Product updated successfully!');
      return true;
    } catch (error: any) {
      console.error('Error updating product:', error);
      toast.error(error?.message || 'Failed to update product');
      return false;
    }
  };

  const toggleProductStatus = async (productId: string, newStatus: 'active' | 'inactive' | 'out_of_stock') => {
    return updateProduct(productId, { status: newStatus });
  };

  const deleteProduct = async (productId: string) => {
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId)
        .eq('vendor_id', user?.id);

      if (error) throw error;

      await fetchProducts();
      toast.success('Product deleted successfully!');
      return true;
    } catch (error: any) {
      console.error('Error deleting product:', error);
      toast.error('Failed to delete product');
      return false;
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [user?.id]);

  // Set up real-time subscription for product updates
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('vendor-products-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products',
          filter: `vendor_id=eq.${user.id}`
        },
        () => {
          console.log('Product updated, refreshing...');
          fetchProducts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return {
    products,
    loading,
    error,
    refetch: fetchProducts,
    addProduct,
    updateProduct,
    toggleProductStatus,
    deleteProduct
  };
};
