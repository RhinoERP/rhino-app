-- The existing function rejects anonymous requests in its body, but the pilot
-- database still lets anon execute it. Only authenticated users need replay
-- lookups; the privileged atomic writer remains service-role only.
revoke all on function public.get_offline_pre_sale_replay_result(jsonb)
  from public, anon;
grant execute on function public.get_offline_pre_sale_replay_result(jsonb)
  to authenticated;
