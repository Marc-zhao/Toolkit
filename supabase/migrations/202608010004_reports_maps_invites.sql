-- Teacher reports, FillBlank story-map progress, and one-time teacher invitations.

alter table public.invite_codes
  add column if not exists max_uses integer not null default 50 check (max_uses between 1 and 1000),
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists expires_at timestamptz,
  add column if not exists used_by uuid references auth.users(id) on delete set null,
  add column if not exists used_at timestamptz;

update public.invite_codes
set max_uses = 1,
    is_active = is_active and used_count < 1
where role = 'teacher';

create table if not exists public.fillblank_map_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  pack_id text not null references public.word_packs(id) on delete cascade,
  map_data jsonb not null default '{}'::jsonb check (jsonb_typeof(map_data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, pack_id)
);

create table if not exists public.teacher_reports (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  cache_key text not null,
  report_type text not null check (
    report_type in ('weekly_class', 'semester_compare', 'difficulty', 'top_errors', 'student_profile', 'comprehensive')
  ),
  tool_scope text not null default 'combined' check (tool_scope in ('combined', 'vocabulary', 'fillblank')),
  class_id uuid references public.classes(id) on delete cascade,
  student_id uuid references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  data_version text not null,
  report_data jsonb not null default '{}'::jsonb check (jsonb_typeof(report_data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (teacher_id, cache_key)
);

create or replace function public.create_vq_teacher_invite(p_valid_days integer default 7)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_days integer := least(greatest(coalesce(p_valid_days, 7), 1), 30);
  v_active_count integer;
  v_recent_count integer;
begin
  if not public.is_vq_teacher() then
    raise exception 'Only a verified VocaQuest teacher can create teacher invitations';
  end if;
  select count(*) into v_active_count
  from public.invite_codes
  where role = 'teacher' and created_by = auth.uid() and is_active = true
    and used_count < max_uses and (expires_at is null or expires_at > now());
  if v_active_count >= 3 then
    raise exception 'At most three active teacher invitations are allowed';
  end if;
  select count(*) into v_recent_count
  from public.invite_codes
  where role = 'teacher' and created_by = auth.uid() and created_at >= now() - interval '30 days';
  if v_recent_count >= 12 then
    raise exception 'Monthly teacher invitation limit reached';
  end if;
  loop
    v_code := 'VQT-' || upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 10));
    begin
      insert into public.invite_codes
        (code, role, is_active, used_count, max_uses, created_by, expires_at)
      values
        (v_code, 'teacher', true, 0, 1, auth.uid(), now() + make_interval(days => v_days));
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;
  return v_code;
end;
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
      and coalesce(used_count, 0) < coalesce(max_uses, 50)
      and (expires_at is null or expires_at > now())
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
      used_by = case when role = 'teacher' then auth.uid() else used_by end,
      used_at = case when role = 'teacher' then now() else used_at end,
      is_active = coalesce(used_count, 0) + 1 < coalesce(max_uses, 50)
  where upper(code) = upper(trim(p_code))
    and role = p_role
    and is_active = true
    and coalesce(used_count, 0) < coalesce(max_uses, 50)
    and (expires_at is null or expires_at > now())
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
      used_by = case when role = 'teacher' then auth.uid() else used_by end,
      used_at = case when role = 'teacher' then now() else used_at end,
      is_active = coalesce(used_count, 0) + 1 < coalesce(max_uses, 50)
  where upper(code) = upper(trim(p_code))
    and role = p_role
    and is_active = true
    and coalesce(used_count, 0) < coalesce(max_uses, 50)
    and (expires_at is null or expires_at > now())
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

create or replace function public.register_vq_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data ->> 'vq_role', '');
  v_code text := trim(coalesce(new.raw_user_meta_data ->> 'vq_invite', ''));
  v_name text := left(trim(coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))), 100);
  v_class_id uuid;
  v_code_found text;
begin
  if v_role not in ('student', 'teacher') then return new; end if;
  if v_role = 'student' then
    begin
      v_class_id := nullif(new.raw_user_meta_data ->> 'vq_class_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'Invalid VocaQuest class';
    end;
    if v_class_id is null or not exists(select 1 from public.classes where id = v_class_id) then
      raise exception 'Invalid VocaQuest class';
    end if;
  end if;

  update public.invite_codes
  set used_count = used_count + 1,
      used_by = case when role = 'teacher' then new.id else used_by end,
      used_at = case when role = 'teacher' then now() else used_at end,
      is_active = used_count + 1 < max_uses
  where upper(code) = upper(v_code)
    and role = v_role
    and is_active = true
    and used_count < max_uses
    and (expires_at is null or expires_at > now())
  returning code into v_code_found;

  if v_code_found is null then raise exception 'Invalid VocaQuest invite'; end if;
  perform set_config('app.vq_registration', '1', true);
  insert into public.profiles(id, full_name, class_id, is_teacher)
  values (new.id, v_name, case when v_role = 'student' then v_class_id else null end, v_role = 'teacher')
  on conflict (id) do nothing;
  return new;
end;
$$;

alter table public.fillblank_map_progress enable row level security;
alter table public.teacher_reports enable row level security;

drop policy if exists invite_manage_teacher_select on public.invite_codes;
drop policy if exists invite_manage_teacher_insert on public.invite_codes;
drop policy if exists invite_manage_teacher_update on public.invite_codes;
drop policy if exists invite_manage_teacher_delete on public.invite_codes;
drop policy if exists invite_teacher_select on public.invite_codes;
drop policy if exists invite_admin_insert on public.invite_codes;
drop policy if exists invite_admin_update on public.invite_codes;
drop policy if exists invite_admin_delete on public.invite_codes;
create policy invite_teacher_select on public.invite_codes for select to authenticated using (
  public.is_vq_teacher() and (role = 'student' or created_by = auth.uid())
);

create policy fillblank_map_read on public.fillblank_map_progress for select to authenticated using (
  public.can_view_vq_student(user_id)
);
create policy fillblank_map_insert_own on public.fillblank_map_progress for insert to authenticated with check (
  user_id = auth.uid()
);
create policy fillblank_map_update_own on public.fillblank_map_progress for update to authenticated using (
  user_id = auth.uid()
) with check (user_id = auth.uid());
create policy fillblank_map_delete_own on public.fillblank_map_progress for delete to authenticated using (
  user_id = auth.uid()
);

create policy teacher_reports_select on public.teacher_reports for select to authenticated using (
  teacher_id = auth.uid()
);
create policy teacher_reports_insert on public.teacher_reports for insert to authenticated with check (
  teacher_id = auth.uid() and public.is_vq_teacher()
);
create policy teacher_reports_update on public.teacher_reports for update to authenticated using (
  teacher_id = auth.uid()
) with check (teacher_id = auth.uid() and public.is_vq_teacher());
create policy teacher_reports_delete on public.teacher_reports for delete to authenticated using (
  teacher_id = auth.uid()
);

revoke all on function public.create_vq_teacher_invite(integer) from public, anon;
grant execute on function public.create_vq_teacher_invite(integer) to authenticated;

create index if not exists idx_fillblank_map_pack on public.fillblank_map_progress(pack_id);
create index if not exists idx_teacher_reports_teacher_created on public.teacher_reports(teacher_id, created_at desc);
create index if not exists idx_teacher_reports_class on public.teacher_reports(class_id);
create index if not exists idx_invite_codes_role_active on public.invite_codes(role, is_active);
