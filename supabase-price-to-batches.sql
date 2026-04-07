-- ============================================================
-- Move unit_price + cost_price from products → product_batches
-- Add quantity_litres to product_batches for stock tracking
-- ============================================================

-- Step 1: Add new columns to product_batches
ALTER TABLE public.product_batches
  ADD COLUMN IF NOT EXISTS unit_price  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_price  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quantity_litres numeric NOT NULL DEFAULT 0;

-- Step 2: Update the stock-sync trigger to use quantity_litres
-- (replaces the trigger created in supabase-product-batches.sql)
CREATE OR REPLACE FUNCTION sync_product_stock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_product_id uuid;
  v_total      numeric;
BEGIN
  v_product_id := COALESCE(NEW.product_id, OLD.product_id);

  SELECT COALESCE(SUM(quantity_litres), 0)
  INTO v_total
  FROM public.product_batches
  WHERE product_id = v_product_id;

  UPDATE public.products
  SET quantity = v_total
  WHERE id = v_product_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Step 3: Drop price columns from products
ALTER TABLE public.products DROP COLUMN IF EXISTS unit_price;
ALTER TABLE public.products DROP COLUMN IF EXISTS cost_price;
