create table if not exists public.accounting_pending_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_table text not null,
  source_id uuid not null,
  event_type text not null,
  payload jsonb not null,
  error_message text,
  status text not null default 'PENDING' check (status in ('PENDING', 'RESOLVED', 'CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_accounting_pending_events_org_status
on public.accounting_pending_events (organization_id, status);

create unique index if not exists idx_accounting_pending_events_source_event_pending
on public.accounting_pending_events (organization_id, source_table, source_id, event_type)
where status = 'PENDING';
