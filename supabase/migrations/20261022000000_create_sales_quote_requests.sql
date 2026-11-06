create table public.sales_quote_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  seller_user_id uuid references auth.users(id) on delete set null,
  seller_name_snapshot text,
  seller_zone_snapshot text,
  customer_segment text not null check (
    customer_segment in ('ACTIVE', 'NEW', 'REACTIVATED')
  ),
  status text not null default 'DRAFT' check (
    status in (
      'DRAFT', 'PENDING_APPROVAL', 'RETURNED', 'APPROVED',
      'REJECTED', 'CONVERTED', 'CANCELLED'
    )
  ),
  currency text not null default 'ARS',
  payment_method text,
  payment_term text,
  invoice_type text,
  subtotal_amount numeric not null default 0 check (subtotal_amount >= 0),
  tax_amount numeric not null default 0 check (tax_amount >= 0),
  total_amount numeric not null default 0 check (total_amount >= 0),
  seller_observations text,
  review_comment text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  sales_order_id uuid unique references public.sales_orders(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_quote_requests_converted_order_check check (
    (status = 'CONVERTED' and sales_order_id is not null)
    or (status <> 'CONVERTED' and sales_order_id is null)
  )
);

create index sales_quote_requests_org_status_created_idx
  on public.sales_quote_requests (organization_id, status, created_at desc);
create index sales_quote_requests_creator_created_idx
  on public.sales_quote_requests (created_by, created_at desc);

create table public.sales_quote_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.sales_quote_requests(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  line_number integer not null check (line_number > 0),
  product_id uuid not null references public.products(id) on delete restrict,
  product_variant_id uuid references public.product_variants(id) on delete set null,
  product_name_snapshot text not null,
  sku_snapshot text,
  unit_of_measure_snapshot text,
  quantity numeric not null check (quantity > 0),
  base_unit_price numeric not null check (base_unit_price >= 0),
  competitor_unit_price numeric not null check (competitor_unit_price >= 0),
  agreed_unit_price numeric not null check (agreed_unit_price >= 0),
  discount_percentage numeric not null default 0 check (
    discount_percentage >= 0 and discount_percentage <= 100
  ),
  discount_amount numeric not null default 0 check (discount_amount >= 0),
  price_increase_amount numeric not null default 0 check (price_increase_amount >= 0),
  adjustment_type text not null default 'NONE' check (
    adjustment_type in ('NONE', 'DISCOUNT', 'PRICE_OVERRIDE')
  ),
  unit_cost_snapshot numeric check (unit_cost_snapshot is null or unit_cost_snapshot >= 0),
  line_subtotal numeric not null check (line_subtotal >= 0),
  taxes_snapshot jsonb not null default '[]'::jsonb check (
    jsonb_typeof(taxes_snapshot) = 'array'
  ),
  product_comment text,
  created_at timestamptz not null default now(),
  unique (request_id, line_number)
);

create index sales_quote_request_items_request_idx
  on public.sales_quote_request_items (request_id, line_number);

alter table public.sales_quote_requests enable row level security;
alter table public.sales_quote_request_items enable row level security;

create policy "Sales quote request members can read permitted requests"
  on public.sales_quote_requests for select to authenticated
  using (
    public.user_has_org_permission('organization.admin', organization_id)
    or public.user_has_org_permission('sales.read.all', organization_id)
    or public.user_has_org_permission('sales.manage.all', organization_id)
    or (
      created_by = auth.uid()
      and (
        public.user_has_org_permission('sales.read', organization_id)
        or public.user_has_org_permission('sales.manage', organization_id)
      )
    )
  );

create policy "Sales managers can create their own quote requests"
  on public.sales_quote_requests for insert to authenticated
  with check (
    created_by = auth.uid()
    and status = 'DRAFT'
    and (
      public.user_has_org_permission('organization.admin', organization_id)
      or public.user_has_org_permission('sales.manage', organization_id)
      or public.user_has_org_permission('sales.manage.all', organization_id)
    )
  );

create policy "Sales quote request items are visible with their parent request"
  on public.sales_quote_request_items for select to authenticated
  using (
    exists (
      select 1 from public.sales_quote_requests r
      where r.id = sales_quote_request_items.request_id
        and r.organization_id = sales_quote_request_items.organization_id
    )
  );

create policy "Sales managers can add lines to their own draft requests"
  on public.sales_quote_request_items for insert to authenticated
  with check (
    exists (
      select 1 from public.sales_quote_requests r
      where r.id = sales_quote_request_items.request_id
        and r.organization_id = sales_quote_request_items.organization_id
        and r.created_by = auth.uid()
        and r.status = 'DRAFT'
        and (
          public.user_has_org_permission('organization.admin', organization_id)
          or public.user_has_org_permission('sales.manage', organization_id)
          or public.user_has_org_permission('sales.manage.all', organization_id)
        )
    )
  );
