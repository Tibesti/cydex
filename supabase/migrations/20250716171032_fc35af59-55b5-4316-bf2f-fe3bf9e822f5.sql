-- Add verification code field to orders table
ALTER TABLE public.orders ADD COLUMN verification_code TEXT;

-- Add index for verification code lookups
CREATE INDEX idx_orders_verification_code ON public.orders(verification_code);

-- Update order status enum to include new states
ALTER TABLE public.orders ADD COLUMN vendor_accepted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.orders ADD COLUMN rider_assigned_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.orders ADD COLUMN picked_up_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.orders ADD COLUMN ready_for_pickup_at TIMESTAMP WITH TIME ZONE;

-- Add function to generate 4-digit verification code
CREATE OR REPLACE FUNCTION generate_verification_code()
RETURNS TEXT AS $$
BEGIN
  RETURN LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Add trigger to generate verification code when rider is assigned
CREATE OR REPLACE FUNCTION set_verification_code()
RETURNS TRIGGER AS $$
BEGIN
  -- Generate verification code when rider is assigned
  IF NEW.rider_id IS NOT NULL AND OLD.rider_id IS NULL THEN
    NEW.verification_code = generate_verification_code();
    NEW.rider_assigned_at = now();
  END IF;
  
  -- Update ready_for_pickup_at when status changes to ready
  IF NEW.status = 'ready' AND OLD.status != 'ready' THEN
    NEW.ready_for_pickup_at = now();
  END IF;
  
  -- Update picked_up_at when status changes to out_for_delivery
  IF NEW.status = 'out_for_delivery' AND OLD.status != 'out_for_delivery' THEN
    NEW.picked_up_at = now();
  END IF;
  
  -- Update vendor_accepted_at when status changes to processing
  IF NEW.status = 'processing' AND OLD.status != 'processing' THEN
    NEW.vendor_accepted_at = now();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for verification code generation
CREATE TRIGGER set_verification_code_trigger
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION set_verification_code();

-- Add RLS policy for verification code access
CREATE POLICY "Customers can view their order verification codes"
  ON public.orders
  FOR SELECT
  USING (
    auth.uid() = customer_id AND 
    verification_code IS NOT NULL
  );

-- Add RLS policy for riders to view verification codes for their orders
CREATE POLICY "Riders can view verification codes for their assigned orders"
  ON public.orders
  FOR SELECT
  USING (
    auth.uid() = rider_id AND 
    verification_code IS NOT NULL
  );

-- Create notifications table for real-time updates
CREATE TABLE IF NOT EXISTS public.order_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('customer', 'vendor', 'rider')),
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on notifications
ALTER TABLE public.order_notifications ENABLE ROW LEVEL SECURITY;

-- RLS policies for notifications
CREATE POLICY "Users can view their own notifications"
  ON public.order_notifications
  FOR SELECT
  USING (auth.uid() = recipient_id);

CREATE POLICY "Users can update their own notifications"
  ON public.order_notifications
  FOR UPDATE
  USING (auth.uid() = recipient_id);

-- Add indexes for better performance
CREATE INDEX idx_order_notifications_recipient ON public.order_notifications(recipient_id);
CREATE INDEX idx_order_notifications_order ON public.order_notifications(order_id);
CREATE INDEX idx_order_notifications_type ON public.order_notifications(notification_type);

-- Function to create order notifications
CREATE OR REPLACE FUNCTION create_order_notification(
  p_order_id UUID,
  p_recipient_id UUID,
  p_recipient_type TEXT,
  p_notification_type TEXT,
  p_title TEXT,
  p_message TEXT
)
RETURNS UUID AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO public.order_notifications (
    order_id,
    recipient_id,
    recipient_type,
    notification_type,
    title,
    message
  ) VALUES (
    p_order_id,
    p_recipient_id,
    p_recipient_type,
    p_notification_type,
    p_title,
    p_message
  ) RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create notifications on order status changes
CREATE OR REPLACE FUNCTION notify_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Payment confirmed notification
  IF NEW.payment_status = 'paid' AND OLD.payment_status != 'paid' THEN
    -- Notify customer
    PERFORM create_order_notification(
      NEW.id,
      NEW.customer_id,
      'customer',
      'payment_confirmed',
      'Payment Confirmed',
      'Your payment for order ' || NEW.order_number || ' has been confirmed. Waiting for vendor approval.'
    );
    
    -- Notify vendor
    IF NEW.vendor_id IS NOT NULL THEN
      PERFORM create_order_notification(
        NEW.id,
        NEW.vendor_id,
        'vendor',
        'new_order',
        'New Order Received',
        'You have received a new order ' || NEW.order_number || '. Please review and accept.'
      );
    END IF;
  END IF;
  
  -- Vendor accepted notification
  IF NEW.status = 'processing' AND OLD.status != 'processing' THEN
    -- Notify customer
    PERFORM create_order_notification(
      NEW.id,
      NEW.customer_id,
      'customer',
      'vendor_accepted',
      'Order Accepted',
      'Your order ' || NEW.order_number || ' has been accepted by the vendor. Searching for a rider...'
    );
    
    -- Notify all available riders (in a real app, this would be more sophisticated)
    -- For now, we'll just create a general notification
    INSERT INTO public.order_notifications (
      order_id,
      recipient_id,
      recipient_type,
      notification_type,
      title,
      message
    )
    SELECT 
      NEW.id,
      p.id,
      'rider',
      'delivery_available',
      'New Delivery Available',
      'A new delivery is available for order ' || NEW.order_number || '.'
    FROM public.profiles p
    WHERE p.role = 'rider';
  END IF;
  
  -- Rider assigned notification
  IF NEW.rider_id IS NOT NULL AND OLD.rider_id IS NULL THEN
    -- Notify customer with verification code
    PERFORM create_order_notification(
      NEW.id,
      NEW.customer_id,
      'customer',
      'rider_assigned',
      'Rider Assigned',
      'A rider has been assigned to your order ' || NEW.order_number || '. Your verification code is: ' || NEW.verification_code
    );
    
    -- Notify vendor
    IF NEW.vendor_id IS NOT NULL THEN
      PERFORM create_order_notification(
        NEW.id,
        NEW.vendor_id,
        'vendor',
        'rider_assigned',
        'Rider Assigned',
        'A rider has been assigned to order ' || NEW.order_number || '. Please prepare the order.'
      );
    END IF;
    
    -- Notify rider
    PERFORM create_order_notification(
      NEW.id,
      NEW.rider_id,
      'rider',
      'order_assigned',
      'Order Assigned',
      'You have been assigned to deliver order ' || NEW.order_number || '.'
    );
  END IF;
  
  -- Order ready for pickup notification
  IF NEW.status = 'ready' AND OLD.status != 'ready' THEN
    -- Notify rider
    IF NEW.rider_id IS NOT NULL THEN
      PERFORM create_order_notification(
        NEW.id,
        NEW.rider_id,
        'rider',
        'ready_for_pickup',
        'Order Ready for Pickup',
        'Order ' || NEW.order_number || ' is ready for pickup. Please head to the restaurant.'
      );
    END IF;
    
    -- Notify customer
    PERFORM create_order_notification(
      NEW.id,
      NEW.customer_id,
      'customer',
      'ready_for_pickup',
      'Order Ready',
      'Your order ' || NEW.order_number || ' is ready and will be picked up shortly.'
    );
  END IF;
  
  -- Order picked up notification
  IF NEW.status = 'out_for_delivery' AND OLD.status != 'out_for_delivery' THEN
    -- Notify customer
    PERFORM create_order_notification(
      NEW.id,
      NEW.customer_id,
      'customer',
      'out_for_delivery',
      'Order Out for Delivery',
      'Your order ' || NEW.order_number || ' is on its way to you!'
    );
  END IF;
  
  -- Order delivered notification
  IF NEW.status = 'delivered' AND OLD.status != 'delivered' THEN
    -- Notify customer
    PERFORM create_order_notification(
      NEW.id,
      NEW.customer_id,
      'customer',
      'delivered',
      'Order Delivered',
      'Your order ' || NEW.order_number || ' has been delivered successfully!'
    );
    
    -- Notify vendor
    IF NEW.vendor_id IS NOT NULL THEN
      PERFORM create_order_notification(
        NEW.id,
        NEW.vendor_id,
        'vendor',
        'delivered',
        'Order Delivered',
        'Order ' || NEW.order_number || ' has been delivered successfully.'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for order status notifications
CREATE TRIGGER notify_order_status_change_trigger
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION notify_order_status_change();