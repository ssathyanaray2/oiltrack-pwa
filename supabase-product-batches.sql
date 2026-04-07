-- ============================================================
-- product_batches table
-- ============================================================
create table if not exists public.product_batches (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null references public.products(id) on delete cascade,
  batch_number       text not null,
  number_of_bottles  integer not null check (number_of_bottles >= 0),
  bottle_size_litres numeric(10,3) not null check (bottle_size_litres > 0),
  manufacture_date   date,
  expiry_date        date,
  notes              text,
  user_id            uuid references auth.users(id) on delete cascade,
  created_at         timestamptz not null default now(),
  constraint product_batches_batch_number_product_unique unique (product_id, batch_number)
);

create index if not exists product_batches_product_id_idx
  on public.product_batches(product_id);

-- ============================================================
-- Trigger: keep products.quantity = SUM(number_of_bottles * bottle_size_litres)
-- ============================================================
create or replace function sync_product_stock()
returns trigger language plpgsql as $$
declare
  v_product_id uuid;
  v_total      numeric;
begin
  v_product_id := coalesce(NEW.product_id, OLD.product_id);

  select coalesce(sum(number_of_bottles * bottle_size_litres), 0)
  into v_total
  from public.product_batches
  where product_id = v_product_id;

  update public.products
  set quantity = v_total
  where id = v_product_id;

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_sync_product_stock on public.product_batches;
create trigger trg_sync_product_stock
after insert or update or delete
on public.product_batches
for each row execute function sync_product_stock();

-- ============================================================
-- RLS
-- ============================================================
alter table public.product_batches enable row level security;

create policy "Users manage own batches"
on public.product_batches
for all
using  (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- ============================================================
-- Phase 2 stub: link order_items to a specific batch
-- Nullable — no UI yet. on delete set null so deleting a batch
-- never breaks existing order history.
-- ============================================================
alter table public.order_items
  add column if not exists batch_id uuid
  references public.product_batches(id) on delete set null;
