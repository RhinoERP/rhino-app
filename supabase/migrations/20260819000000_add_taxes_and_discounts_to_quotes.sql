-- Quotes: tax snapshots + discount/total columns
-- Mirrors sales_order_taxes / sales_order_item_taxes so presupuestos behave
-- exactly like preventa regarding taxes and discounts.

-- 1. Header-level tax snapshots per quote
create table if not exists public.quote_taxes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  tax_id uuid references public.taxes(id) on delete set null,
  name text not null,
  rate numeric not null default 0,
  base_amount numeric not null default 0,
  tax_amount numeric not null default 0,
  tax_code_snapshot text,
  created_at timestamptz not null default now()
);

create index if not exists quote_taxes_quote_idx
on public.quote_taxes(quote_id);

-- 2. Per-line tax snapshots (one row per quote_items row)
create table if not exists public.quote_item_taxes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  quote_item_id uuid not null references public.quote_items(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  tax_id uuid references public.taxes(id) on delete set null,
  name text not null,
  rate numeric not null default 0,
  base_amount numeric not null default 0,
  tax_amount numeric not null default 0,
  tax_code_snapshot text,
  source text not null default 'product',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quote_item_taxes_quote_idx
on public.quote_item_taxes(quote_id);

create index if not exists quote_item_taxes_item_idx
on public.quote_item_taxes(quote_item_id);

-- 3. Total breakdown columns on quotes header
alter table public.quotes
  add column if not exists sub_total numeric,
  add column if not exists total_tax_amount numeric,
  add column if not exists global_discount_percentage numeric,
  add column if not exists global_discount_amount numeric;

-- 4. RLS
alter table public.quote_taxes enable row level security;
alter table public.quote_item_taxes enable row level security;

drop policy if exists "Organization members can manage quote taxes"
on public.quote_taxes;
create policy "Organization members can manage quote taxes"
on public.quote_taxes
for all
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = quote_taxes.organization_id
      and om.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = quote_taxes.organization_id
      and om.user_id = auth.uid()
  )
);

drop policy if exists "Organization members can manage quote item taxes"
on public.quote_item_taxes;
create policy "Organization members can manage quote item taxes"
on public.quote_item_taxes
for all
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = quote_item_taxes.organization_id
      and om.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = quote_item_taxes.organization_id
      and om.user_id = auth.uid()
  )
);