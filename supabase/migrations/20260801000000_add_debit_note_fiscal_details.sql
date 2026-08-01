alter table public.debit_notes
  add column if not exists concept text,
  add column if not exists due_date date,
  add column if not exists payment_condition text,
  add column if not exists external_reference text;

alter table public.debit_notes
  drop constraint if exists debit_notes_payment_condition_check;

alter table public.debit_notes
  add constraint debit_notes_payment_condition_check
  check (payment_condition is null or payment_condition in ('CASH', 'CURRENT_ACCOUNT'));

create table if not exists public.debit_note_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  debit_note_id uuid not null references public.debit_notes(id) on delete cascade,
  description text not null,
  quantity numeric not null check (quantity > 0),
  unit_price numeric not null check (unit_price >= 0),
  net_amount numeric not null check (net_amount >= 0),
  tax_amount numeric not null default 0 check (tax_amount >= 0),
  total_amount numeric not null check (total_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists debit_note_items_note_idx on public.debit_note_items(debit_note_id);

create table if not exists public.debit_note_item_taxes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  debit_note_id uuid not null references public.debit_notes(id) on delete cascade,
  debit_note_item_id uuid not null references public.debit_note_items(id) on delete cascade,
  tax_id uuid references public.taxes(id) on delete set null,
  name text not null,
  rate numeric not null default 0 check (rate >= 0),
  base_amount numeric not null default 0 check (base_amount >= 0),
  tax_amount numeric not null default 0 check (tax_amount >= 0),
  tax_code_snapshot text,
  created_at timestamptz not null default now()
);

create index if not exists debit_note_item_taxes_note_idx on public.debit_note_item_taxes(debit_note_id);
create index if not exists debit_note_item_taxes_item_idx on public.debit_note_item_taxes(debit_note_item_id);

create table if not exists public.debit_note_taxes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  debit_note_id uuid not null references public.debit_notes(id) on delete cascade,
  tax_id uuid references public.taxes(id) on delete set null,
  name text not null,
  rate numeric not null default 0 check (rate >= 0),
  base_amount numeric not null default 0 check (base_amount >= 0),
  tax_amount numeric not null default 0 check (tax_amount >= 0),
  tax_code_snapshot text,
  created_at timestamptz not null default now()
);

create index if not exists debit_note_taxes_note_idx on public.debit_note_taxes(debit_note_id);

alter table public.debit_note_items enable row level security;
alter table public.debit_note_item_taxes enable row level security;
alter table public.debit_note_taxes enable row level security;

create policy debit_note_items_org_member_access on public.debit_note_items
  for all using (exists (
    select 1 from public.organization_members om
    where om.organization_id = debit_note_items.organization_id and om.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.organization_members om
    where om.organization_id = debit_note_items.organization_id and om.user_id = auth.uid()
  ));

create policy debit_note_item_taxes_org_member_access on public.debit_note_item_taxes
  for all using (exists (
    select 1 from public.organization_members om
    where om.organization_id = debit_note_item_taxes.organization_id and om.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.organization_members om
    where om.organization_id = debit_note_item_taxes.organization_id and om.user_id = auth.uid()
  ));

create policy debit_note_taxes_org_member_access on public.debit_note_taxes
  for all using (exists (
    select 1 from public.organization_members om
    where om.organization_id = debit_note_taxes.organization_id and om.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.organization_members om
    where om.organization_id = debit_note_taxes.organization_id and om.user_id = auth.uid()
  ));
