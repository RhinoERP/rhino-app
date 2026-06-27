alter table public.purchase_order_taxes
  add column if not exists tax_code_snapshot text;

alter table public.sales_order_items
  add column if not exists accounting_concept_code text,
  add column if not exists accounting_account_code_snapshot text;

alter table public.credit_note_items
  add column if not exists accounting_concept_code text,
  add column if not exists accounting_account_code_snapshot text;

insert into accounting.accounting_rule_lines
  (rule_id, account_code, lado, formula, es_seleccionable, opciones_cuenta)
select
  rule.id,
  'PERCEPCIONES_IIBB',
  'HABER',
  'datos.montoIIBB',
  false,
  null
from accounting.accounting_rules rule
where rule.tipo_evento = 'NC_COMPRA'
  and rule.activa = true
  and not exists (
    select 1
    from accounting.accounting_rule_lines line
    where line.rule_id = rule.id
      and line.account_code = 'PERCEPCIONES_IIBB'
      and line.lado = 'HABER'
      and line.formula = 'datos.montoIIBB'
  );