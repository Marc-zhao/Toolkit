-- Keep trigger-only functions out of the exposed RPC surface and optimize new RLS checks.

revoke all on function public.ensure_vq_class_invite() from public, anon, authenticated;
revoke all on function public.register_vq_profile_from_auth() from public, anon, authenticated;
revoke all on function public.prevent_vq_class_change() from public, anon, authenticated;

drop policy if exists invite_redemptions_own_read on public.invite_redemptions;
create policy invite_redemptions_own_read
on public.invite_redemptions
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists variants_teacher_insert on public.word_pack_difficulty_variants;
create policy variants_teacher_insert
on public.word_pack_difficulty_variants
for insert
to authenticated
with check (public.is_vq_teacher() and generated_by = (select auth.uid()));

drop policy if exists invite_teacher_select on public.invite_codes;
create policy invite_teacher_select
on public.invite_codes
for select
to authenticated
using (public.is_vq_teacher() and created_by = (select auth.uid()));
