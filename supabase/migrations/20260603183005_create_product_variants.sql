-- ============================================================
-- VAR-001: Create product_variants table and variant support columns
-- Idempotent: safe to run multiple times
-- ============================================================

create table if not exists public.product_variants (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  talle varchar(50) not null,
  color varchar(50) not null,
  lot_id uuid not null references public.product_lots(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_product_variants_product
  on public.product_variants(product_id);

create unique index if not exists idx_product_variants_unique
  on public.product_variants(product_id, talle, color);

alter table public.products
  add column if not exists has_variants boolean not null default false;

alter table public.sales_order_items
  add column if not exists product_variant_id uuid
  references public.product_variants(id);

alter table public.pos_sale_items
  add column if not exists product_variant_id uuid
  references public.product_variants(id);

do $$
begin
  alter table public.product_lots
    alter column expiration_date drop not null;
exception
  when others then null;
end $$;

-- ============================================================
-- RLs policies for product_variants
-- ============================================================

alter table public.product_variants enable row level security;

do $$
begin
  create policy "Org members can view product_variants"
    on public.product_variants for select
    using (exists (
      select 1 from public.organization_members
      where organization_members.organization_id = product_variants.organization_id
        and organization_members.user_id = auth.uid()
        and organization_members.is_active = true
    ));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "Org members can insert product_variants"
    on public.product_variants for insert
    with check (exists (
      select 1 from public.organization_members
      where organization_members.organization_id = product_variants.organization_id
        and organization_members.user_id = auth.uid()
        and organization_members.is_active = true
    ));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "Org members can update product_variants"
    on public.product_variants for update
    using (exists (
      select 1 from public.organization_members
      where organization_members.organization_id = product_variants.organization_id
        and organization_members.user_id = auth.uid()
        and organization_members.is_active = true
    ))
    with check (exists (
      select 1 from public.organization_members
      where organization_members.organization_id = product_variants.organization_id
        and organization_members.user_id = auth.uid()
        and organization_members.is_active = true
    ));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "Org members can delete product_variants"
    on public.product_variants for delete
    using (exists (
      select 1 from public.organization_members
      where organization_members.organization_id = product_variants.organization_id
        and organization_members.user_id = auth.uid()
        and organization_members.is_active = true
    ));
exception
  when duplicate_object then null;
end $$;
