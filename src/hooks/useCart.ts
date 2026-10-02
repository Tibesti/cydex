import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  vendor_id: string;
  vendor_name: string;
  /** Most that can be ordered: the stock for stock-tracked products; null/undefined = no limit */
  max_quantity?: number | null;
}

// Key used to persist cart in localStorage
const CART_STORAGE_KEY = 'shopping_cart';

export const useCart = () => {
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(CART_STORAGE_KEY);
      return stored ? (JSON.parse(stored) as CartItem[]) : [];
    } catch (error) {
      console.error('Failed to parse stored cart', error);
      return [];
    }
  });
  const [isCartOpen, setIsCartOpen] = useState(false);
  // An item from a different vendor, waiting for the customer to choose
  // (orders are from one vendor at a time)
  const [vendorConflict, setVendorConflict] = useState<{ item: Omit<CartItem, 'quantity'>; quantity: number } | null>(null);

  // Persist cart items to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
    } catch (error) {
      console.error('Failed to save cart', error);
    }
  }, [cartItems]);

  // Adds up to the product's stock (when tracked); says so if it hits the limit
  const addToCart = useCallback((item: Omit<CartItem, 'quantity'>, quantity: number = 1) => {
    // One vendor per order: ask before mixing vendors
    if (cartItems.length > 0 && cartItems.some(i => i.vendor_id !== item.vendor_id)) {
      setVendorConflict({ item, quantity });
      return;
    }

    const existing = cartItems.find(i => i.id === item.id);
    const limit = item.max_quantity !== undefined ? item.max_quantity : existing?.max_quantity;
    const current = existing?.quantity ?? 0;
    let next = current + quantity;

    if (limit != null && next > limit) {
      next = limit;
      if (next <= current) {
        toast.error(limit === 0 ? `${item.name} is out of stock` : `Only ${limit} of ${item.name} available, and they're all in your cart`);
        return;
      }
      toast.warning(`Only ${limit} of ${item.name} available. Added ${next - current}.`);
    } else {
      toast.success('Added to cart');
    }

    setCartItems(prev =>
      existing
        ? prev.map(i => (i.id === item.id ? { ...i, ...item, quantity: next } : i))
        : [...prev, { ...item, quantity: next }]
    );
  }, [cartItems]);

  const removeFromCart = useCallback((productId: string) => {
    setCartItems(prev => prev.filter(item => item.id !== productId));
    toast.success('Removed from cart');
  }, []);

  const updateQuantity = useCallback((productId: string, delta: number) => {
    const item = cartItems.find(i => i.id === productId);
    if (!item) return;
    const next = item.quantity + delta;
    if (next < 1) return;
    if (item.max_quantity != null && next > item.max_quantity) {
      toast.error(`Only ${item.max_quantity} of ${item.name} available`);
      return;
    }
    setCartItems(prev => prev.map(i => (i.id === productId ? { ...i, quantity: next } : i)));
  }, [cartItems]);

  const calculateTotal = useCallback(() => {
    return cartItems.reduce((total, item) => total + (item.price * item.quantity), 0);
  }, [cartItems]);

  const clearCart = useCallback(() => {
    setCartItems([]);
    try {
      localStorage.removeItem(CART_STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear cart storage', error);
    }
  }, []);

  // "Start a new cart": empty it and add the waiting item; otherwise keep the cart
  const resolveVendorConflict = useCallback((startNewCart: boolean) => {
    const pending = vendorConflict;
    setVendorConflict(null);
    if (!startNewCart || !pending) return;
    const { item, quantity } = pending;
    const next = item.max_quantity != null ? Math.min(quantity, item.max_quantity) : quantity;
    if (next < 1) {
      toast.error(`${item.name} is out of stock`);
      return;
    }
    setCartItems([{ ...item, quantity: next }]);
    toast.success(`New cart started with ${item.name}`);
  }, [vendorConflict]);

  return {
    vendorConflict,
    resolveVendorConflict,
    cartItems,
    isCartOpen,
    setIsCartOpen,
    addToCart,
    removeFromCart,
    updateQuantity,
    calculateTotal,
    clearCart
  };
}; 