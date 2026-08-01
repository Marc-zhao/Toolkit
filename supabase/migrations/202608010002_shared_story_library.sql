-- Share one generated world across duplicate uploads of the same word pack.

create table if not exists public.vq_story_library (
  signature text primary key
    check (signature ~ '^[a-f0-9]{64}$'),
  story_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(story_data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vq_story_library enable row level security;
revoke all on table public.vq_story_library from public, anon, authenticated;

insert into public.vq_story_library (signature, story_data)
select story_data->>'signature', story_data
from public.word_packs
where story_data->>'status' in ('ready', 'partial')
  and story_data->>'signature' ~ '^[a-f0-9]{64}$'
on conflict (signature) do update
set story_data = excluded.story_data,
    updated_at = now();

drop function if exists public.claim_vq_story_generation(text, text);

create function public.claim_vq_story_generation(
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
  v_started timestamptz;
  v_inserted boolean := false;
begin
  if auth.uid() is null or not public.is_vq_teacher() then
    return jsonb_build_object('claimed', false, 'reason', 'forbidden');
  end if;
  if nullif(trim(p_pack_id), '') is null or p_signature !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('claimed', false, 'reason', 'invalid');
  end if;

  perform 1
  from public.word_packs
  where id = p_pack_id
  for update;
  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'not_found');
  end if;

  insert into public.vq_story_library (signature, story_data)
  values (
    p_signature,
    jsonb_build_object(
      'version', 3,
      'status', 'generating',
      'signature', p_signature,
      'startedAt', now()
    )
  )
  on conflict (signature) do nothing
  returning true into v_inserted;

  if coalesce(v_inserted, false) then
    update public.word_packs
    set story_data = (
          select story_data
          from public.vq_story_library
          where signature = p_signature
        ),
        updated_at = now()
    where id = p_pack_id;
    return jsonb_build_object('claimed', true);
  end if;

  select story_data into v_story
  from public.vq_story_library
  where signature = p_signature
  for update;

  if v_story->>'status' = 'ready'
     or (v_story->>'status' = 'partial' and not p_retry) then
    update public.word_packs
    set story_data = v_story,
        updated_at = now()
    where id = p_pack_id;
    return jsonb_build_object('claimed', false, 'cached', true, 'story_data', v_story);
  end if;

  begin
    v_started := (v_story->>'startedAt')::timestamptz;
  exception when others then
    v_started := null;
  end;

  if v_story->>'status' = 'generating'
     and v_started > now() - interval '4 minutes' then
    return jsonb_build_object('claimed', false, 'reason', 'generating');
  end if;

  v_story := jsonb_build_object(
    'version', 3,
    'status', 'generating',
    'signature', p_signature,
    'startedAt', now()
  );
  update public.vq_story_library
  set story_data = v_story,
      updated_at = now()
  where signature = p_signature;
  update public.word_packs
  set story_data = v_story,
      updated_at = now()
  where id = p_pack_id;

  return jsonb_build_object('claimed', true);
end;
$$;

create or replace function public.finish_vq_story_generation(
  p_pack_id text,
  p_signature text,
  p_story_data jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_signature text;
begin
  if auth.uid() is null or not public.is_vq_teacher() then return false; end if;
  if jsonb_typeof(p_story_data) <> 'object'
     or p_story_data->>'signature' <> p_signature
     or p_story_data->>'status' not in ('ready', 'partial', 'failed') then
    return false;
  end if;

  update public.vq_story_library
  set story_data = p_story_data,
      updated_at = now()
  where signature = p_signature
    and story_data->>'status' = 'generating'
  returning signature into v_signature;
  if v_signature is null then return false; end if;

  update public.word_packs
  set story_data = p_story_data,
      updated_at = now()
  where id = p_pack_id
     or story_data->>'signature' = p_signature;
  return true;
end;
$$;

revoke all on function public.claim_vq_story_generation(text, text, boolean) from public, anon;
revoke all on function public.finish_vq_story_generation(text, text, jsonb) from public, anon;
grant execute on function public.claim_vq_story_generation(text, text, boolean) to authenticated;
grant execute on function public.finish_vq_story_generation(text, text, jsonb) to authenticated;
