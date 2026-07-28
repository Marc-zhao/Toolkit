-- Production RLS and server-side AI quota for Vocaquest.

create table if not exists public.ai_request_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, window_start)
);
alter table public.ai_request_usage enable row level security;

create or replace function public.consume_ai_quota(p_limit integer default 40)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_window timestamptz := date_trunc('hour', now());
  v_count integer;
  v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 200);
begin
  if v_user is null then return false; end if;
  insert into public.ai_request_usage(user_id, window_start, request_count)
  values (v_user, v_window, 1)
  on conflict (user_id, window_start) do update
    set request_count = public.ai_request_usage.request_count + 1
    where public.ai_request_usage.request_count < v_limit
  returning request_count into v_count;
  return v_count is not null and v_count <= v_limit;
end;
$$;
revoke all on function public.consume_ai_quota(integer) from public;
grant execute on function public.consume_ai_quota(integer) to authenticated;

create or replace function public.is_vq_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and is_teacher = true)
$$;

create or replace function public.is_vq_class_teacher(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.classes where id = p_class_id and teacher_id = auth.uid())
$$;

create or replace function public.can_view_vq_student(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id = auth.uid() or exists(
    select 1 from public.profiles p
    join public.classes c on c.id = p.class_id
    where p.id = p_user_id and c.teacher_id = auth.uid()
  )
$$;

create or replace function public.validate_vq_invite(p_code text, p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.invite_codes
    where upper(code) = upper(trim(p_code))
      and is_active = true
      and role = p_role
      and coalesce(used_count, 0) < 50
  )
$$;

create or replace function public.consume_vq_invite(p_code text, p_role text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_code text;
begin
  if auth.uid() is null then return false; end if;
  update public.invite_codes
  set used_count = coalesce(used_count, 0) + 1,
      is_active = coalesce(used_count, 0) + 1 < 50
  where upper(code) = upper(trim(p_code))
    and role = p_role
    and is_active = true
    and coalesce(used_count, 0) < 50
  returning code into v_code;
  return v_code is not null;
end;
$$;

create or replace function public.complete_vq_registration(
  p_code text,
  p_role text,
  p_name text,
  p_class_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_is_teacher boolean := p_role = 'teacher';
begin
  if auth.uid() is null or p_role not in ('student','teacher') then return false; end if;
  if not v_is_teacher and (p_class_id is null or not exists(select 1 from public.classes where id = p_class_id)) then
    return false;
  end if;
  update public.invite_codes
  set used_count = coalesce(used_count, 0) + 1,
      is_active = coalesce(used_count, 0) + 1 < 50
  where upper(code) = upper(trim(p_code))
    and role = p_role
    and is_active = true
    and coalesce(used_count, 0) < 50
  returning code into v_code;
  if v_code is null then return false; end if;
  perform set_config('app.vq_registration', '1', true);
  insert into public.profiles(id, full_name, class_id, is_teacher)
  values (auth.uid(), left(trim(p_name), 100), case when v_is_teacher then null else p_class_id end, v_is_teacher)
  on conflict (id) do update set
    full_name = excluded.full_name,
    class_id = excluded.class_id,
    is_teacher = excluded.is_teacher;
  return true;
end;
$$;

create or replace function public.protect_vq_profile_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if current_setting('app.vq_registration', true) <> '1' then
      raise exception 'Use complete_vq_registration';
    end if;
    return new;
  end if;
  if new.is_teacher is distinct from old.is_teacher then
    raise exception 'Account role cannot be changed';
  end if;
  if old.class_id is not null and new.class_id is distinct from old.class_id then
    raise exception 'Class cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_vq_profile_fields_trigger on public.profiles;
create trigger protect_vq_profile_fields_trigger
before insert or update on public.profiles
for each row execute function public.protect_vq_profile_fields();

create or replace function public.set_weekly_boss_questions(p_boss_id uuid, p_questions jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if auth.uid() is null or jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) < 1 then
    return false;
  end if;
  update public.weekly_bosses
  set questions = p_questions
  where id = p_boss_id and (questions is null or jsonb_array_length(questions) = 0)
  returning id into v_id;
  return v_id is not null;
end;
$$;

revoke all on function public.validate_vq_invite(text,text) from public;
revoke all on function public.consume_vq_invite(text,text) from public;
revoke all on function public.complete_vq_registration(text,text,text,uuid) from public;
revoke all on function public.set_weekly_boss_questions(uuid,jsonb) from public;
grant execute on function public.validate_vq_invite(text,text) to anon, authenticated;
grant execute on function public.consume_vq_invite(text,text) to authenticated;
grant execute on function public.complete_vq_registration(text,text,text,uuid) to authenticated;
grant execute on function public.set_weekly_boss_questions(uuid,jsonb) to authenticated;

do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname='public' loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.invite_codes enable row level security;
alter table public.student_progress enable row level security;
alter table public.word_packs enable row level security;
alter table public.class_assignments enable row level security;
alter table public.fillblank_questions enable row level security;
alter table public.fillblank_records enable row level security;
alter table public.fillblank_stage_results enable row level security;
alter table public.fillblank_assigned_practice enable row level security;
alter table public.student_achievements enable row level security;
alter table public.boss_records enable row level security;
alter table public.class_challenge_records enable row level security;
alter table public.class_challenges enable row level security;
alter table public.weekly_bosses enable row level security;

create policy profiles_read_authenticated on public.profiles for select to authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy classes_read_public on public.classes for select to anon, authenticated using (true);
create policy classes_insert_teacher on public.classes for insert to authenticated with check (public.is_vq_teacher() and teacher_id = auth.uid());
create policy classes_update_teacher on public.classes for update to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy classes_delete_teacher on public.classes for delete to authenticated using (teacher_id = auth.uid());

create policy invite_manage_teacher_select on public.invite_codes for select to authenticated using (public.is_vq_teacher());
create policy invite_manage_teacher_insert on public.invite_codes for insert to authenticated with check (public.is_vq_teacher());
create policy invite_manage_teacher_update on public.invite_codes for update to authenticated using (public.is_vq_teacher()) with check (public.is_vq_teacher());
create policy invite_manage_teacher_delete on public.invite_codes for delete to authenticated using (public.is_vq_teacher());

create policy packs_read on public.word_packs for select to authenticated using (true);
create policy packs_insert_teacher on public.word_packs for insert to authenticated with check (public.is_vq_teacher());
create policy packs_update_teacher on public.word_packs for update to authenticated using (public.is_vq_teacher()) with check (public.is_vq_teacher());
create policy packs_delete_teacher on public.word_packs for delete to authenticated using (public.is_vq_teacher());

create policy assignments_read on public.class_assignments for select to authenticated using (
  public.is_vq_class_teacher(class_id) or class_id = (select class_id from public.profiles where id = auth.uid())
);
create policy assignments_insert_teacher on public.class_assignments for insert to authenticated with check (public.is_vq_class_teacher(class_id));
create policy assignments_delete_teacher on public.class_assignments for delete to authenticated using (public.is_vq_class_teacher(class_id));

create policy progress_read on public.student_progress for select to authenticated using (true);
create policy progress_insert_own on public.student_progress for insert to authenticated with check (user_id = auth.uid());
create policy progress_update_own on public.student_progress for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy progress_delete_own on public.student_progress for delete to authenticated using (user_id = auth.uid());

create policy questions_read on public.fillblank_questions for select to authenticated using (true);
create policy questions_insert_teacher on public.fillblank_questions for insert to authenticated with check (public.is_vq_teacher());
create policy questions_update_teacher on public.fillblank_questions for update to authenticated using (public.is_vq_teacher()) with check (public.is_vq_teacher());
create policy questions_delete_teacher on public.fillblank_questions for delete to authenticated using (public.is_vq_teacher());

create policy records_read on public.fillblank_records for select to authenticated using (public.can_view_vq_student(user_id));
create policy records_insert_own on public.fillblank_records for insert to authenticated with check (user_id = auth.uid());
create policy records_delete_own on public.fillblank_records for delete to authenticated using (user_id = auth.uid());

create policy stage_results_read on public.fillblank_stage_results for select to authenticated using (public.can_view_vq_student(user_id));
create policy stage_results_insert_own on public.fillblank_stage_results for insert to authenticated with check (user_id = auth.uid());
create policy stage_results_delete_own on public.fillblank_stage_results for delete to authenticated using (user_id = auth.uid());

create policy assigned_read on public.fillblank_assigned_practice for select to authenticated using (
  teacher_id = auth.uid() or student_id = auth.uid() or student_id is null
);
create policy assigned_insert_teacher on public.fillblank_assigned_practice for insert to authenticated with check (public.is_vq_teacher() and teacher_id = auth.uid());
create policy assigned_update_participant on public.fillblank_assigned_practice for update to authenticated using (
  teacher_id = auth.uid() or student_id = auth.uid()
) with check (teacher_id = auth.uid() or student_id = auth.uid());
create policy assigned_delete_teacher on public.fillblank_assigned_practice for delete to authenticated using (teacher_id = auth.uid());

create policy achievements_read on public.student_achievements for select to authenticated using (true);
create policy achievements_insert_own on public.student_achievements for insert to authenticated with check (user_id = auth.uid());
create policy achievements_update_own on public.student_achievements for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy achievements_delete_own on public.student_achievements for delete to authenticated using (user_id = auth.uid());

create policy boss_records_read on public.boss_records for select to authenticated using (true);
create policy boss_records_insert_own on public.boss_records for insert to authenticated with check (user_id = auth.uid());
create policy boss_records_delete_own on public.boss_records for delete to authenticated using (user_id = auth.uid());

create policy challenge_records_read on public.class_challenge_records for select to authenticated using (true);
create policy challenge_records_insert_own on public.class_challenge_records for insert to authenticated with check (user_id = auth.uid());
create policy challenge_records_delete_own on public.class_challenge_records for delete to authenticated using (user_id = auth.uid());

create policy challenges_read on public.class_challenges for select to authenticated using (true);
create policy challenges_insert_participant on public.class_challenges for insert to authenticated with check (
  challenger_class_id = (select class_id from public.profiles where id = auth.uid())
);
create policy challenges_update_participant on public.class_challenges for update to authenticated using (
  (select class_id from public.profiles where id = auth.uid()) in (challenger_class_id, opponent_class_id)
) with check ((select class_id from public.profiles where id = auth.uid()) in (challenger_class_id, opponent_class_id));
create policy challenges_delete_creator_class on public.class_challenges for delete to authenticated using (
  challenger_class_id = (select class_id from public.profiles where id = auth.uid()) and status = 'pending'
);

create policy weekly_bosses_read on public.weekly_bosses for select to authenticated using (true);

create index if not exists idx_profiles_class_id on public.profiles(class_id);
create index if not exists idx_progress_user_id on public.student_progress(user_id);
create index if not exists idx_fillblank_records_user_id on public.fillblank_records(user_id);
create index if not exists idx_stage_results_user_id on public.fillblank_stage_results(user_id);
create index if not exists idx_assigned_student_id on public.fillblank_assigned_practice(student_id);
create index if not exists idx_challenge_records_challenge_id on public.class_challenge_records(challenge_id);
