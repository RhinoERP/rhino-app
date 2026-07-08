alter table public.receivable_payments
add column if not exists accounting_informal_entry_id uuid,
add column if not exists accounting_journal_entry_id uuid;

alter table public.payable_payments
add column if not exists accounting_informal_entry_id uuid,
add column if not exists accounting_journal_entry_id uuid;