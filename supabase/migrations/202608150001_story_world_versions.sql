-- Preserve up to five generated worlds for each unique word-pack signature.

create table if not exists public.vq_story_versions (
  id uuid primary key default gen_random_uuid(),
  signature text not null check (signature ~ '^[a-f0-9]{64}$'),
  version_no integer not null check (version_no between 1 and 5),
  status text not null default 'generating' check (status in ('generating', 'ready', 'partial', 'failed')),
  story_data jsonb not null default '{}'::jsonb check (jsonb_typeof(story_data) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (signature, version_no)
);

alter table public.word_packs
  add column if not exists active_story_version_id uuid references public.vq_story_versions(id) on delete set null;

create index if not exists idx_vq_story_versions_signature
  on public.vq_story_versions(signature, version_no);
create index if not exists idx_word_packs_active_story_version
  on public.word_packs(active_story_version_id);

alter table public.vq_story_versions enable row level security;
revoke all on table public.vq_story_versions from public, anon, authenticated;

insert into public.vq_story_versions(signature, version_no, status, story_data)
select distinct on (story_data->>'signature')
  story_data->>'signature',
  1,
  story_data->>'status',
  story_data
from public.word_packs
where story_data->>'status' in ('ready', 'partial')
  and story_data->>'signature' ~ '^[a-f0-9]{64}$'
order by story_data->>'signature', updated_at desc
on conflict (signature, version_no) do nothing;

update public.vq_story_versions
set story_data = story_data
    || jsonb_build_object('worldVersionId', id, 'worldVersionNo', version_no),
    updated_at = now()
where not (story_data ? 'worldVersionId');

update public.word_packs p
set active_story_version_id = v.id,
    story_data = v.story_data,
    updated_at = now()
from public.vq_story_versions v
where p.active_story_version_id is null
  and p.story_data->>'signature' = v.signature
  and v.version_no = 1;

create or replace function public.list_vq_story_versions(p_pack_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_signature text;
  v_active uuid;
  v_versions jsonb;
begin
  if auth.uid() is null or not public.is_vq_teacher() then
    return jsonb_build_object('allowed', false, 'reason', 'forbidden', 'versions', '[]'::jsonb);
  end if;

  select story_data->>'signature', active_story_version_id
  into v_signature, v_active
  from public.word_packs
  where id = p_pack_id;

  if v_signature is null or v_signature !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('allowed', true, 'activeVersionId', null, 'versions', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'versionNo', version_no,
    'status', status,
    'storyData', story_data,
    'createdAt', created_at,
    'isActive', id = v_active
  ) order by version_no), '[]'::jsonb)
  into v_versions
  from public.vq_story_versions
  where signature = v_signature;

  return jsonb_build_object(
    'allowed', true,
    'signature', v_signature,
    'activeVersionId', v_active,
    'maxVersions', 5,
    'versions', v_versions
  );
end;
$$;

create or replace function public.claim_vq_story_version(
  p_pack_id text,
  p_signature text,
  p_create_new boolean default false,
  p_retry_version_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active uuid;
  v_existing public.vq_story_versions%rowtype;
  v_version public.vq_story_versions%rowtype;
  v_count integer;
  v_next integer;
  v_started timestamptz;
begin
  if auth.uid() is null or not public.is_vq_teacher() then
    return jsonb_build_object('claimed', false, 'reason', 'forbidden');
  end if;
  if nullif(trim(p_pack_id), '') is null or p_signature !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('claimed', false, 'reason', 'invalid');
  end if;

  perform pg_advisory_xact_lock(hashtext(p_signature));
  select active_story_version_id into v_active
  from public.word_packs
  where id = p_pack_id
  for update;
  if not found then return jsonb_build_object('claimed', false, 'reason', 'not_found'); end if;

  if p_retry_version_id is not null then
    select * into v_version
    from public.vq_story_versions
    where id = p_retry_version_id and signature = p_signature
    for update;
    if v_version.id is null then return jsonb_build_object('claimed', false, 'reason', 'version_not_found'); end if;
    begin v_started := (v_version.story_data->>'startedAt')::timestamptz; exception when others then v_started := null; end;
    if v_version.status = 'generating' and v_started > now() - interval '4 minutes' then
      return jsonb_build_object('claimed', false, 'reason', 'generating');
    end if;
    update public.vq_story_versions
    set status = 'generating',
        story_data = story_data || jsonb_build_object('status', 'generating', 'startedAt', now()),
        updated_at = now()
    where id = v_version.id;
    return jsonb_build_object('claimed', true, 'versionId', v_version.id, 'versionNo', v_version.version_no, 'story_data', v_version.story_data);
  end if;

  if not p_create_new then
    if v_active is not null then
      select * into v_existing from public.vq_story_versions where id = v_active;
      if v_existing.status in ('ready', 'partial') then
        return jsonb_build_object('claimed', false, 'cached', true, 'versionId', v_existing.id, 'versionNo', v_existing.version_no, 'story_data', v_existing.story_data);
      end if;
    end if;
    select * into v_existing
    from public.vq_story_versions
    where signature = p_signature and status in ('ready', 'partial')
    order by version_no
    limit 1;
    if v_existing.id is not null then
      update public.word_packs
      set active_story_version_id = v_existing.id, story_data = v_existing.story_data, updated_at = now()
      where id = p_pack_id;
      return jsonb_build_object('claimed', false, 'cached', true, 'versionId', v_existing.id, 'versionNo', v_existing.version_no, 'story_data', v_existing.story_data);
    end if;
  end if;

  select count(*), coalesce(max(version_no), 0) + 1 into v_count, v_next
  from public.vq_story_versions where signature = p_signature;
  if v_count >= 5 then return jsonb_build_object('claimed', false, 'reason', 'limit_reached'); end if;

  insert into public.vq_story_versions(signature, version_no, status, story_data, created_by)
  values (p_signature, v_next, 'generating', jsonb_build_object(
    'version', 5,
    'status', 'generating',
    'signature', p_signature,
    'worldVersionNo', v_next,
    'startedAt', now()
  ), auth.uid())
  returning * into v_version;

  if v_active is null then
    update public.word_packs
    set story_data = v_version.story_data, updated_at = now()
    where id = p_pack_id;
  end if;

  return jsonb_build_object('claimed', true, 'versionId', v_version.id, 'versionNo', v_version.version_no);
end;
$$;

create or replace function public.finish_vq_story_version(
  p_pack_id text,
  p_version_id uuid,
  p_story_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version public.vq_story_versions%rowtype;
  v_active uuid;
  v_data jsonb;
begin
  if auth.uid() is null or not public.is_vq_teacher() then return jsonb_build_object('saved', false, 'reason', 'forbidden'); end if;
  if jsonb_typeof(p_story_data) <> 'object' or p_story_data->>'status' not in ('ready', 'partial', 'failed') then
    return jsonb_build_object('saved', false, 'reason', 'invalid');
  end if;
  select * into v_version from public.vq_story_versions where id = p_version_id for update;
  if v_version.id is null or p_story_data->>'signature' <> v_version.signature then
    return jsonb_build_object('saved', false, 'reason', 'version_not_found');
  end if;
  select active_story_version_id into v_active from public.word_packs where id = p_pack_id for update;
  if not found then return jsonb_build_object('saved', false, 'reason', 'pack_not_found'); end if;

  v_data := p_story_data || jsonb_build_object('worldVersionId', v_version.id, 'worldVersionNo', v_version.version_no);
  update public.vq_story_versions
  set status = v_data->>'status', story_data = v_data, updated_at = now()
  where id = v_version.id;

  if v_active is null and v_data->>'status' in ('ready', 'partial') then
    update public.word_packs
    set active_story_version_id = v_version.id, story_data = v_data, updated_at = now()
    where id = p_pack_id;
    v_active := v_version.id;
  elsif v_active = v_version.id then
    update public.word_packs set story_data = v_data, updated_at = now() where id = p_pack_id;
  end if;

  return jsonb_build_object('saved', true, 'isActive', v_active = v_version.id, 'storyData', v_data);
end;
$$;

create or replace function public.select_vq_story_version(p_pack_id text, p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_version public.vq_story_versions%rowtype;
begin
  if auth.uid() is null or not public.is_vq_teacher() then return jsonb_build_object('selected', false, 'reason', 'forbidden'); end if;
  select v.* into v_version
  from public.vq_story_versions v
  join public.word_packs p on p.id = p_pack_id and p.story_data->>'signature' = v.signature
  where v.id = p_version_id and v.status in ('ready', 'partial');
  if v_version.id is null then return jsonb_build_object('selected', false, 'reason', 'version_not_found'); end if;
  update public.word_packs
  set active_story_version_id = v_version.id, story_data = v_version.story_data, updated_at = now()
  where id = p_pack_id;
  return jsonb_build_object('selected', true, 'storyData', v_version.story_data, 'versionId', v_version.id);
end;
$$;

revoke all on function public.list_vq_story_versions(text) from public, anon;
revoke all on function public.claim_vq_story_version(text, text, boolean, uuid) from public, anon;
revoke all on function public.finish_vq_story_version(text, uuid, jsonb) from public, anon;
revoke all on function public.select_vq_story_version(text, uuid) from public, anon;
grant execute on function public.list_vq_story_versions(text) to authenticated;
grant execute on function public.claim_vq_story_version(text, text, boolean, uuid) to authenticated;
grant execute on function public.finish_vq_story_version(text, uuid, jsonb) to authenticated;
grant execute on function public.select_vq_story_version(text, uuid) to authenticated;
