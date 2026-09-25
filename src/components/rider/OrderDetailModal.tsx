import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  MapPin, 
  Clock, 
  Phone, 
  Mail, 
  Package, 
  User, 
  Store,
  AlertCircle,
  Navigation
} from 'lucide-react';
import { DeliveryData } from '@/hooks/rider/useRiderDeliveries';
import { supabase } from '@/integrations/supabase/client';
import { formatNaira } from '@/lib/pricing';

interface OrderDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: DeliveryData | null;
  onAcceptOrder: (orderId: string) => void;
  loading?: boolean;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  isOpen,
  onClose,
  order,
  onAcceptOrder,
  loading = false
}) => {
  if (!order) return null;

  const totalEarnings = Number(order.rider_earning ?? 0); // Rider's share of the delivery fee
  const hasCarbonSavings = Number(order.carbon_saved) > 0;

  // Prefer richer sources if present
  const customerEmail = order.customer_email || (order as any).order?.customer_profile?.email || '';
  const customerPhone = order.customer_phone || (order as any).order?.customer_profile?.phone || (order as any).delivery_address?.phone || '';
  const customerName = order.customer_name 
    || (order as any).order?.customer_profile?.name 
    || (order as any).delivery_address?.name 
    || (order as any).delivery_address?.contactName 
    || 'Customer';
  const initialOrderItems = Array.isArray((order as any).order_items) && (order as any).order_items.length > 0 
    ? (order as any).order_items 
    : ((order as any).order?.order_items || []);

  const [resolvedEmail, setResolvedEmail] = useState<string>(customerEmail);
  const [resolvedName, setResolvedName] = useState<string>(customerName);
  const [resolvedItems, setResolvedItems] = useState<any[]>(initialOrderItems);

  useEffect(() => {
    let isMounted = true;
    const needsEmail = !customerEmail;
    const needsItems = !initialOrderItems || initialOrderItems.length === 0;
    if (!(needsEmail || needsItems)) return;

    const loadDetails = async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          customer_profile:profiles!customer_id(name, email, phone),
          order_items(
            product_name,
            quantity,
            unit_price,
            total_price,
            product_description
          )
        `)
        .eq('id', (order as any).order_id)
        .single();

      if (error) return;
      if (!isMounted) return;
      if (needsEmail) {
        setResolvedEmail((data as any)?.customer_profile?.email || '');
        setResolvedName((prev) => prev || (data as any)?.customer_profile?.name || 'Customer');
      }
      if (needsItems) {
        const fromJoin = (data as any)?.order_items || [];
        if (fromJoin && fromJoin.length > 0) {
          setResolvedItems(fromJoin);
        } else {
          const { data: directItems } = await supabase
            .from('order_items')
            .select('product_name, quantity, unit_price, total_price, product_description')
            .eq('order_id', (order as any).order_id);
          if (!isMounted) return;
          setResolvedItems(directItems || []);
        }
      }
    };

    loadDetails();
    return () => { isMounted = false; };
  }, [order, customerEmail, initialOrderItems]);

  const formatAddress = (address: any) => {
    if (!address) return 'Address not available';
    
    if (typeof address === 'string') {
      return address;
    }
    
    // Handle the simplified address format (new campus format)
    if (address.location) {
      let formattedAddress = address.location;
      if (address.landmark) {
        formattedAddress += `, Near ${address.landmark}`;
      }
      if (address.additional_info) {
        formattedAddress += `, ${address.additional_info}`;
      }
      return formattedAddress;
    }
    
    // Handle the full address format (old format)
    const parts = [];
    if (address.street) parts.push(address.street);
    if (address.landmark) parts.push(`Near ${address.landmark}`);
    if (address.city) parts.push(address.city);
    if (address.state) parts.push(address.state);
    
    return parts.join(', ') || 'Address not available';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Order Details
          </DialogTitle>
          <DialogDescription>
            Review all details before accepting this delivery
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Order Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">Pickup Location</p>
                  <p className="text-sm text-muted-foreground">{order.vendor_name}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">Delivery To</p>
                  <p className="text-sm text-muted-foreground">{resolvedName}</p>
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Navigation className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">Distance</p>
                  <p className="text-sm text-muted-foreground">{Number(order.actual_distance || 1.5).toFixed(1)} km</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">Estimated Delivery</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(order.estimated_delivery_time).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Customer Information */}
          <div className="space-y-3">
            <h3 className="font-semibold text-lg">Customer Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Name</p>
                    <p className="text-sm text-muted-foreground">{resolvedName || 'Customer Name Not Available'}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Email</p>
                    <p className="text-sm text-muted-foreground">{resolvedEmail || 'Email Not Available'}</p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Phone</p>
                    <p className="text-sm text-muted-foreground">{customerPhone || 'Phone Not Available'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Delivery Address */}
          <div className="space-y-3">
            <h3 className="font-semibold text-lg">Delivery Address</h3>
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">Address</p>
                <p className="text-sm text-muted-foreground">{formatAddress(order.delivery_address)}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Order Items */}
          <div className="space-y-3">
            <h3 className="font-semibold text-lg">Order Items</h3>
            <div className="space-y-2">
              {resolvedItems && resolvedItems.length > 0 ? (
                resolvedItems.map((item: any, index: number) => (
                  <div key={index} className="flex justify-between items-center p-3 bg-muted rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{item.product_name || 'Unknown Item'}</p>
                      {item.product_description && (
                        <p className="text-xs text-muted-foreground">{item.product_description}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Qty: {item.quantity || 1} × ₦{(item.unit_price || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm">₦{(item.total_price || 0).toLocaleString()}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No items available</p>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Special Instructions */}
          {order.special_instructions && (
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Special Instructions</h3>
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5" />
                <p className="text-sm text-gray-600">{order.special_instructions}</p>
              </div>
            </div>
          )}

          <Separator />

          {/* Earnings Summary */}
          <div className="space-y-3">
            <h3 className="font-semibold text-lg">Earnings Summary</h3>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">Delivery fee:</span>
                  <span className="text-sm">{formatNaira(Number(order.delivery_fee ?? 0))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Your earning:</span>
                  <span className="text-sm font-medium">{formatNaira(Number(order.rider_earning ?? 0))}</span>
                </div>
                
                {hasCarbonSavings && (
                  <div className="flex justify-between">
                    <span className="text-sm text-green-600">Carbon Saved:</span>
                    <span className="text-sm font-medium text-green-600">{Number(order.carbon_saved).toFixed(1)} kg CO₂</span>
                  </div>
                )}
                
                <Separator className="my-2" />
                
                <div className="flex justify-between">
                  <span className="font-semibold">Total Earnings:</span>
                  <span className="font-bold text-lg text-green-700">₦{totalEarnings.toLocaleString('en-NG', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button 
              onClick={() => onAcceptOrder(order.id)} 
              disabled={loading}
              className="flex-1 bg-primary hover:bg-primary/90 text-black"
            >
              {loading ? 'Accepting...' : 'Accept Order'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
