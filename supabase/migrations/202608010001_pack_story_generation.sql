-- One-time, shared AI story generation for each word pack.

alter table public.word_packs
  add column if not exists story_data jsonb not null default '{}'::jsonb;

alter table public.word_packs
  drop constraint if exists word_packs_story_data_object;
alter table public.word_packs
  add constraint word_packs_story_data_object
  check (jsonb_typeof(story_data) = 'object');

create index if not exists idx_word_packs_story_signature
  on public.word_packs ((story_data->>'signature'));

create or replace function public.claim_vq_story_generation(
  p_pack_id text,
  p_signature text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_story jsonb;
  v_started timestamptz;
begin
  if auth.uid() is null or not public.is_vq_teacher() then
    return jsonb_build_object('claimed', false, 'reason', 'forbidden');
  end if;
  if nullif(trim(p_pack_id), '') is null or p_signature !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('claimed', false, 'reason', 'invalid');
  end if;

  select story_data into v_story
  from public.word_packs
  where id = p_pack_id
  for update;

  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'not_found');
  end if;

  if v_story->>'signature' = p_signature and v_story->>'status' = 'ready' then
    return jsonb_build_object('claimed', false, 'cached', true, 'story_data', v_story);
  end if;

  begin
    v_started := (v_story->>'startedAt')::timestamptz;
  exception when others then
    v_started := null;
  end;

  if v_story->>'signature' = p_signature
     and v_story->>'status' = 'generating'
     and v_started > now() - interval '4 minutes' then
    return jsonb_build_object('claimed', false, 'reason', 'generating');
  end if;

  update public.word_packs
  set story_data = jsonb_build_object(
        'version', 3,
        'status', 'generating',
        'signature', p_signature,
        'startedAt', now()
      ),
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
  v_id text;
begin
  if auth.uid() is null or not public.is_vq_teacher() then return false; end if;
  if jsonb_typeof(p_story_data) <> 'object'
     or p_story_data->>'signature' <> p_signature
     or p_story_data->>'status' not in ('ready', 'partial', 'failed') then
    return false;
  end if;

  update public.word_packs
  set story_data = p_story_data,
      updated_at = now()
  where id = p_pack_id
    and story_data->>'signature' = p_signature
    and story_data->>'status' = 'generating'
  returning id into v_id;
  return v_id is not null;
end;
$$;

revoke all on function public.claim_vq_story_generation(text, text) from public, anon;
revoke all on function public.finish_vq_story_generation(text, text, jsonb) from public, anon;
grant execute on function public.claim_vq_story_generation(text, text) to authenticated;
grant execute on function public.finish_vq_story_generation(text, text, jsonb) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'story-assets',
  'story-assets',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists story_assets_teacher_insert on storage.objects;
drop policy if exists story_assets_teacher_update on storage.objects;
drop policy if exists story_assets_teacher_delete on storage.objects;
drop policy if exists story_assets_authenticated_read on storage.objects;

create policy story_assets_teacher_insert
on storage.objects for insert to authenticated
with check (bucket_id = 'story-assets' and public.is_vq_teacher());

create policy story_assets_teacher_update
on storage.objects for update to authenticated
using (bucket_id = 'story-assets' and public.is_vq_teacher())
with check (bucket_id = 'story-assets' and public.is_vq_teacher());

create policy story_assets_teacher_delete
on storage.objects for delete to authenticated
using (bucket_id = 'story-assets' and public.is_vq_teacher());
