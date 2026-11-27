-- Cotizaciones comerciales previas a la solicitud de aprobación.
-- Solo el backend autenticado usa service_role; no exponer borradores vía PostgREST.
create table if not exists public.sales_quote_client_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  customer_name_snapshot text not null,
  currency text not null check (currency in ('ARS', 'USD')),
  total_amount numeric not null default 0,
  quote_payload jsonb not null,
  pdf_html text not null,
  approval_request_id uuid references public.sales_quote_requests(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_quote_client_drafts_owner
  on public.sales_quote_client_drafts (organization_id, created_by, updated_at desc);

alter table public.sales_quote_client_drafts enable row level security;
revoke all on public.sales_quote_client_drafts from public, anon, authenticated;
grant select, insert, update, delete on public.sales_quote_client_drafts to service_role;
