-- Run this in Supabase SQL Editor to create tables for the oil distribution PWA.
-- Uses uuid primary keys and snake_case columns.

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stock integer not null default 0,
  unit text not null default 'Liters',
  low_stock_threshold integer not null default 200,
  price_per_liter numeric not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  address text not null,
  email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  date date not null default current_date,
  status text not null default 'Pending' check (status in ('Pending', 'Delivered', 'Cancelled')),
  payment_status text not null default 'Unpaid' check (payment_status in ('Paid', 'Unpaid', 'Partial')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  created_at timestamptz default now()
);

-- Optional: enable RLS and add policies for authenticated users, or leave open for anon key.
-- alter table public.products enable row level security;
-- alter table public.customers enable row level security;
-- alter table public.orders enable row level security;
-- alter table public.order_items enable row level security;
