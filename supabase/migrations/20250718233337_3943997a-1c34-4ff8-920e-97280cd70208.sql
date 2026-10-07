-- Allow riders to view available orders that need delivery
CREATE POLICY "Riders can view available orders for pickup"
ON public.orders
FOR SELECT
TO authenticated
USING (
  -- Rider role check
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'rider'
  )
  -- Order must be paid and accepted by vendor but no rider assigned
  AND payment_status = 'paid'
  AND status IN ('processing', 'ready')
  AND rider_id IS NULL
  AND delivery_type != 'pickup'
);