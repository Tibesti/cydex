import React from 'react';
import { X, Minus, Plus, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PriceBreakdown } from './PriceBreakdown';
import { quoteProblem } from '@/lib/pricing';
import { useAddresses } from '@/hooks/useAddresses';
import { toCartLines, useOrderQuote } from '@/hooks/useOrderQuote';
import { addressHeadline } from '@/lib/address';

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  vendor_id: string;
  vendor_name: string;
}

interface ShoppingCartSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  updateQuantity: (productId: string, delta: number) => void;
  removeFromCart: (productId: string) => void;
  cartTotal: number;
  proceedToCheckout: () => void;
}

export const ShoppingCartSidebar: React.FC<ShoppingCartSidebarProps> = ({
  isOpen,
  onClose,
  cartItems,
  updateQuantity,
  removeFromCart,
  cartTotal,
  proceedToCheckout
}) => {
  // Priced for the default address; the customer can pick another at checkout
  const { defaultAddress } = useAddresses();
  const { quote, isLoading: quoteLoading } = useOrderQuote(cartItems[0]?.vendor_id, defaultAddress?.id, toCartLines(cartItems));
  const deliverable = quote?.status === 'ok';
  const problem = defaultAddress ? quoteProblem(quote?.status) : quoteProblem('no_address');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex justify-end">
      <div 
        className="w-full max-w-md bg-background h-full shadow-xl flex flex-col animate-in slide-in-from-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold text-lg">Your Cart</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        {cartItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-grow p-6 text-muted-foreground">
            <ShoppingBag className="h-16 w-16 mb-4 text-muted-foreground/50" />
            <p className="mb-2">Your cart is empty</p>
            <Button variant="link" onClick={onClose}>Browse Products</Button>
          </div>
        ) : (
          <>
            <ScrollArea className="flex-grow p-4">
              <div className="space-y-4">
                {cartItems.map(item => (
                  <div key={item.id} className="flex items-center gap-3">
                    <div className="flex-grow">
                      <h3 className="font-medium line-clamp-1">{item.name}</h3>
                      <p className="text-xs text-muted-foreground">{item.vendor_name}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="font-semibold">₦{item.price.toLocaleString()}</span>
                        
                        <div className="flex items-center">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-7 w-7 p-0 rounded-full"
                            onClick={() => updateQuantity(item.id, -1)}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          
                          <span className="mx-2 w-5 text-center">{item.quantity}</span>
                          
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-7 w-7 p-0 rounded-full"
                            onClick={() => updateQuantity(item.id, 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-7 w-7 p-0 text-gray-400 hover:text-gray-800"
                      onClick={() => removeFromCart(item.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
            
            <div className="p-4 border-t">
              <div className="mb-4 space-y-2">
                <PriceBreakdown
                  subtotal={quote?.subtotal ?? cartTotal}
                  serviceCharge={quote?.service_charge ?? null}
                  deliveryFee={deliverable ? quote.delivery_fee : null}
                  total={deliverable ? quote.total_amount : null}
                  loading={quoteLoading}
                />
                {problem && <p className="text-xs text-destructive">{problem}</p>}
                {defaultAddress && (
                  <p className="text-xs text-muted-foreground">
                    Delivering to {addressHeadline(defaultAddress)}. You can change it at checkout.
                  </p>
                )}
              </div>
              
              <Button 
                className="w-full bg-primary hover:bg-primary/80 text-black"
                onClick={proceedToCheckout}
              >
                Proceed to Checkout
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
