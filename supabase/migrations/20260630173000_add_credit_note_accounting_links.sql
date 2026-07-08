alter table public.credit_notes
add column if not exists accounting_informal_entry_id uuid,
add column if not exists accounting_journal_entry_id uuid;