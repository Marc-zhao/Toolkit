-- One-time student invitations, reusable class invitations, class capacity, and adaptive learning profiles.

alter table public.invite_codes
  add column if not exists invite_kind text,
  add column if not exists class_id uuid references public.classes(id) on delete cascade;

update public.invite_codes
set invite_kind = case when role = 'teacher' then 'teacher' else 'student_single' end
where invite_kind is null;

alter table public.invite_codes
  alter column invite_kind set not null;
alter table public.invite_codes
  alter column invite_kind set default 'teacher';

alter table public.invite_codes
  drop constraint if exists invite_codes_invite_kind_check;
alter table public.invite_codes
  add constraint invite_codes_invite_kind_check
  check (invite_kind in ('teacher', 'student_single'));
alter table public.invite_codes
  drop constraint if exists invite_codes_role_kind_check;
alter table public.invite_codes
  add constraint invite_codes_role_kind_check
  check ((role = 'teacher' and invite_kind = 'teacher') or (role = 'student' and invite_kind = 'student_single'));

-- Retire legacy shared student codes. Teachers create scoped one-time codes below.
update public.invite_codes
set is_active = false
where role = 'student' and created_by is null;

create table if not exists public.class_invites (
  class_id uuid primary key references public.classes(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invite_redemptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  invite_kind text not null check (invite_kind in ('student_single', 'class')),
  invite_code text not null,
  class_id uuid references public.classes(id) on delete set null,
  redeemed_at timestamptz not null default now()
);

create table if not exists public.student_learning_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ability_score numeric(5,2) not null default 60 check (ability_score between 0 and 100),
  ability_level text not null default 'standard' check (ability_level in ('foundation', 'standard', 'advanced')),
  confidence numeric(5,2) not null default 0 check (confidence between 0 and 100),
  vocabulary_xp integer not null default 0 check (vocabulary_xp >= 0),
  fillblank_accuracy numeric(5,2) not null default 0 check (fillblank_accuracy between 0 and 100),
  attempts integer not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.word_pack_difficulty_variants (
  pack_id text not null references public.word_packs(id) on delete cascade,
  difficulty integer not null check (difficulty between 1 and 3),
  variant_data jsonb not null default '{}'::jsonb check (jsonb_typeof(variant_data) = 'object'),
  question_count integer not null default 0 check (question_count >= 0),
  generated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (pack_id, difficulty)
);

create table if not exists public.student_pack_difficulty (
  user_id uuid not null references auth.users(id) on delete cascade,
  pack_id text not null references public.word_packs(id) on delete cascade,
  difficulty integer not null check (difficulty between 1 and 3),
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, pack_id)
);

create or replace function public.vq_random_code(p_prefix text, p_length integer default 10)
returns text
language sql
volatile
set search_path = public
as $$
  select upper(trim(p_prefix)) || '-' || upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, least(greatest(p_length, 8), 20)))
$$;

create or replace function public.ensure_vq_class_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_code text;
begin
  loop
    v_code := public.vq_random_code('VQC', 10);
    begin
      insert into public.class_invites(class_id, code, created_by)
      values (new.id, v_code, new.teacher_id);
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;
  return new;
end;
$$;

drop trigger if exists ensure_vq_class_invite_after_insert on public.classes;
create trigger ensure_vq_class_invite_after_insert
after insert on public.classes
for each row execute function public.ensure_vq_class_invite();

do $$
declare v_class record; v_code text;
begin
  for v_class in
    select c.id, c.teacher_id from public.classes c
    where not exists (select 1 from public.class_invites i where i.class_id = c.id)
  loop
    loop
      v_code := public.vq_random_code('VQC', 10);
      begin
        insert into public.class_invites(class_id, code, created_by)
        values (v_class.id, v_code, v_class.teacher_id);
        exit;
      exception when unique_violation then
        null;
      end;
    end loop;
  end loop;
end $$;

create or replace function public.create_vq_class(p_name text)
returns table(id uuid, name text, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare v_class_id uuid;
begin
  if not public.is_vq_teacher() then raise exception 'Only teachers can create classes'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 60 then raise exception 'Class name must contain 2-60 characters'; end if;
  insert into public.classes(name, teacher_id) values (trim(p_name), auth.uid()) returning classes.id into v_class_id;
  return query select c.id, c.name, i.code from public.classes c join public.class_invites i on i.class_id = c.id where c.id = v_class_id;
end;
$$;

create or replace function public.create_vq_student_invite(p_valid_days integer default 14)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_code text; v_active integer; v_recent integer; v_days integer := least(greatest(coalesce(p_valid_days, 14), 1), 30);
begin
  if not public.is_vq_teacher() then raise exception 'Only teachers can create student invitations'; end if;
  select count(*) into v_active from public.invite_codes
  where role = 'student' and invite_kind = 'student_single' and created_by = auth.uid() and is_active
    and used_count < 1 and (expires_at is null or expires_at > now());
  if v_active >= 20 then raise exception 'At most 20 active student invitations are allowed'; end if;
  select count(*) into v_recent from public.invite_codes
  where role = 'student' and invite_kind = 'student_single' and created_by = auth.uid()
    and created_at >= now() - interval '30 days';
  if v_recent >= 120 then raise exception 'Monthly student invitation limit reached'; end if;
  loop
    v_code := public.vq_random_code('VQS', 10);
    begin
      insert into public.invite_codes(code, role, invite_kind, is_active, used_count, max_uses, created_by, expires_at)
      values (v_code, 'student', 'student_single', true, 0, 1, auth.uid(), now() + make_interval(days => v_days));
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;
  return v_code;
end;
$$;

create or replace function public.get_vq_invite_details(p_code text, p_role text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_result jsonb;
begin
  if p_role = 'student' then
    select jsonb_build_object('valid', true, 'kind', 'class', 'class_id', c.id, 'class_name', c.name, 'requires_class_selection', false)
    into v_result
    from public.class_invites i join public.classes c on c.id = i.class_id
    where upper(i.code) = upper(trim(p_code)) and i.is_active
      and (select count(*) from public.profiles p where p.class_id = c.id and not p.is_teacher) < 60;
    if v_result is not null then return v_result; end if;
  end if;
  select jsonb_build_object('valid', true, 'kind', i.invite_kind, 'class_id', null, 'class_name', null,
    'requires_class_selection', i.invite_kind = 'student_single')
  into v_result
  from public.invite_codes i
  where upper(i.code) = upper(trim(p_code)) and i.role = p_role and i.is_active
    and i.used_count < i.max_uses and (i.expires_at is null or i.expires_at > now());
  return coalesce(v_result, jsonb_build_object('valid', false));
end;
$$;

create or replace function public.validate_vq_invite(p_code text, p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((public.get_vq_invite_details(p_code, p_role) ->> 'valid')::boolean, false)
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
  v_kind text;
  v_member_count integer;
begin
  if v_role not in ('student', 'teacher') then return new; end if;
  if v_role = 'student' then
    select i.class_id into v_class_id from public.class_invites i
    where upper(i.code) = upper(v_code) and i.is_active for update;
    if v_class_id is not null then
      perform 1 from public.classes where id = v_class_id for update;
      select count(*) into v_member_count from public.profiles where class_id = v_class_id and not is_teacher;
      if v_member_count >= 60 then raise exception 'This class already has 60 students'; end if;
      v_kind := 'class';
    else
      update public.invite_codes
      set used_count = used_count + 1, used_by = new.id, used_at = now(), is_active = false
      where upper(code) = upper(v_code) and role = 'student' and invite_kind = 'student_single'
        and is_active and used_count < 1 and (expires_at is null or expires_at > now())
      returning code into v_code_found;
      if v_code_found is null then raise exception 'Invalid VocaQuest student invite'; end if;
      v_kind := 'student_single';
    end if;
  else
    update public.invite_codes
    set used_count = used_count + 1, used_by = new.id, used_at = now(), is_active = false
    where upper(code) = upper(v_code) and role = 'teacher' and is_active and used_count < max_uses
      and (expires_at is null or expires_at > now())
    returning code into v_code_found;
    if v_code_found is null then raise exception 'Invalid VocaQuest teacher invite'; end if;
  end if;
  perform set_config('app.vq_registration', '1', true);
  insert into public.profiles(id, full_name, class_id, is_teacher)
  values (new.id, v_name, case when v_role = 'student' then v_class_id else null end, v_role = 'teacher')
  on conflict (id) do nothing;
  if v_role = 'student' then
    insert into public.invite_redemptions(user_id, invite_kind, invite_code, class_id)
    values (new.id, v_kind, upper(v_code), v_class_id) on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.join_vq_class_once(p_class_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_profile public.profiles%rowtype; v_class public.classes%rowtype; v_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select * into v_profile from public.profiles where id = auth.uid() for update;
  if v_profile.id is null or v_profile.is_teacher then raise exception 'Student profile required'; end if;
  if v_profile.class_id is not null then raise exception 'Class selection has already been locked'; end if;
  select * into v_class from public.classes where id = p_class_id for update;
  if v_class.id is null then raise exception 'Class not found'; end if;
  select count(*) into v_count from public.profiles where class_id = p_class_id and not is_teacher;
  if v_count >= 60 then raise exception 'This class already has 60 students'; end if;
  perform set_config('app.vq_class_assignment', '1', true);
  update public.profiles set class_id = p_class_id, updated_at = now() where id = auth.uid();
  return jsonb_build_object('joined', true, 'class_id', v_class.id, 'class_name', v_class.name);
end;
$$;

create or replace function public.prevent_vq_class_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.class_id is distinct from new.class_id
    and coalesce(current_setting('app.vq_class_assignment', true), '') <> '1'
    and coalesce(current_setting('app.vq_registration', true), '') <> '1' then
    raise exception 'A student class can only be selected once';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_vq_class_change_before_update on public.profiles;
create trigger prevent_vq_class_change_before_update
before update of class_id on public.profiles
for each row execute function public.prevent_vq_class_change();

create or replace function public.refresh_vq_student_level()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_attempts integer; v_correct integer; v_xp integer; v_fill numeric; v_score numeric; v_level text; v_conf numeric;
begin
  if auth.uid() is null or exists(select 1 from public.profiles where id = auth.uid() and is_teacher) then
    raise exception 'Student account required';
  end if;
  select count(*), count(*) filter (where is_correct) into v_attempts, v_correct
  from public.fillblank_records where user_id = auth.uid();
  select coalesce(sum(case when coalesce(prog_data ->> 'xp', '') ~ '^\d+$' then (prog_data ->> 'xp')::integer else 0 end), 0) into v_xp
  from public.student_progress where user_id = auth.uid();
  v_fill := case when v_attempts > 0 then v_correct::numeric / v_attempts * 100 else 60 end;
  v_conf := least(100, v_attempts * 2 + least(v_xp, 1000) / 20.0);
  v_score := round((v_fill * 0.75 + least(v_xp, 1200) / 12.0 * 0.25)::numeric, 2);
  v_level := case when v_score < 60 then 'foundation' when v_score < 82 then 'standard' else 'advanced' end;
  insert into public.student_learning_profiles(user_id, ability_score, ability_level, confidence, vocabulary_xp, fillblank_accuracy, attempts, updated_at)
  values (auth.uid(), v_score, v_level, v_conf, v_xp, v_fill, v_attempts, now())
  on conflict (user_id) do update set ability_score = excluded.ability_score, ability_level = excluded.ability_level,
    confidence = excluded.confidence, vocabulary_xp = excluded.vocabulary_xp, fillblank_accuracy = excluded.fillblank_accuracy,
    attempts = excluded.attempts, updated_at = now();
  return jsonb_build_object('score', v_score, 'level', v_level, 'confidence', v_conf, 'vocabulary_xp', v_xp,
    'fillblank_accuracy', round(v_fill, 2), 'attempts', v_attempts,
    'difficulty', case when v_level = 'foundation' then 1 when v_level = 'advanced' then 3 else 2 end);
end;
$$;

create or replace function public.get_vq_pack_difficulty(p_pack_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_profile jsonb; v_difficulty integer;
begin
  v_profile := public.refresh_vq_student_level();
  v_difficulty := coalesce((v_profile ->> 'difficulty')::integer, 2);
  insert into public.student_pack_difficulty(user_id, pack_id, difficulty, updated_at)
  values (auth.uid(), p_pack_id, v_difficulty, now())
  on conflict (user_id, pack_id) do update set difficulty = excluded.difficulty, updated_at = now();
  return v_difficulty;
end;
$$;

-- Story cache v4: regenerate legacy fixed-12 stories once, then share the dynamic result by pack signature.
create or replace function public.claim_vq_story_generation(
  p_pack_id text,
  p_signature text,
  p_retry boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_story jsonb;
  v_words integer;
  v_chapters integer;
  v_beats integer;
  v_started timestamptz;
  v_inserted boolean := false;
begin
  if auth.uid() is null or not public.is_vq_teacher() then return jsonb_build_object('claimed', false, 'reason', 'forbidden'); end if;
  if nullif(trim(p_pack_id), '') is null or p_signature !~ '^[a-f0-9]{64}$' then return jsonb_build_object('claimed', false, 'reason', 'invalid'); end if;
  select jsonb_array_length(words) into v_words from public.word_packs where id = p_pack_id for update;
  if v_words is null then return jsonb_build_object('claimed', false, 'reason', 'not_found'); end if;
  v_chapters := greatest(1, ceil(v_words / 10.0)::integer);
  v_beats := least(v_chapters, 48);
  insert into public.vq_story_library(signature, story_data)
  values (p_signature, jsonb_build_object('version', 4, 'status', 'generating', 'signature', p_signature, 'chapterCount', v_chapters, 'startedAt', now()))
  on conflict (signature) do nothing returning true into v_inserted;
  if coalesce(v_inserted, false) then
    update public.word_packs set story_data = (select story_data from public.vq_story_library where signature = p_signature), updated_at = now() where id = p_pack_id;
    return jsonb_build_object('claimed', true);
  end if;
  select story_data into v_story from public.vq_story_library where signature = p_signature for update;
  if coalesce((v_story->>'version')::integer, 0) >= 4
    and coalesce((v_story->>'chapterCount')::integer, 0) = v_chapters
    and jsonb_array_length(coalesce(v_story->'story'->'beats', '[]'::jsonb)) = v_beats
    and (v_story->>'status' = 'ready' or (v_story->>'status' = 'partial' and not p_retry)) then
    update public.word_packs set story_data = v_story, updated_at = now() where id = p_pack_id;
    return jsonb_build_object('claimed', false, 'cached', true, 'story_data', v_story);
  end if;
  begin v_started := (v_story->>'startedAt')::timestamptz; exception when others then v_started := null; end;
  if v_story->>'status' = 'generating' and v_started > now() - interval '4 minutes' then
    return jsonb_build_object('claimed', false, 'reason', 'generating');
  end if;
  v_story := jsonb_build_object('version', 4, 'status', 'generating', 'signature', p_signature, 'chapterCount', v_chapters, 'startedAt', now());
  update public.vq_story_library set story_data = v_story, updated_at = now() where signature = p_signature;
  update public.word_packs set story_data = v_story, updated_at = now() where id = p_pack_id;
  return jsonb_build_object('claimed', true);
end;
$$;

alter table public.class_invites enable row level security;
alter table public.invite_redemptions enable row level security;
alter table public.student_learning_profiles enable row level security;
alter table public.word_pack_difficulty_variants enable row level security;
alter table public.student_pack_difficulty enable row level security;

create policy class_invites_teacher_read on public.class_invites for select to authenticated using (public.is_vq_class_teacher(class_id));
create policy invite_redemptions_own_read on public.invite_redemptions for select to authenticated using (user_id = auth.uid());
create policy learning_profiles_read on public.student_learning_profiles for select to authenticated using (public.can_view_vq_student(user_id));
create policy variants_read on public.word_pack_difficulty_variants for select to authenticated using (true);
create policy variants_teacher_insert on public.word_pack_difficulty_variants for insert to authenticated with check (public.is_vq_teacher() and generated_by = auth.uid());
create policy variants_teacher_update on public.word_pack_difficulty_variants for update to authenticated using (public.is_vq_teacher()) with check (public.is_vq_teacher());
create policy pack_difficulty_read on public.student_pack_difficulty for select to authenticated using (public.can_view_vq_student(user_id));

drop policy if exists invite_teacher_select on public.invite_codes;
create policy invite_teacher_select on public.invite_codes for select to authenticated using (
  public.is_vq_teacher() and created_by = auth.uid()
);

revoke all on function public.vq_random_code(text, integer) from public, anon, authenticated;
revoke all on function public.create_vq_class(text) from public, anon;
revoke all on function public.create_vq_student_invite(integer) from public, anon;
revoke all on function public.get_vq_invite_details(text, text) from public;
revoke all on function public.validate_vq_invite(text, text) from public;
revoke all on function public.join_vq_class_once(uuid) from public, anon;
revoke all on function public.refresh_vq_student_level() from public, anon;
revoke all on function public.get_vq_pack_difficulty(text) from public, anon;
revoke all on function public.complete_vq_registration(text, text, text, uuid) from authenticated;
revoke all on function public.consume_vq_invite(text, text) from authenticated;
grant execute on function public.create_vq_class(text) to authenticated;
grant execute on function public.create_vq_student_invite(integer) to authenticated;
grant execute on function public.get_vq_invite_details(text, text) to anon, authenticated;
grant execute on function public.validate_vq_invite(text, text) to anon, authenticated;
grant execute on function public.join_vq_class_once(uuid) to authenticated;
grant execute on function public.refresh_vq_student_level() to authenticated;
grant execute on function public.get_vq_pack_difficulty(text) to authenticated;
revoke all on function public.claim_vq_story_generation(text, text, boolean) from public, anon;
grant execute on function public.claim_vq_story_generation(text, text, boolean) to authenticated;

create index if not exists idx_class_invites_code on public.class_invites(upper(code));
create index if not exists idx_invites_created_by_kind on public.invite_codes(created_by, invite_kind, created_at desc);
create index if not exists idx_profiles_class_students on public.profiles(class_id) where not is_teacher;
create index if not exists idx_fillblank_questions_variant on public.fillblank_questions(pack_id, stage_num, difficulty);
