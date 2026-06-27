alter table public.purchase_orders
  add column if not exists accounting_informal_entry_id uuid,
  add column if not exists accounting_journal_entry_id uuid;

alter table public.receivable_payments
  add column if not exists accounting_informal_entry_id uuid,
  add column if not exists accounting_journal_entry_id uuid;

alter table public.payable_payments
  add column if not exists accounting_informal_entry_id uuid,
  add column if not exists accounting_journal_entry_id uuid;

alter table public.credit_notes
  add column if not exists accounting_informal_entry_id uuid,
  add column if not exists accounting_journal_entry_id uuid;

create index if not exists idx_purchase_orders_accounting_informal_entry
  on public.purchase_orders(accounting_informal_entry_id)
  where accounting_informal_entry_id is not null;

create index if not exists idx_purchase_orders_accounting_journal_entry
  on public.purchase_orders(accounting_journal_entry_id)
  where accounting_journal_entry_id is not null;

create index if not exists idx_receivable_payments_accounting_informal_entry
  on public.receivable_payments(accounting_informal_entry_id)
  where accounting_informal_entry_id is not null;

create index if not exists idx_receivable_payments_accounting_journal_entry
  on public.receivable_payments(accounting_journal_entry_id)
  where accounting_journal_entry_id is not null;

create index if not exists idx_payable_payments_accounting_informal_entry
  on public.payable_payments(accounting_informal_entry_id)
  where accounting_informal_entry_id is not null;

create index if not exists idx_payable_payments_accounting_journal_entry
  on public.payable_payments(accounting_journal_entry_id)
  where accounting_journal_entry_id is not null;

create index if not exists idx_credit_notes_accounting_informal_entry
  on public.credit_notes(accounting_informal_entry_id)
  where accounting_informal_entry_id is not null;

create index if not exists idx_credit_notes_accounting_journal_entry
  on public.credit_notes(accounting_journal_entry_id)
  where accounting_journal_entry_id is not null;
