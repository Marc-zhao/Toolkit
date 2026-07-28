revoke all on function public.consume_ai_quota(integer) from public, anon;
revoke all on function public.complete_vq_registration(text,text,text,uuid) from public, anon;
revoke all on function public.consume_vq_invite(text,text) from public, anon, authenticated;
revoke all on function public.is_vq_teacher() from public, anon;
revoke all on function public.is_vq_class_teacher(uuid) from public, anon;
revoke all on function public.can_view_vq_student(uuid) from public, anon;
revoke all on function public.set_weekly_boss_questions(uuid,jsonb) from public, anon;
revoke all on function public.validate_vq_invite(text,text) from public;
revoke all on function public.register_vq_profile_from_auth() from public, anon, authenticated;
revoke all on function public.ensure_weekly_bosses() from public, anon;
grant execute on function public.consume_ai_quota(integer) to authenticated;
grant execute on function public.complete_vq_registration(text,text,text,uuid) to authenticated;
grant execute on function public.is_vq_teacher() to authenticated;
grant execute on function public.is_vq_class_teacher(uuid) to authenticated;
grant execute on function public.can_view_vq_student(uuid) to authenticated;
grant execute on function public.set_weekly_boss_questions(uuid,jsonb) to authenticated;
grant execute on function public.ensure_weekly_bosses() to authenticated;
-- Anonymous execution is intentional only for exact-code validation.
grant execute on function public.validate_vq_invite(text,text) to anon, authenticated;
