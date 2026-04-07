-- ============================================================
-- Data Migration: Seed initial batches from existing stock
-- and link historical order_items to those batches.
--
-- Run this AFTER both:
--   1. supabase-product-batches.sql
--   2. supabase-price-to-batches.sql
--
-- What it does:
--   • Creates one batch per product using the product's current
--     quantity (stock) and price_per_liter as the unit price.
--   • The DB trigger fires on each insert and sets
--     products.quantity = SUM(quantity_litres) — same value, so
--     stock is preserved exactly.
--   • Links all existing order_items.batch_id to the batch for
--     their product (for traceability — no stock is re-deducted).
-- ============================================================

DO $$
DECLARE
  r          RECORD;
  v_batch_id uuid;
  v_today    text := to_char(now(), 'YYYYMMDD');
BEGIN
  FOR r IN
    SELECT id, quantity, price_per_liter, user_id
    FROM public.products
  LOOP
    -- Insert one "initial stock" batch for this product.
    -- number_of_bottles = 1, bottle_size_litres = GREATEST(quantity, 1)
    -- (bottle_size_litres has a > 0 constraint, so we use GREATEST).
    -- quantity_litres is the real stock number the trigger uses.
    INSERT INTO public.product_batches (
      product_id,
      batch_number,
      number_of_bottles,
      bottle_size_litres,
      unit_price,
      cost_price,
      quantity_litres,
      user_id,
      notes
    ) VALUES (
      r.id,
      'BATCH-' || v_today || '-001',
      1,
      GREATEST(r.quantity, 1),
      COALESCE(r.price_per_liter, 0),
      0,
      COALESCE(r.quantity, 0),
      r.user_id,
      'Initial stock — migrated from pre-batch inventory'
    )
    RETURNING id INTO v_batch_id;

    -- Link all order_items for this product to this batch.
    -- batch_id is nullable; only sets rows that aren't already linked.
    UPDATE public.order_items
    SET batch_id = v_batch_id
    WHERE product_id = r.id
      AND batch_id IS NULL;

  END LOOP;
END;
$$;

-- Drop price_per_liter from products now that prices live on batches.
-- Must run AFTER the DO block above so the value is already copied.
ALTER TABLE public.products DROP COLUMN IF EXISTS price_per_liter;
