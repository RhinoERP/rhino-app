alter table public.credit_note_items enable row level security;
alter table public.credit_note_taxes enable row level security;
alter table public.credit_note_source_documents enable row level security;

drop policy if exists "Organization members can manage credit note items"
on public.credit_note_items;
create policy "Organization members can manage credit note items"
on public.credit_note_items
for all
using (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = credit_note_items.organization_id
      and om.user_id = auth.uid()
      and om.is_active = true
      and om.disabled_at is null
  )
)
with check (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = credit_note_items.organization_id
      and om.user_id = auth.uid()
      and om.is_active = true
      and om.disabled_at is null
  )
);

drop policy if exists "Organization members can manage credit note taxes"
on public.credit_note_taxes;
create policy "Organization members can manage credit note taxes"
on public.credit_note_taxes
for all
using (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = credit_note_taxes.organization_id
      and om.user_id = auth.uid()
      and om.is_active = true
      and om.disabled_at is null
  )
)
with check (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = credit_note_taxes.organization_id
      and om.user_id = auth.uid()
      and om.is_active = true
      and om.disabled_at is null
  )
);

drop policy if exists "Organization members can manage credit note source documents"
on public.credit_note_source_documents;
create policy "Organization members can manage credit note source documents"
on public.credit_note_source_documents
for all
using (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = credit_note_source_documents.organization_id
      and om.user_id = auth.uid()
      and om.is_active = true
      and om.disabled_at is null
  )
)
with check (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = credit_note_source_documents.organization_id
      and om.user_id = auth.uid()
      and om.is_active = true
      and om.disabled_at is null
  )
);
