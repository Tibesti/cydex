-- ===================================================================
-- Product availability and stock
--
-- Each product either tracks stock or not (products.track_stock):
--   tracked:   stock_quantity is required. The product is available while
--              stock > 0, and goes out of stock automatically at 0.
--   untracked: no stock number; the vendor switches it available /
--              unavailable themselves (status active / inactive).
-- Stock goes down when an order is paid for, and back up if that paid order
-- is cancelled or rejected. Customers can't order more than is in stock.
-- See docs/ORDER_FLOW.md → Products and stock.
-- ===================================================================

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS track_stock BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.products ALTER COLUMN stock_quantity DROP DEFAULT;

-- Existing products with stock keep tracking it; the rest switch to manual availability
UPDATE public.products SET track_stock = COALESCE(stock_quantity, 0) > 0;
UPDATE public.products SET stock_quantity = NULL WHERE NOT track_stock;
UPDATE public.products SET status = 'inactive' WHERE NOT track_stock AND status = 'out_of_stock';
UPDATE public.products SET status = CASE WHEN stock_quantity > 0 THEN 'active' ELSE 'out_of_stock' END WHERE track_stock;

ALTER TABLE public.products ADD CONSTRAINT products_stock_tracking_check CHECK (
  (track_stock AND stock_quantity IS NOT NULL AND stock_quantity >= 0)
  OR (NOT track_stock AND stock_quantity IS NULL)
);

-- Keeps status in line with stock:
--   tracked   -> active while stock > 0, out_of_stock at 0
--   untracked -> active or inactive (the vendor's toggle), no stock number
CREATE OR REPLACE FUNCTION public.sync_product_availability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.track_stock THEN
    IF NEW.stock_quantity IS NULL THEN
      RAISE EXCEPTION 'Enter how many you have in stock';
    END IF;
    IF NEW.stock_quantity < 0 THEN
      NEW.stock_quantity := 0;
    END IF;
    NEW.status := CASE WHEN NEW.stock_quantity > 0 THEN 'active' ELSE 'out_of_stock' END;
  ELSE
    NEW.stock_quantity := NULL;
    NEW.status := CASE WHEN NEW.status = 'inactive' THEN 'inactive' ELSE 'active' END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_product_availability ON public.products;
CREATE TRIGGER sync_product_availability
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.sync_product_availability();

-- ===================================================================
-- Ordering: can't order more than is in stock
-- ===================================================================

CREATE OR REPLACE FUNCTION public.cart_subtotal(p_vendor_id UUID, p_items JSONB)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC := 0;
  v_item JSONB;
  v_product public.products%ROWTYPE;
  v_quantity INTEGER;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Your cart is empty';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_quantity := (v_item ->> 'quantity')::integer;
    IF v_quantity IS NULL OR v_quantity < 1 THEN
      RAISE EXCEPTION 'Each item needs a quantity of at least 1';
    END IF;

    SELECT * INTO v_product FROM public.products WHERE id = (v_item ->> 'product_id')::uuid;
    IF v_product.id IS NULL OR v_product.vendor_id IS DISTINCT FROM p_vendor_id THEN
      RAISE EXCEPTION 'An item in your cart is no longer sold by this vendor';
    END IF;
    IF v_product.status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION '% is not available right now', v_product.name;
    END IF;
    IF v_product.track_stock AND v_quantity > v_product.stock_quantity THEN
      RAISE EXCEPTION 'Only % of % left. Reduce the quantity in your cart.', v_product.stock_quantity, v_product.name;
    END IF;

    v_total := v_total + v_product.price * v_quantity;
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cart_subtotal(UUID, JSONB) FROM PUBLIC, anon, authenticated;

-- ===================================================================
-- Stock moves with paid orders
-- ===================================================================

CREATE OR REPLACE FUNCTION public.adjust_stock_for_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sign INTEGER := 0;
BEGIN
  -- Paid while still pending: take the items out of stock
  IF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid' AND NEW.status = 'pending' THEN
    v_sign := -1;
  -- A paid order was cancelled or rejected: put them back
  ELSIF NEW.status IN ('cancelled', 'rejected') AND OLD.status NOT IN ('cancelled', 'rejected')
        AND OLD.payment_status = 'paid' THEN
    v_sign := 1;
  END IF;

  IF v_sign <> 0 THEN
    UPDATE public.products p
    SET stock_quantity = GREATEST(p.stock_quantity + v_sign * i.quantity, 0), updated_at = now()
    FROM (
      SELECT product_id, SUM(quantity)::integer AS quantity
      FROM public.order_items
      WHERE order_id = NEW.id AND product_id IS NOT NULL
      GROUP BY product_id
    ) i
    WHERE p.id = i.product_id AND p.track_stock;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS adjust_stock_for_order ON public.orders;
CREATE TRIGGER adjust_stock_for_order
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.adjust_stock_for_order();
