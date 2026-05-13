alter table public.sales_orders
add column if not exists invoice_email_status text not null default 'not_sent',
add column if not exists invoice_email_resend_id text,
add column if not exists invoice_email_recipient text,
add column if not exists invoice_email_sent_at timestamptz,
add column if not exists invoice_email_delivered_at timestamptz,
add column if not exists invoice_email_last_attempt_at timestamptz,
add column if not exists invoice_email_last_event text,
add column if not exists invoice_email_last_event_at timestamptz,
add column if not exists invoice_email_last_error text;

alter table public.sales_orders
drop constraint if exists sales_orders_invoice_email_status_check;

alter table public.sales_orders
add constraint sales_orders_invoice_email_status_check
check (
  invoice_email_status in (
    'not_sent',
    'pending',
    'sent',
    'delivered',
    'delivery_delayed',
    'bounced',
    'complained',
    'failed'
  )
);

create index if not exists sales_orders_invoice_email_resend_id_idx
on public.sales_orders(invoice_email_resend_id)
where invoice_email_resend_id is not null;
