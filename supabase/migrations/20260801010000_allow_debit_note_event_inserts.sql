drop policy if exists debit_note_events_org_member_insert on public.debit_note_events;

create policy debit_note_events_org_member_insert on public.debit_note_events
  for insert with check (exists (
    select 1 from public.organization_members om
    where om.organization_id = debit_note_events.organization_id
      and om.user_id = auth.uid()
  ));
