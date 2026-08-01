-- Public object URLs remain readable; listing every generated asset is unnecessary.

drop policy if exists story_assets_authenticated_read on storage.objects;
