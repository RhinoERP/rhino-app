create table if not exists public.product_tax_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  tax_id uuid not null references public.taxes(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_tax_assignments_unique unique (organization_id, product_id, tax_id)
);

create index if not exists product_tax_assignments_product_idx
on public.product_tax_assignments(product_id);

create index if not exists product_tax_assignments_tax_idx
on public.product_tax_assignments(tax_id);

create or replace function public.validate_single_product_iva_tax()
returns trigger
language plpgsql
as $$
declare
  iva_count integer;
begin
  select count(*)
    into iva_count
  from public.product_tax_assignments pta
  join public.taxes t on t.id = pta.tax_id
  where pta.organization_id = new.organization_id
    and pta.product_id = new.product_id
    and upper(coalesce(t.code, '')) like 'IVA_%';

  if iva_count > 1 then
    raise exception 'Un producto no puede tener más de una alícuota IVA asignada.';
  end if;

  return new;
end;
$$;

drop trigger if exists product_tax_assignments_single_iva
on public.product_tax_assignments;
create constraint trigger product_tax_assignments_single_iva
after insert or update on public.product_tax_assignments
deferrable initially deferred
for each row
execute function public.validate_single_product_iva_tax();

create table if not exists public.sales_order_item_taxes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sales_order_id uuid not null references public.sales_orders(id) on delete cascade,
  sales_order_item_id uuid not null references public.sales_order_items(id) on delete cascade,
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

create index if not exists sales_order_item_taxes_order_idx
on public.sales_order_item_taxes(sales_order_id);

create index if not exists sales_order_item_taxes_item_idx
on public.sales_order_item_taxes(sales_order_item_id);

create table if not exists public.pos_sale_item_taxes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pos_sale_id uuid not null references public.pos_sales(id) on delete cascade,
  pos_sale_item_id uuid not null references public.pos_sale_items(id) on delete cascade,
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

create index if not exists pos_sale_item_taxes_sale_idx
on public.pos_sale_item_taxes(pos_sale_id);

create index if not exists pos_sale_item_taxes_item_idx
on public.pos_sale_item_taxes(pos_sale_item_id);

create table if not exists public.credit_note_item_taxes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  credit_note_id uuid not null references public.credit_notes(id) on delete cascade,
  credit_note_item_id uuid not null references public.credit_note_items(id) on delete cascade,
  sales_order_item_id uuid references public.sales_order_items(id) on delete set null,
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

create index if not exists credit_note_item_taxes_credit_note_idx
on public.credit_note_item_taxes(credit_note_id);

create index if not exists credit_note_item_taxes_item_idx
on public.credit_note_item_taxes(credit_note_item_id);

alter table public.product_tax_assignments enable row level security;
alter table public.sales_order_item_taxes enable row level security;
alter table public.pos_sale_item_taxes enable row level security;
alter table public.credit_note_item_taxes enable row level security;

drop policy if exists "Organization members can manage product tax assignments"
on public.product_tax_assignments;
create policy "Organization members can manage product tax assignments"
on public.product_tax_assignments
for all
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = product_tax_assignments.organization_id
      and om.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = product_tax_assignments.organization_id
      and om.user_id = auth.uid()
  )
);

drop policy if exists "Organization members can manage sales order item taxes"
on public.sales_order_item_taxes;
create policy "Organization members can manage sales order item taxes"
on public.sales_order_item_taxes
for all
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = sales_order_item_taxes.organization_id
      and om.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = sales_order_item_taxes.organization_id
      and om.user_id = auth.uid()
  )
);

drop policy if exists "Organization members can manage pos sale item taxes"
on public.pos_sale_item_taxes;
create policy "Organization members can manage pos sale item taxes"
on public.pos_sale_item_taxes
for all
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = pos_sale_item_taxes.organization_id
      and om.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = pos_sale_item_taxes.organization_id
      and om.user_id = auth.uid()
  )
);

drop policy if exists "Organization members can manage credit note item taxes"
on public.credit_note_item_taxes;
create policy "Organization members can manage credit note item taxes"
on public.credit_note_item_taxes
for all
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = credit_note_item_taxes.organization_id
      and om.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = credit_note_item_taxes.organization_id
      and om.user_id = auth.uid()
  )
);
