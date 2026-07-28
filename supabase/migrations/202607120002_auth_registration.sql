-- Registration that works whether Supabase email confirmation is enabled or not.

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
  if v_role not in ('student', 'teacher') then
    return new;
  end if;

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
      is_active = used_count + 1 < 50
  where upper(code) = upper(v_code)
    and role = v_role
    and is_active = true
    and used_count < 50
  returning code into v_code_found;

  if v_code_found is null then
    raise exception 'Invalid VocaQuest invite';
  end if;

  perform set_config('app.vq_registration', '1', true);
  insert into public.profiles(id, full_name, class_id, is_teacher)
  values (new.id, v_name, case when v_role = 'student' then v_class_id else null end, v_role = 'teacher')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists register_vq_profile_after_signup on auth.users;
create trigger register_vq_profile_after_signup
after insert on auth.users
for each row execute function public.register_vq_profile_from_auth();

create or replace function public.ensure_weekly_bosses()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week date := (current_date - ((extract(isodow from current_date)::integer - 1) * interval '1 day'))::date;
begin
  if auth.uid() is null then
    return false;
  end if;

  insert into public.weekly_bosses
    (week_start, tool_name, boss_name, boss_emoji, difficulty, reward_pet, reward_title)
  values
    (v_week, 'vocaquest', '记忆迷雾', '🐉', 5, '🐲', '词汇守护者'),
    (v_week, 'fillblank', '语境深渊', '🦈', 5, '🐬', '语境征服者')
  on conflict (week_start, tool_name) do nothing;

  return true;
end;
$$;

revoke all on function public.register_vq_profile_from_auth() from public, anon, authenticated;
revoke all on function public.ensure_weekly_bosses() from public, anon;
grant execute on function public.ensure_weekly_bosses() to authenticated;
