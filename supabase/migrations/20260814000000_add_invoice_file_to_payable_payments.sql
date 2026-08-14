-- Optional supplier invoice PDF attached to a supplier payment
alter table public.payable_payments
  add column if not exists invoice_pdf_url text,
  add column if not exists invoice_filename text;

create index if not exists payable_payments_invoice_idx
  on public.payable_payments (organization_id, account_payable_id)
  where invoice_pdf_url is not null;
