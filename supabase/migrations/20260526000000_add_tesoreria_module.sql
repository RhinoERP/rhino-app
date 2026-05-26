-- ============================================================
-- MÓDULO TESORERÍA — Cuentas bancarias, movimientos y cheques
-- ============================================================

-- 1. Cuentas bancarias
create table if not exists public.bank_accounts (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  name            text        not null,           -- "ICBC Pesos"
  bank_name       text        not null,           -- "ICBC"
  account_number  text,
  currency        text        not null default 'ARS',
  current_balance numeric(15,2) not null default 0,
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now()
);

alter table public.bank_accounts enable row level security;

create policy "org members can read bank_accounts"
  on public.bank_accounts for select
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid()
    )
  );

create policy "org admins can manage bank_accounts"
  on public.bank_accounts for all
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- 2. Movimientos bancarios (débitos, créditos, ajustes)
create table if not exists public.bank_movements (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  uuid        not null references public.organizations(id) on delete cascade,
  bank_account_id  uuid        not null references public.bank_accounts(id) on delete cascade,
  movement_type    text        not null check (
    movement_type in (
      'debit',               -- Débito bancario
      'credit',              -- Crédito bancario
      'adjustment_positive', -- Ajuste positivo
      'adjustment_negative', -- Ajuste negativo
      'rejected_check'       -- Cheque rechazado
    )
  ),
  concept          text        not null,
  amount           numeric(15,2) not null check (amount > 0),
  movement_date    date        not null,
  -- Cuenta contable destino (regla: retenciones bancarias → Gastos Bancarios)
  accounting_account_code  text,   -- "5.1.01"
  accounting_account_name  text,   -- "Gastos Bancarios"
  notes            text,
  created_by       uuid        references auth.users(id),
  created_at       timestamptz not null default now()
);

alter table public.bank_movements enable row level security;

create policy "org members can read bank_movements"
  on public.bank_movements for select
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid()
    )
  );

create policy "org members can insert bank_movements"
  on public.bank_movements for insert
  with check (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid()
    )
  );

create policy "org admins can delete bank_movements"
  on public.bank_movements for delete
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

create index idx_bank_movements_org_date
  on public.bank_movements(organization_id, movement_date desc);

-- 3. Cheques propios emitidos
create table if not exists public.issued_checks (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  uuid        not null references public.organizations(id) on delete cascade,
  bank_account_id  uuid        not null references public.bank_accounts(id) on delete cascade,
  check_number     text        not null,
  payee            text        not null,   -- Proveedor / beneficiario
  issue_date       date        not null,
  payment_date     date        not null,   -- Fecha en que el banco lo debita
  amount           numeric(15,2) not null check (amount > 0),
  status           text        not null default 'pending' check (
    status in (
      'pending',    -- Sin debitar
      'debited',    -- Debitado
      'exchanged',  -- Canjeado
      'overdue'     -- Vencido (+30 días de payment_date sin debitarse)
    )
  ),
  notes            text,
  created_at       timestamptz not null default now()
);

alter table public.issued_checks enable row level security;

create policy "org members can read issued_checks"
  on public.issued_checks for select
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid()
    )
  );

create policy "org members can manage issued_checks"
  on public.issued_checks for all
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid()
    )
  );

create index idx_issued_checks_org_payment_date
  on public.issued_checks(organization_id, payment_date);

-- 4. Seed: cuenta bancaria por defecto para orgs existentes
-- (No se ejecuta automáticamente, es referencial)

-- 5. Permiso treasury.read en roles existentes
-- Se agrega a los roles que ya tienen finances.read
insert into public.role_permissions (role_id, permission)
select rp.role_id, 'treasury.read'
from public.role_permissions rp
where rp.permission = 'finances.read'
on conflict do nothing;

insert into public.role_permissions (role_id, permission)
select rp.role_id, 'treasury.write'
from public.role_permissions rp
where rp.permission = 'finances.read'
on conflict do nothing;
