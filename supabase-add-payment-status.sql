-- Run this in Supabase SQL Editor if your orders table doesn't have payment_status yet.
-- The app uses it for Paid / Unpaid / Partial.

alter table orders
  add column if not exists payment_status text not null default 'Unpaid'
  check (payment_status in ('Paid', 'Unpaid', 'Partial'));
