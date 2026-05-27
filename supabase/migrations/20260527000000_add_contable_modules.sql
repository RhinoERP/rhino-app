-- ============================================================
-- MÓDULOS CONTABLES — Artículos + Compras + Ventas Anticipo
-- ============================================================

-- ============================================================
-- 1. ARTÍCULOS: toggles de flujo + vinculación contable
-- ============================================================
alter table public.products
  add column if not exists can_sell    boolean not null default true,
  add column if not exists can_buy     boolean not null default true,
  add column if not exists can_produce boolean not null default false,
  add column if not exists accounting_account_code text,
  add column if not exists accounting_account_name text;

comment on column public.products.can_sell    is 'Habilitado para ser vendido';
comment on column public.products.can_buy     is 'Habilitado para ser comprado';
comment on column public.products.can_produce is 'Habilitado para producción';
comment on column public.products.accounting_account_code is 'Código de cuenta contable asociada (ej: 1.1.04 Mercadería)';
comment on column public.products.accounting_account_name is 'Nombre de la cuenta contable asociada';

-- ============================================================
-- 2. COMPRAS: Órdenes de Pago (Paso 3 del flujo de mercadería)
-- ============================================================
create table if not exists public.payment_orders (
  id                uuid          primary key default gen_random_uuid(),
  organization_id   uuid          not null references public.organizations(id) on delete cascade,
  supplier_id       uuid          not null references public.suppliers(id),
  payment_number    serial,
  payment_date      date          not null default current_date,
  total_amount      numeric(15,2) not null check (total_amount > 0),
  status            text          not null default 'pending' check (
    status in ('pending', 'confirmed', 'cancelled')
  ),
  notes             text,
  created_by        uuid          references auth.users(id),
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now()
);

-- Líneas: facturas que se cancelan con esta orden de pago
create table if not exists public.payment_order_invoices (
  id                uuid          primary key default gen_random_uuid(),
  payment_order_id  uuid          not null references public.payment_orders(id) on delete cascade,
  purchase_order_id uuid          not null references public.purchase_orders(id),
  amount_applied    numeric(15,2) not null check (amount_applied > 0),
  created_at        timestamptz   not null default now()
);

-- Líneas: métodos de pago usados en la orden
create table if not exists public.payment_order_methods (
  id                uuid          primary key default gen_random_uuid(),
  payment_order_id  uuid          not null references public.payment_orders(id) on delete cascade,
  method_type       text          not null check (
    method_type in (
      'transfer',       -- Transferencia bancaria
      'check',          -- Cheque propio
      'retention_iibb', -- Retención IIBB
      'retention_gcias',-- Retención Gcias
      'retention_suss', -- Retención SUSS
      'cash'            -- Efectivo
    )
  ),
  amount            numeric(15,2) not null check (amount > 0),
  reference         text,         -- Nro cheque / referencia transferencia
  bank_name         text,
  due_date          date,         -- Fecha de acreditación (cheques)
  created_at        timestamptz   not null default now()
);

alter table public.payment_orders        enable row level security;
alter table public.payment_order_invoices enable row level security;
alter table public.payment_order_methods  enable row level security;

create policy "org members can manage payment_orders"
  on public.payment_orders for all
  using (organization_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and is_active = true
  ));

create policy "org members can manage payment_order_invoices"
  on public.payment_order_invoices for all
  using (payment_order_id in (
    select id from public.payment_orders po
    where po.organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and is_active = true
    )
  ));

create policy "org members can manage payment_order_methods"
  on public.payment_order_methods for all
  using (payment_order_id in (
    select id from public.payment_orders po
    where po.organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and is_active = true
    )
  ));

create index if not exists idx_payment_orders_org_supplier
  on public.payment_orders(organization_id, supplier_id);
create index if not exists idx_payment_orders_org_date
  on public.payment_orders(organization_id, payment_date desc);

-- ============================================================
-- 3. VENTAS: Anticipos 50%
-- ============================================================
create table if not exists public.sale_advances (
  id                uuid          primary key default gen_random_uuid(),
  organization_id   uuid          not null references public.organizations(id) on delete cascade,
  sale_id           uuid          references public.sales(id),        -- venta asociada (si existe)
  quote_id          uuid,                                              -- presupuesto/pedido asociado
  description       text          not null,                           -- "50% anticipo OC X"
  net_amount        numeric(15,2) not null check (net_amount > 0),
  tax_amount        numeric(15,2) not null default 0,
  total_amount      numeric(15,2) not null check (total_amount > 0),
  status            text          not null default 'pending' check (
    status in (
      'pending',    -- Emitida, sin cobrar
      'collected',  -- Cobrada (recibo generado)
      'credited'    -- Acreditada con NC (cerrada)
    )
  ),
  credit_note_id    uuid,         -- NC generada al cerrar
  advance_number    serial,
  issued_at         date          not null default current_date,
  created_by        uuid          references auth.users(id),
  created_at        timestamptz   not null default now()
);

-- Recibos de cobro del anticipo
create table if not exists public.advance_receipts (
  id                uuid          primary key default gen_random_uuid(),
  organization_id   uuid          not null references public.organizations(id) on delete cascade,
  advance_id        uuid          not null references public.sale_advances(id) on delete cascade,
  receipt_number    serial,
  total_amount      numeric(15,2) not null,
  collected_at      date          not null default current_date,
  notes             text,
  created_at        timestamptz   not null default now()
);

-- Líneas del recibo: métodos de cobro + retenciones
create table if not exists public.advance_receipt_items (
  id                uuid          primary key default gen_random_uuid(),
  receipt_id        uuid          not null references public.advance_receipts(id) on delete cascade,
  item_type         text          not null check (
    item_type in (
      'check_third',    -- Cheque de tercero
      'transfer',       -- Transferencia
      'retention_iibb', -- Retención IIBB sufrida
      'retention_gcias',-- Retención Gcias sufrida
      'cash'
    )
  ),
  amount            numeric(15,2) not null,  -- positivo = cobro, negativo = retención
  reference         text,
  bank_name         text,
  due_date          date,
  created_at        timestamptz   not null default now()
);

alter table public.sale_advances         enable row level security;
alter table public.advance_receipts      enable row level security;
alter table public.advance_receipt_items enable row level security;

create policy "org members can manage sale_advances"
  on public.sale_advances for all
  using (organization_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and is_active = true
  ));

create policy "org members can manage advance_receipts"
  on public.advance_receipts for all
  using (organization_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and is_active = true
  ));

create policy "org members can manage advance_receipt_items"
  on public.advance_receipt_items for all
  using (receipt_id in (
    select ar.id from public.advance_receipts ar
    join public.sale_advances sa on sa.id = ar.advance_id
    where sa.organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and is_active = true
    )
  ));

create index if not exists idx_sale_advances_org
  on public.sale_advances(organization_id, status);
