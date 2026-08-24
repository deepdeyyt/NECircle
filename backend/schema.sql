-- NECircle Supabase schema
-- Paste this ENTIRE block into your Supabase SQL editor and run once.
-- Dashboard → SQL Editor → New query → paste → Run.

-- ============================================================
-- USERS (admin operators)
-- ============================================================
create table if not exists public.users (
    id uuid primary key default gen_random_uuid(),
    email text unique not null,
    password_hash text not null,
    role text not null default 'admin',
    created_at timestamptz not null default now()
);

-- ============================================================
-- TAGS (each sticker)
-- id is a zero-padded 5-digit string like '00001'
-- profile is a jsonb blob: { name, phone, type, note, vehicle_number, claimed_at }
-- ============================================================
create table if not exists public.tags (
    id text primary key,
    status text not null default 'unassigned',
    created_at timestamptz not null default now(),
    profile jsonb
);

create index if not exists tags_status_idx on public.tags (status);

-- ============================================================
-- ORDERS (customer purchases via Razorpay)
-- 1 order = 1 tag_id printed in 3 languages (₹99 per order)
-- ============================================================
create table if not exists public.orders (
    id uuid primary key default gen_random_uuid(),
    customer_name text not null,
    customer_phone text not null,
    address text not null,
    quantity int not null default 1,
    amount_paise int not null,
    status text not null default 'pending', -- pending | paid | failed
    razorpay_order_id text unique,
    razorpay_payment_id text,
    razorpay_signature text,
    tag_ids text[] default '{}',
    created_at timestamptz not null default now(),
    paid_at timestamptz
);

create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_razorpay_order_id_idx on public.orders (razorpay_order_id);

-- ============================================================
-- Row Level Security
-- All access happens through the FastAPI backend using the
-- service_role key, which bypasses RLS. To be safe we still
-- enable RLS and add NO permissive policies so anon calls fail.
-- ============================================================
alter table public.users   enable row level security;
alter table public.tags    enable row level security;
alter table public.orders  enable row level security;
