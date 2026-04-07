-- ============================================================
-- Switch stock tracking from quantity_litres → number_of_bottles
--
-- After this migration:
--   products.quantity = total bottles in stock (sum of batch bottles)
--   quantity_litres on batches = informational only
--
-- Run this in Supabase SQL Editor.
-- ============================================================

-- Update the trigger to sum number_of_bottles instead of quantity_litres
CREATE OR REPLACE FUNCTION sync_product_stock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_product_id uuid;
  v_total      numeric;
BEGIN
  v_product_id := COALESCE(NEW.product_id, OLD.product_id);

  SELECT COALESCE(SUM(number_of_bottles), 0)
  INTO v_total
  FROM public.product_batches
  WHERE product_id = v_product_id;

  UPDATE public.products
  SET quantity = v_total
  WHERE id = v_product_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Recalculate products.quantity for all existing products
-- (sets each product's stock = sum of its current batch bottle counts)
UPDATE public.products p
SET quantity = (
  SELECT COALESCE(SUM(pb.number_of_bottles), 0)
  FROM public.product_batches pb
  WHERE pb.product_id = p.id
);
