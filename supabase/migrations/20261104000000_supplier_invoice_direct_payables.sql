-- Additive transition. No historical debt is created, split, revalued or reset.
begin;

-- SQL Editor retries are no-ops after a complete atomic application. A partial
-- or unrelated schema without the private marker is never silently adopted.
do $ap_invoice_migration$
declare already_applied boolean; legacy_definition text;
  financial_before jsonb:='{}'; financial_after jsonb:='{}'; relation_name text; fingerprint text;
begin
  if to_regclass('ap_invoice_internal.schema_versions') is not null then
    execute 'select exists(select 1 from ap_invoice_internal.schema_versions where version=''20261104000000'')'
      into already_applied;
    if already_applied then
      if to_regclass('public.supplier_invoice_purchase_orders') is null
        or to_regclass('public.purchase_order_invoice_currencies') is null
        or to_regprocedure('public.create_supplier_invoice_with_payable(uuid,jsonb,uuid[])') is null then
        raise exception 'Migration marker exists but schema is incomplete: review before retry';
      end if;
      return;
    end if;
  end if;
  legacy_definition:=pg_get_functiondef('public.reconcile_purchase_payable_from_invoices(uuid)'::regprocedure);
  -- Freeze historical financial records while classifying metadata. Unknown
  -- deployment triggers must not rewrite debt or emit accounting during DDL.
  lock table public.supplier_invoices,public.accounts_payable,public.payable_payments,
    public.supplier_credits,public.supplier_credit_applications in share row exclusive mode;
  foreach relation_name in array array['public.accounts_payable','public.payable_payments',
    'public.supplier_credits','public.supplier_credit_applications','accounting.journal_entries',
    'accounting.informal_entries','accounting.accounting_pending_events','public.accounting_pending_events'] loop
    if to_regclass(relation_name) is not null then
      execute format('lock table %s in share row exclusive mode',to_regclass(relation_name));
      execute format('select md5(coalesce(string_agg(md5((to_jsonb(r)%s)::text),'''' order by r.id),'''')) from %s r',
        case when relation_name='public.accounts_payable' then ' - ''supplier_invoice_id''' else '' end,
        to_regclass(relation_name)) into fingerprint;
      financial_before:=financial_before || jsonb_build_object(relation_name,fingerprint);
    end if;
  end loop;

alter table public.supplier_invoices
  add column payable_model text not null default 'UNRESOLVED'
    check (payable_model in ('UNRESOLVED', 'LEGACY_OC', 'INVOICE')),
  add column legacy_account_payable_id uuid references public.accounts_payable(id) on delete set null;
alter table public.accounts_payable
  alter column purchase_order_id drop not null,
  add column supplier_invoice_id uuid references public.supplier_invoices(id) on delete restrict,
  add constraint accounts_payable_single_origin check (
    supplier_invoice_id is null or purchase_order_id is null),
  add constraint accounts_payable_direct_balance check (supplier_invoice_id is null or
    (pending_balance is not null and total_amount is not null and pending_balance>=0 and pending_balance<=total_amount));
create unique index accounts_payable_supplier_invoice_unique
  on public.accounts_payable(supplier_invoice_id) where supplier_invoice_id is not null;

-- A legacy OC can have only one represented AP; do not guess between duplicates.
do $$ begin
  if exists (select 1 from public.supplier_invoices i
    left join public.suppliers s on s.id=i.supplier_id
    left join public.purchase_orders o on o.id=i.purchase_order_id
    where s.organization_id is distinct from i.organization_id
      or (i.purchase_order_id is not null and (o.organization_id is distinct from i.organization_id
        or o.supplier_id is distinct from i.supplier_id)))
    or exists (select 1 from public.accounts_payable a left join public.purchase_orders o on o.id=a.purchase_order_id
      where a.purchase_order_id is not null and (o.organization_id is distinct from a.organization_id
        or o.supplier_id is distinct from a.supplier_id)) then
    raise exception 'Inconsistent historical tenant/supplier relationships: review preflight';
  end if;
  if exists (select 1 from public.accounts_payable where purchase_order_id is not null
    group by purchase_order_id having count(*) > 1) then
    raise exception 'Duplicate legacy AP per OC: resolve preflight before migration';
  end if;
  if exists(select 1 from public.supplier_invoices where status='REGISTERED' and purchase_order_id is not null
    group by purchase_order_id having count(distinct currency)>1) then
    raise exception 'Mixed historical billing currencies per OC: review preflight';
  end if;
end $$;
create unique index accounts_payable_legacy_order_unique on public.accounts_payable(purchase_order_id)
  where supplier_invoice_id is null and purchase_order_id is not null;
update public.supplier_invoices i set payable_model = 'LEGACY_OC',
  legacy_account_payable_id = (select a.id from public.accounts_payable a
    where a.purchase_order_id = i.purchase_order_id
      and a.organization_id = i.organization_id and a.supplier_id = i.supplier_id)
where i.purchase_order_id is not null;

create table public.supplier_invoice_purchase_orders (
  organization_id uuid not null references public.organizations(id),
  supplier_invoice_id uuid not null references public.supplier_invoices(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  primary key (supplier_invoice_id, purchase_order_id)
);
create index supplier_invoice_purchase_orders_order_idx
  on public.supplier_invoice_purchase_orders(purchase_order_id, supplier_invoice_id);
insert into public.supplier_invoice_purchase_orders
  (organization_id, supplier_invoice_id, purchase_order_id, created_by)
select organization_id, id, purchase_order_id, created_by
from public.supplier_invoices where purchase_order_id is not null;
alter table public.supplier_invoice_purchase_orders enable row level security;
create policy supplier_invoice_orders_read on public.supplier_invoice_purchase_orders
  for select to authenticated using (exists (select 1 from public.supplier_invoices i
    where i.id = supplier_invoice_id and i.organization_id = supplier_invoice_purchase_orders.organization_id
      and public.can_read_supplier_invoice(i.organization_id, i.created_by)));
revoke all on public.supplier_invoice_purchase_orders from public, anon, authenticated;
grant select on public.supplier_invoice_purchase_orders to authenticated;
grant all on public.supplier_invoice_purchase_orders to service_role;

-- Billing currency is independent of OC cost currency and survives unlinking.
-- A separate table avoids firing legacy financial UPDATE triggers on the OC.
create table public.purchase_order_invoice_currencies (
  purchase_order_id uuid primary key references public.purchase_orders(id) on delete restrict,
  organization_id uuid not null references public.organizations(id),
  currency text not null check(currency in ('ARS','USD')),
  first_invoice_id uuid not null,
  created_at timestamptz not null default now()
);
insert into public.purchase_order_invoice_currencies(purchase_order_id,organization_id,currency,first_invoice_id)
select distinct on (purchase_order_id) purchase_order_id,organization_id,currency,id
from public.supplier_invoices where status='REGISTERED' and purchase_order_id is not null
order by purchase_order_id,invoice_date,id;
alter table public.purchase_order_invoice_currencies enable row level security;
create policy purchase_order_invoice_currencies_read on public.purchase_order_invoice_currencies
  for select to authenticated using (exists(select 1 from public.purchase_orders o
    where o.id=purchase_order_invoice_currencies.purchase_order_id and o.organization_id=purchase_order_invoice_currencies.organization_id));
revoke all on public.purchase_order_invoice_currencies from public,anon,authenticated;
grant select on public.purchase_order_invoice_currencies to authenticated;
grant all on public.purchase_order_invoice_currencies to service_role;

create function public.validate_purchase_order_invoice_currency()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' then
    if new is distinct from old then raise exception 'La moneda de facturación fijada es inmutable'; end if;
    return new;
  end if;
  perform 1 from public.purchase_orders where id=new.purchase_order_id for update;
  if not exists(select 1 from public.purchase_orders o join public.supplier_invoices i
    on i.id=new.first_invoice_id and i.organization_id=o.organization_id and i.supplier_id=o.supplier_id
    where o.id=new.purchase_order_id and o.organization_id=new.organization_id
      and i.currency=new.currency and i.status='REGISTERED' and i.payable_model in ('INVOICE','LEGACY_OC')) then
    raise exception 'La moneda fijada debe provenir de una factura válida del mismo tenant/proveedor';
  end if;
  return new;
end $$;
create trigger validate_purchase_order_invoice_currency before insert or update on public.purchase_order_invoice_currencies
  for each row execute function public.validate_purchase_order_invoice_currency();

create table public.supplier_invoice_link_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  supplier_invoice_id uuid not null,
  previous_orders uuid[] not null, next_orders uuid[] not null,
  created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
alter table public.supplier_invoice_link_events enable row level security;
create policy supplier_invoice_link_events_read on public.supplier_invoice_link_events for select to authenticated
  using (exists (select 1 from public.supplier_invoices i where i.id = supplier_invoice_id
    and i.organization_id = supplier_invoice_link_events.organization_id
    and public.can_read_supplier_invoice(i.organization_id,i.created_by)));
revoke all on public.supplier_invoice_link_events from public,anon,authenticated;
grant select on public.supplier_invoice_link_events to authenticated;
grant all on public.supplier_invoice_link_events to service_role;

create function public.assert_supplier_invoice_write(p_org uuid, p_creator uuid default null, p_require_visibility boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.organization_members m
    join public.organizations o on o.id = m.organization_id and o.is_active
    left join public.roles r on r.id = m.role_id and r.organization_id = m.organization_id
    left join public.role_permissions rp on rp.role_id = r.id
    left join public.permissions p on p.id = rp.permission_id
    where m.organization_id = p_org and m.user_id = auth.uid() and m.is_active
      and (m.is_owner or p.key in ('organization.admin', 'purchases.manage', 'purchases.manage.all'))
      and (not p_require_visibility or p_creator = auth.uid() or m.is_owner
        or p.key in ('organization.admin', 'purchases.manage.all'))
  ) then raise exception using errcode = '42501', message = 'Sin permiso para modificar la factura'; end if;
end $$;

-- Movement detection uses records, not total - pending_balance. AP row locks
-- serialize against payments/credits that lock/update the same account.
create function public.supplier_invoice_has_accounting_references(p_invoice uuid, p_ap uuid default null)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare relation text; found_reference boolean;
begin
  foreach relation in array array['accounting.journal_entries','accounting.informal_entries',
    'accounting.accounting_pending_events','public.accounting_pending_events'] loop
    if to_regclass(relation) is not null then
      execute format('select exists (select 1 from %s r where
        ((coalesce(to_jsonb(r)->>''referencia_id'',to_jsonb(r)->>''source_id'')=$1::text)
          and coalesce(to_jsonb(r)->>''referencia_tabla'',to_jsonb(r)->>''source_table'') in (''supplier_invoices'',''public.supplier_invoices''))
        or ((coalesce(to_jsonb(r)->>''referencia_id'',to_jsonb(r)->>''source_id'')=$2::text)
          and coalesce(to_jsonb(r)->>''referencia_tabla'',to_jsonb(r)->>''source_table'') in (''accounts_payable'',''public.accounts_payable'')))',to_regclass(relation))
        into found_reference using p_invoice,p_ap;
      if found_reference then return true; end if;
    end if;
  end loop;
  return false;
end $$;

create function public.supplier_invoice_ap_has_movements(p_ap uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare reference record; present boolean;
begin
  if exists (select 1 from public.payable_payments where account_payable_id = p_ap)
    or exists (select 1 from public.supplier_credit_applications where account_payable_id = p_ap) then
    return true;
  end if;
  -- Do not rely on FK RESTRICT alone: an existing CASCADE must not erase
  -- treasury/check/credit references when compensating a document.
  for reference in
    select c.conrelid::regclass as relation, child.attname as column_name
    from pg_catalog.pg_constraint c
    cross join lateral unnest(c.conkey,c.confkey) as k(child_key,parent_key)
    join pg_catalog.pg_attribute child on child.attrelid=c.conrelid and child.attnum=k.child_key
    join pg_catalog.pg_attribute parent on parent.attrelid=c.confrelid and parent.attnum=k.parent_key
    where c.contype='f' and c.confrelid='public.accounts_payable'::regclass and parent.attname='id'
      and not (c.conrelid='public.supplier_invoices'::regclass and child.attname='legacy_account_payable_id')
  loop
    execute format('select exists(select 1 from %s where %I=$1)',reference.relation,reference.column_name)
      into present using p_ap;
    if present then return true; end if;
  end loop;
  return false;
end
$$;

create function public.sync_supplier_invoice_payable(p_invoice uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare i public.supplier_invoices%rowtype; a public.accounts_payable%rowtype; v_id uuid;
begin
  select * into strict i from public.supplier_invoices where id = p_invoice for update;
  if i.payable_model <> 'INVOICE' then return null; end if;
  select * into a from public.accounts_payable where supplier_invoice_id = i.id for update;
  if i.status <> 'REGISTERED' then
    if a.id is not null then
      if public.supplier_invoice_ap_has_movements(a.id) or a.pending_balance <> a.total_amount
        or public.supplier_invoice_has_accounting_references(i.id,a.id) then
        raise exception 'La factura tiene movimientos; requiere conciliación';
      end if;
      delete from public.accounts_payable where id = a.id;
    end if;
    return null;
  end if;
  if i.currency not in ('ARS', 'USD') or (i.currency = 'USD' and
    (i.exchange_rate is null or i.exchange_rate <= 0 or i.exchange_rate::text in ('NaN','Infinity','-Infinity'))) then
    raise exception 'Moneda o cotización de factura inválida';
  end if;
  if a.id is null then
    insert into public.accounts_payable (organization_id, supplier_id, supplier_invoice_id,
      purchase_order_id, total_amount, pending_balance, currency, exchange_rate,
      amount_ars, due_date, status)
    values (i.organization_id, i.supplier_id, i.id, null, i.total_amount, i.total_amount,
      i.currency, case when i.currency = 'USD' then i.exchange_rate end,
      trunc(i.total_amount * case when i.currency = 'USD' then i.exchange_rate else 1 end, 2),
      coalesce(i.due_date, i.invoice_date), case when i.total_amount = 0 then 'PAID' else 'PENDING' end)
    returning id into v_id;
    if v_id is null then raise exception 'La inserción de AP fue bloqueada; no se registró la factura'; end if;
    return v_id;
  end if;
  if (a.organization_id, a.supplier_id, a.currency, a.total_amount, a.exchange_rate,
      a.due_date) is distinct from (i.organization_id, i.supplier_id, i.currency,
      i.total_amount, case when i.currency = 'USD' then i.exchange_rate end,
      coalesce(i.due_date, i.invoice_date)) then
    if public.supplier_invoice_ap_has_movements(a.id) or a.pending_balance <> a.total_amount
      or public.supplier_invoice_has_accounting_references(i.id,a.id) then
      raise exception 'La factura tiene movimientos; no se pueden cambiar sus datos financieros';
    end if;
    update public.accounts_payable set supplier_id = i.supplier_id, currency = i.currency,
      total_amount = i.total_amount, pending_balance = i.total_amount,
      exchange_rate = case when i.currency = 'USD' then i.exchange_rate end,
      amount_ars = trunc(i.total_amount * case when i.currency = 'USD' then i.exchange_rate else 1 end, 2),
      due_date = coalesce(i.due_date, i.invoice_date),
      status = case when i.total_amount = 0 then 'PAID' else 'PENDING' end where id = a.id;
  end if;
  return a.id;
end $$;

-- Preserve the actual deployed legacy reconciler, changing only its invoice set.
-- Refuse drift instead of overwriting an unknown financial implementation.
do $$ declare body text; patched text; begin
  select pg_get_functiondef('public.reconcile_purchase_payable_from_invoices(uuid)'::regprocedure) into body;
  patched := regexp_replace(body,
    'WHERE purchase_order_id = p_purchase_order_id(\s+)AND status = ''REGISTERED''',
    'WHERE purchase_order_id = p_purchase_order_id\1AND payable_model = ''LEGACY_OC'' AND status = ''REGISTERED''', 'g');
  if patched = body then raise exception 'Legacy reconciler drift: review preflight'; end if;
  execute patched;
end $$;

create or replace function public.inherit_supplier_invoice_currency_from_purchase_order()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.payable_model = 'LEGACY_OC' and new.purchase_order_id is not null then
    select currency into new.currency from public.purchase_orders where id = new.purchase_order_id;
  end if;
  if new.currency = 'ARS' and new.payable_model = 'INVOICE' then new.exchange_rate := null; end if;
  return new;
end $$;

drop trigger inherit_supplier_invoice_currency_from_purchase_order on public.supplier_invoices;
create trigger a_inherit_supplier_invoice_currency_from_purchase_order
  before insert or update of purchase_order_id,currency,payable_model,exchange_rate on public.supplier_invoices
  for each row execute function public.inherit_supplier_invoice_currency_from_purchase_order();

create or replace function public.reconcile_supplier_invoice_payable_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.payable_model = 'LEGACY_OC' and old.purchase_order_id is not null then
      perform public.reconcile_purchase_payable_from_invoices(old.purchase_order_id);
    end if;
    return old;
  end if;
  if new.payable_model = 'INVOICE' then
    perform public.sync_supplier_invoice_payable(new.id);
  elsif new.payable_model = 'LEGACY_OC' then
    if new.purchase_order_id is not null and new.status='REGISTERED' then
      insert into public.purchase_order_invoice_currencies(purchase_order_id,organization_id,currency,first_invoice_id)
        values(new.purchase_order_id,new.organization_id,new.currency,new.id) on conflict do nothing;
    end if;
    delete from public.supplier_invoice_purchase_orders where supplier_invoice_id = new.id
      and purchase_order_id is distinct from new.purchase_order_id;
    if new.purchase_order_id is not null then
      insert into public.supplier_invoice_purchase_orders(organization_id,supplier_invoice_id,purchase_order_id,created_by)
        values(new.organization_id,new.id,new.purchase_order_id,new.created_by) on conflict do nothing;
    end if;
    if tg_op = 'UPDATE' and old.purchase_order_id is distinct from new.purchase_order_id
      and old.purchase_order_id is not null then
      perform public.reconcile_purchase_payable_from_invoices(old.purchase_order_id);
    end if;
    if new.purchase_order_id is null then return new; end if;
    perform public.reconcile_purchase_payable_from_invoices(new.purchase_order_id);
    update public.supplier_invoices i set legacy_account_payable_id = a.id
      from public.accounts_payable a where i.id = new.id and a.purchase_order_id = new.purchase_order_id
        and a.organization_id = new.organization_id and a.supplier_id = new.supplier_id;
  end if;
  return new;
end $$;
drop trigger reconcile_supplier_invoice_payable on public.supplier_invoices;
create trigger reconcile_supplier_invoice_payable
  after insert or update of purchase_order_id, total_amount, due_date, invoice_date, status, currency, exchange_rate, supplier_id, payable_model
  or delete on public.supplier_invoices for each row
  execute function public.reconcile_supplier_invoice_payable_trigger();

-- Direct AP identity is never inferred from today's organization flag.
create function public.validate_invoice_payable_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.supplier_invoices i where i.legacy_account_payable_id = new.id
    and (i.organization_id is distinct from new.organization_id or i.supplier_id is distinct from new.supplier_id
      or i.purchase_order_id is distinct from new.purchase_order_id or new.supplier_invoice_id is not null)) then
    raise exception 'La AP legacy no puede cambiar de identidad';
  end if;
  if new.supplier_invoice_id is not null and not exists (
    select 1 from public.supplier_invoices i where i.id = new.supplier_invoice_id
      and i.organization_id = new.organization_id and i.supplier_id = new.supplier_id
      and i.payable_model = 'INVOICE' and i.legacy_account_payable_id is null
      and i.status = 'REGISTERED' and i.currency = new.currency
      and i.total_amount = new.total_amount
      and new.exchange_rate is not distinct from case when i.currency='USD' then i.exchange_rate end
      and new.amount_ars = trunc(i.total_amount * case when i.currency='USD' then i.exchange_rate else 1 end,2)
      and new.due_date = coalesce(i.due_date,i.invoice_date)
  ) then raise exception 'La AP debe representar una factura registrada del mismo proveedor y organización'; end if;
  if tg_op = 'UPDATE' and old.supplier_invoice_id is distinct from new.supplier_invoice_id then
    raise exception 'No se puede cambiar la identidad de una AP';
  end if;
  return new;
end $$;
create trigger validate_invoice_payable_identity before insert or update on public.accounts_payable
  for each row execute function public.validate_invoice_payable_identity();

create function public.guard_direct_payable_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.supplier_invoice_id is not null and exists (select 1 from public.supplier_invoices
    where id = old.supplier_invoice_id and status = 'REGISTERED') then
    raise exception 'Cancelar la factura sin movimientos antes de eliminar su AP';
  end if;
  return old;
end $$;
create trigger guard_direct_payable_delete before delete on public.accounts_payable
  for each row execute function public.guard_direct_payable_delete();

create or replace function public.gate_invoice_backed_payable_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.supplier_invoice_id is not null then return new; end if;
  if public.organization_uses_invoice_backed_debt(new.organization_id) and new.purchase_order_id is null then
    raise exception 'La AP requiere una factura directa o una OC legacy válida';
  end if;
  if public.organization_uses_invoice_backed_debt(new.organization_id)
    and new.purchase_order_id is not null and not exists (
      select 1 from public.supplier_invoices where purchase_order_id = new.purchase_order_id
        and organization_id = new.organization_id and status = 'REGISTERED' and payable_model = 'LEGACY_OC'
    ) then return null; end if;
  return new;
end $$;

create function public.guard_supplier_invoice_model()
returns trigger language plpgsql security definer set search_path = '' as $$
declare payable_id uuid;
begin
  if tg_op = 'UPDATE' then
    if old.payable_model = 'INVOICE' and
      (old.supplier_id,old.currency,old.total_amount,old.subtotal_amount,old.tax_amount,
       old.due_date,old.invoice_date,old.exchange_rate,old.status,old.invoice_type,old.point_of_sale,old.invoice_number)
      is distinct from
      (new.supplier_id,new.currency,new.total_amount,new.subtotal_amount,new.tax_amount,
       new.due_date,new.invoice_date,new.exchange_rate,new.status,new.invoice_type,new.point_of_sale,new.invoice_number) then
      select id into payable_id from public.accounts_payable where supplier_invoice_id=old.id for update;
      if (payable_id is not null and public.supplier_invoice_ap_has_movements(payable_id))
        or public.supplier_invoice_has_accounting_references(old.id,payable_id) then
        raise exception 'La factura tiene movimientos o referencias contables; no se puede modificar';
      end if;
    end if;
    if old.payable_model <> new.payable_model and old.payable_model <> 'UNRESOLVED' then
      raise exception 'El modelo financiero de la factura es inmutable';
    end if;
    if old.organization_id <> new.organization_id then raise exception 'La organización es inmutable'; end if;
    if (old.supplier_id,old.currency) is distinct from (new.supplier_id,new.currency)
      and exists (select 1 from public.supplier_invoice_purchase_orders where supplier_invoice_id = old.id) then
      raise exception 'No se puede cambiar proveedor/moneda con OC vinculadas';
    end if;
  end if;
  if new.payable_model = 'INVOICE' and (new.purchase_order_id is not null or new.legacy_account_payable_id is not null) then
    raise exception 'Una factura directa no puede conservar origen legacy';
  end if;
  if new.payable_model='LEGACY_OC' and new.purchase_order_id is not null and new.status='REGISTERED' then
    perform 1 from public.purchase_orders where id=new.purchase_order_id for update;
    if exists(select 1 from public.purchase_order_invoice_currencies c where c.purchase_order_id=new.purchase_order_id
      and (c.currency<>new.currency or c.organization_id<>new.organization_id)) then
      raise exception 'La moneda de facturación fijada para la OC es incompatible';
    end if;
  end if;
  if new.legacy_account_payable_id is not null and not exists (
    select 1 from public.accounts_payable a where a.id = new.legacy_account_payable_id
      and a.organization_id = new.organization_id and a.supplier_id = new.supplier_id
      and a.purchase_order_id = new.purchase_order_id and a.supplier_invoice_id is null
  ) then raise exception 'Representación legacy inconsistente'; end if;
  return new;
end $$;
create trigger guard_supplier_invoice_model before insert or update on public.supplier_invoices
  for each row execute function public.guard_supplier_invoice_model();

create function public.validate_supplier_invoice_order_link()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.supplier_invoices i join public.purchase_orders o
    on o.id = new.purchase_order_id and o.organization_id = i.organization_id and o.supplier_id = i.supplier_id
    where i.id = new.supplier_invoice_id and i.organization_id = new.organization_id
      and (i.payable_model = 'INVOICE' or i.purchase_order_id = o.id)) then
    raise exception 'Vínculo de factura/OC ajeno al proveedor o modelo';
  end if;
  return new;
end $$;
create trigger validate_supplier_invoice_order_link before insert or update on public.supplier_invoice_purchase_orders
  for each row execute function public.validate_supplier_invoice_order_link();

-- Called only after locking all affected OCs in sorted order, then the invoice.
create function public.set_supplier_invoice_orders_internal(p_invoice uuid, p_orders uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare i public.supplier_invoices%rowtype; o public.purchase_orders%rowtype; ids uuid[]; previous uuid[];
begin
  select * into strict i from public.supplier_invoices where id = p_invoice for update;
  ids := array(select distinct x from unnest(coalesce(p_orders, '{}'::uuid[])) x order by x);
  if exists (select 1 from unnest(ids) x where x is null) or cardinality(ids) > 100 then
    raise exception 'Selección de OC inválida'; end if;
  if i.payable_model <> 'INVOICE' then raise exception 'Solo se modifican vínculos de facturas directas'; end if;
  if i.status <> 'REGISTERED' then raise exception 'La factura no está registrada'; end if;
  select coalesce(array_agg(purchase_order_id order by purchase_order_id),'{}') into previous
    from public.supplier_invoice_purchase_orders where supplier_invoice_id = i.id;
  for o in select * from public.purchase_orders where id = any(ids) order by id loop
    if o.organization_id <> i.organization_id or o.supplier_id is distinct from i.supplier_id
      or o.status::text in ('CANCELLED','DRAFT') then raise exception 'OC no válida para esta factura'; end if;
    if exists(select 1 from public.purchase_order_invoice_currencies c
      where c.purchase_order_id=o.id and (c.currency<>i.currency or c.organization_id<>i.organization_id)) then
      raise exception 'La moneda de facturación fijada para la OC es incompatible';
    end if;
    if exists (select 1 from public.accounts_payable a where a.purchase_order_id = o.id
        and not exists (select 1 from public.supplier_invoices l where l.purchase_order_id = o.id
          and l.payable_model = 'LEGACY_OC' and l.status = 'REGISTERED')) then
      raise exception 'La OC conserva deuda provisional; requiere conciliación explícita';
    end if;
    if exists (select 1 from public.supplier_invoices other
      where other.id <> i.id and other.status = 'REGISTERED' and other.currency <> i.currency
        and (other.purchase_order_id = o.id or exists (
          select 1 from public.supplier_invoice_purchase_orders link
          where link.supplier_invoice_id = other.id and link.purchase_order_id = o.id))) then
      raise exception 'La moneda de facturación de la OC es incompatible';
    end if;
  end loop;
  if (select count(*) from public.purchase_orders where id = any(ids)) <> cardinality(ids) then
    raise exception 'OC no encontrada'; end if;
  insert into public.purchase_order_invoice_currencies(purchase_order_id,organization_id,currency,first_invoice_id)
    select x,i.organization_id,i.currency,i.id from unnest(ids) x on conflict do nothing;
  delete from public.supplier_invoice_purchase_orders where supplier_invoice_id = i.id;
  insert into public.supplier_invoice_purchase_orders (organization_id, supplier_invoice_id, purchase_order_id, created_by)
    select i.organization_id, i.id, x, auth.uid() from unnest(ids) x;
  if previous <> ids then
    insert into public.supplier_invoice_link_events(organization_id,supplier_invoice_id,previous_orders,next_orders,created_by)
      values(i.organization_id,i.id,previous,ids,auth.uid());
  end if;
end $$;

create function public.create_supplier_invoice_with_payable(p_org_id uuid, p_invoice jsonb, p_purchase_order_ids uuid[] default '{}')
returns setof public.supplier_invoices language plpgsql security definer set search_path = '' as $$
declare i public.supplier_invoices%rowtype; direct boolean; ids uuid[]; v_currency text;
  pdf_path text; org_slug text;
begin
  perform public.assert_supplier_invoice_write(p_org_id);
  -- Lock policy row to serialize registration against configuration changes.
  perform 1 from public.organization_settings where organization_id = p_org_id for share;
  direct := public.organization_uses_invoice_backed_debt(p_org_id);
  ids := array(select distinct x from unnest(coalesce(p_purchase_order_ids, '{}'::uuid[])) x order by x);
  if cardinality(ids) > 100 or exists (select 1 from unnest(ids) x where x is null)
    or (not direct and cardinality(ids) > 1) then raise exception 'Selección de OC inválida'; end if;
  perform 1 from public.purchase_orders where id = any(ids) order by id for update;
  if (select count(*) from public.purchase_orders where id = any(ids) and organization_id = p_org_id
    and supplier_id = (p_invoice->>'supplier_id')::uuid and status::text not in ('CANCELLED','DRAFT')) <> cardinality(ids) then
    raise exception 'OC ajena al proveedor/organización o no disponible'; end if;
  if not exists (select 1 from public.suppliers where id = (p_invoice->>'supplier_id')::uuid and organization_id = p_org_id) then
    raise exception 'Proveedor ajeno a la organización'; end if;
  v_currency := coalesce(p_invoice->>'currency', 'ARS');
  if not direct and cardinality(ids) = 1 then
    select o.currency into v_currency from public.purchase_orders o where id = ids[1];
    if exists(select 1 from public.purchase_order_invoice_currencies c
      where c.purchase_order_id=ids[1] and (c.currency<>v_currency or c.organization_id<>p_org_id)) then
      raise exception 'La moneda de facturación fijada para la OC es incompatible';
    end if;
  end if;
  if v_currency not in ('ARS','USD') or (v_currency = 'USD' and (coalesce((p_invoice->>'exchange_rate')::numeric,0) <= 0
    or (p_invoice->>'exchange_rate')::numeric::text in ('NaN','Infinity','-Infinity'))) then
    raise exception 'Moneda o cotización inválida'; end if;
  if coalesce(btrim(p_invoice->>'invoice_number'), '') = '' then raise exception 'Número de factura requerido'; end if;
  pdf_path:=nullif(p_invoice->>'invoice_pdf_url','');
  if pdf_path is not null then
    select o.slug into org_slug from public.organizations o where id=p_org_id;
    if split_part(pdf_path,'/',1) is distinct from org_slug
      or split_part(pdf_path,'/',2)='' or split_part(pdf_path,'/',3)<>'facturas_proveedor'
      or cardinality(string_to_array(pdf_path,'/'))<>4 or strpos(pdf_path,'..')>0
      or strpos(pdf_path,chr(92))>0 or coalesce(p_invoice->>'invoice_filename','')='' then
      raise exception 'Referencia PDF inválida para la organización';
    end if;
  end if;
  if exists (select 1 from jsonb_each(p_invoice) e where e.key in ('subtotal_amount','tax_amount','total_amount')
    and (((e.value #>> '{}')::numeric)::text in ('NaN','Infinity','-Infinity') or (e.value #>> '{}')::numeric <> trunc((e.value #>> '{}')::numeric,2))) then
    raise exception 'Importes inválidos'; end if;
  insert into public.supplier_invoices (organization_id, supplier_id, purchase_order_id, payable_model,
    invoice_type, point_of_sale, invoice_number, invoice_date, due_date, subtotal_amount, tax_amount,
    total_amount, currency, exchange_rate, notes, created_by,invoice_pdf_url,invoice_filename)
  values (p_org_id, (p_invoice->>'supplier_id')::uuid, case when not direct then ids[1] end,
    case when direct then 'INVOICE' else 'LEGACY_OC' end, p_invoice->>'invoice_type',
    nullif(btrim(p_invoice->>'point_of_sale'),''), btrim(p_invoice->>'invoice_number'),
    (p_invoice->>'invoice_date')::date, (p_invoice->>'due_date')::date,
    (p_invoice->>'subtotal_amount')::numeric, (p_invoice->>'tax_amount')::numeric,
    (p_invoice->>'total_amount')::numeric, v_currency,
    case when v_currency = 'USD' then (p_invoice->>'exchange_rate')::numeric end,
    p_invoice->>'notes', auth.uid(),pdf_path,
    case when pdf_path is not null then p_invoice->>'invoice_filename' end) returning * into i;
  if direct then perform public.set_supplier_invoice_orders_internal(i.id, ids);
  elsif cardinality(ids) = 1 then
    insert into public.supplier_invoice_purchase_orders (organization_id,supplier_invoice_id,purchase_order_id,created_by)
      values (p_org_id,i.id,ids[1],auth.uid()) on conflict do nothing;
    insert into public.purchase_order_invoice_currencies(purchase_order_id,organization_id,currency,first_invoice_id)
      values(ids[1],p_org_id,i.currency,i.id) on conflict do nothing;
  end if;
  return query select * from public.supplier_invoices where id = i.id;
end $$;

create function public.set_supplier_invoice_purchase_orders(p_invoice_id uuid, p_purchase_order_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare i public.supplier_invoices%rowtype; previous uuid[]; current_ids uuid[];
begin
  select * into strict i from public.supplier_invoices where id = p_invoice_id;
  perform public.assert_supplier_invoice_write(i.organization_id, i.created_by, true);
  select coalesce(array_agg(purchase_order_id order by purchase_order_id),'{}') into previous
    from public.supplier_invoice_purchase_orders where supplier_invoice_id = i.id;
  perform 1 from public.purchase_orders where id = any(previous || coalesce(p_purchase_order_ids,'{}')) order by id for update;
  perform 1 from public.supplier_invoices where id = i.id for update;
  select coalesce(array_agg(purchase_order_id order by purchase_order_id),'{}') into current_ids
    from public.supplier_invoice_purchase_orders where supplier_invoice_id = i.id;
  if previous <> current_ids then raise exception using errcode = '40001', message = 'Los vínculos cambiaron; reintentá'; end if;
  perform public.set_supplier_invoice_orders_internal(i.id, p_purchase_order_ids);
end $$;

create function public.delete_supplier_invoice_atomic(p_invoice_id uuid, p_previous_origin text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.supplier_invoices%rowtype; a public.accounts_payable%rowtype;
  locked_orders uuid[]; previous_links uuid[]; current_links uuid[];
begin
  select * into i from public.supplier_invoices where id = p_invoice_id;
  if not found then return; end if;
  perform public.assert_supplier_invoice_write(i.organization_id, i.created_by, true);
  -- OC before invoice matches registration/relink and legacy reconciliation.
  select coalesce(array_agg(purchase_order_id order by purchase_order_id),'{}') into previous_links
    from public.supplier_invoice_purchase_orders where supplier_invoice_id=i.id;
  locked_orders:=array(select distinct x from (
    select unnest(previous_links) as x union all select i.purchase_order_id
    union all select purchase_order_id from public.purchase_order_invoice_currencies where first_invoice_id=i.id
  ) s where x is not null order by x);
  perform 1 from public.purchase_orders where id=any(locked_orders) order by id for update;
  select * into strict i from public.supplier_invoices where id = p_invoice_id for update;
  select coalesce(array_agg(purchase_order_id order by purchase_order_id),'{}') into current_links
    from public.supplier_invoice_purchase_orders where supplier_invoice_id=i.id;
  if previous_links<>current_links then raise exception using errcode='40001',message='Los vínculos cambiaron; reintentá'; end if;
  if i.payable_model = 'UNRESOLVED' then raise exception 'La factura histórica requiere diagnóstico antes de eliminar'; end if;
  if i.payable_model = 'LEGACY_OC' then raise exception 'Las facturas legacy requieren conciliación explícita'; end if;
  select * into a from public.accounts_payable where supplier_invoice_id = i.id for update;
  if (a.id is not null and (public.supplier_invoice_ap_has_movements(a.id) or a.pending_balance <> a.total_amount))
    or public.supplier_invoice_has_accounting_references(i.id,a.id) then
    raise exception 'No se puede eliminar una factura con movimientos';
  end if;
  if i.payable_model='INVOICE' and a.id is not null then
    update public.supplier_invoices set status = 'CANCELLED' where id = i.id;
  end if;
  delete from public.supplier_invoices where id = i.id;
  delete from public.purchase_order_invoice_currencies c
    where c.purchase_order_id=any(locked_orders) and c.first_invoice_id=i.id
      and not exists(select 1 from public.supplier_invoice_purchase_orders l
        join public.supplier_invoices other on other.id=l.supplier_invoice_id and other.status='REGISTERED'
        where l.purchase_order_id=c.purchase_order_id);
  -- p_previous_origin is a deprecated compatibility argument and never trusted.
end $$;

-- Prevent stale clients and direct requests from selecting their own model or
-- Collections can read document references without receiving purchase-document
-- edit permissions or bypassing their existing own/all visibility rules.
create function public.get_payable_invoice_documents(p_org_id uuid)
returns table(account_payable_id uuid, supplier_invoice_id uuid, invoice_type text,
  point_of_sale text, invoice_number text, invoice_date date, purchase_orders jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.organization_members m
    join public.organizations o on o.id = m.organization_id and o.is_active
    left join public.roles r on r.id = m.role_id and r.organization_id = m.organization_id
    left join public.role_permissions rp on rp.role_id = r.id
    left join public.permissions p on p.id = rp.permission_id
    where m.organization_id = p_org_id and m.user_id = auth.uid() and m.is_active
      and (m.is_owner or p.key in ('organization.admin','collections.manage','collections.read.all'))) then
    raise exception using errcode = '42501', message = 'Sin acceso a cuentas por pagar';
  end if;
  return query select a.id, i.id, i.invoice_type, i.point_of_sale, i.invoice_number, i.invoice_date,
    coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'purchase_number',o.purchase_number) order by o.id)
      from public.supplier_invoice_purchase_orders l join public.purchase_orders o on o.id = l.purchase_order_id
      where l.supplier_invoice_id = i.id and l.organization_id = p_org_id), '[]'::jsonb)
  from public.accounts_payable a join public.supplier_invoices i on i.id = a.supplier_invoice_id
    and i.organization_id = a.organization_id and i.supplier_id = a.supplier_id
  where a.organization_id = p_org_id;
end $$;
revoke all on function public.get_payable_invoice_documents(uuid) from public,anon,authenticated;
grant execute on function public.get_payable_invoice_documents(uuid) to authenticated;

-- Prevent stale clients and direct requests from selecting their own model or
-- changing financial fields/links without the transactional boundary.
revoke insert, update, delete on public.supplier_invoices from public, anon, authenticated;
-- TRUNCATE bypasses row policies/triggers; it is not an application operation.
revoke truncate on public.supplier_invoices,public.accounts_payable,
  public.payable_payments,public.supplier_credit_applications,public.supplier_credits
  from public,anon,authenticated;
do $$ declare columns text; begin
  select string_agg(quote_ident(attname),',') into columns from pg_attribute
    where attrelid='public.supplier_invoices'::regclass and attnum>0 and not attisdropped;
  execute format('revoke insert (%s), update (%s) on public.supplier_invoices from public,anon,authenticated',columns,columns);
end $$;
grant update (invoice_pdf_url, invoice_filename) on public.supplier_invoices to authenticated;

-- Private helpers, including existing legacy financial entrypoints.
revoke all on function public.assert_supplier_invoice_write(uuid,uuid,boolean),
  public.supplier_invoice_ap_has_movements(uuid), public.sync_supplier_invoice_payable(uuid),
  public.supplier_invoice_has_accounting_references(uuid,uuid),
  public.validate_invoice_payable_identity(), public.guard_supplier_invoice_model(),
  public.guard_direct_payable_delete(),
  public.validate_purchase_order_invoice_currency(),
  public.validate_supplier_invoice_order_link(), public.set_supplier_invoice_orders_internal(uuid,uuid[]),
  public.reconcile_purchase_payable_from_invoices(uuid), public.restore_purchase_note_payable(uuid),
  public.cleanup_supplier_invoice_payable(uuid,text) from public, anon, authenticated;
revoke all on function public.create_supplier_invoice_with_payable(uuid,jsonb,uuid[]),
  public.set_supplier_invoice_purchase_orders(uuid,uuid[]), public.delete_supplier_invoice_atomic(uuid,text)
  from public, anon, authenticated;
grant execute on function public.create_supplier_invoice_with_payable(uuid,jsonb,uuid[]),
  public.set_supplier_invoice_purchase_orders(uuid,uuid[]), public.delete_supplier_invoice_atomic(uuid,text)
  to authenticated, service_role;

do $$ begin
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid=p.proowner
    where p.oid in ('public.create_supplier_invoice_with_payable(uuid,jsonb,uuid[])'::regprocedure,
      'public.sync_supplier_invoice_payable(uuid)'::regprocedure,
      'public.assert_supplier_invoice_write(uuid,uuid,boolean)'::regprocedure)
      and (not p.prosecdef or not coalesce('search_path=""'=any(p.proconfig),false)
        or not (r.rolsuper or r.rolbypassrls))) then
    raise exception 'Untrusted function owner/configuration: review preflight';
  end if;
  if pg_catalog.has_function_privilege('anon','public.create_supplier_invoice_with_payable(uuid,jsonb,uuid[])','EXECUTE')
    or pg_catalog.has_function_privilege('authenticated','public.sync_supplier_invoice_payable(uuid)','EXECUTE') then
    raise exception 'Invalid supplier invoice execution grants';
  end if;
end $$;

create schema if not exists ap_invoice_internal;
revoke all on schema ap_invoice_internal from public,anon,authenticated,service_role;
create table if not exists ap_invoice_internal.schema_versions(version text primary key,
  applied_at timestamptz not null default now(),legacy_reconciler_definition text not null,financial_fingerprint jsonb not null);
revoke all on ap_invoice_internal.schema_versions from public,anon,authenticated,service_role;
foreach relation_name in array array['public.accounts_payable','public.payable_payments',
  'public.supplier_credits','public.supplier_credit_applications','accounting.journal_entries',
  'accounting.informal_entries','accounting.accounting_pending_events','public.accounting_pending_events'] loop
  if to_regclass(relation_name) is not null then
    execute format('select md5(coalesce(string_agg(md5((to_jsonb(r)%s)::text),'''' order by r.id),'''')) from %s r',
      case when relation_name='public.accounts_payable' then ' - ''supplier_invoice_id''' else '' end,
      to_regclass(relation_name)) into fingerprint;
    financial_after:=financial_after || jsonb_build_object(relation_name,fingerprint);
  end if;
end loop;
if financial_after is distinct from financial_before then
  raise exception 'Historical financial records changed during DDL: rollback and review deployed triggers';
end if;
insert into ap_invoice_internal.schema_versions(version,legacy_reconciler_definition,financial_fingerprint)
  values('20261104000000',legacy_definition,financial_before);
end $ap_invoice_migration$;

notify pgrst, 'reload schema';
commit;
