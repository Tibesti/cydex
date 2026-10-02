import React, { createContext, useContext } from 'react';
import { useCart, CartItem } from '@/hooks/useCart';
import CartVendorConflictDialog from '@/components/customer/CartVendorConflictDialog';

interface CartContextType {
  vendorConflict: { item: Omit<CartItem, 'quantity'>; quantity: number } | null;
  resolveVendorConflict: (startNewCart: boolean) => void;
  cartItems: CartItem[];
  isCartOpen: boolean;
  setIsCartOpen: (isOpen: boolean) => void;
  addToCart: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, delta: number) => void;
  calculateTotal: () => number;
  clearCart: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const cart = useCart();

  return (
    <CartContext.Provider value={cart}>
      {children}
      <CartVendorConflictDialog
        conflict={cart.vendorConflict}
        cartVendorName={cart.cartItems[0]?.vendor_name}
        onResolve={cart.resolveVendorConflict}
      />
    </CartContext.Provider>
  );
};

export const useCartContext = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCartContext must be used within a CartProvider');
  }
  return context;
}; 