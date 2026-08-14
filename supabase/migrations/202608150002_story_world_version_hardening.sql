-- A completed world is immutable until a teacher explicitly claims it for retry.

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
  select * into v_version
  from public.vq_story_versions
  where id = p_version_id and status = 'generating'
  for update;
  if v_version.id is null or p_story_data->>'signature' <> v_version.signature then
    return jsonb_build_object('saved', false, 'reason', 'version_not_claimed');
  end if;
  select active_story_version_id into v_active from public.word_packs where id = p_pack_id for update;
  if not found then return jsonb_build_object('saved', false, 'reason', 'pack_not_found'); end if;

  v_data := p_story_data || jsonb_build_object('worldVersionId', v_version.id, 'worldVersionNo', v_version.version_no);
  update public.vq_story_versions
  set status = v_data->>'status', story_data = v_data, updated_at = now()
  where id = v_version.id and status = 'generating';

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

revoke all on function public.finish_vq_story_version(text, uuid, jsonb) from public, anon;
grant execute on function public.finish_vq_story_version(text, uuid, jsonb) to authenticated;
