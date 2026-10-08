-- Store only private avatar object paths in profiles; image bytes stay in Storage.
alter table public.profiles
  add column if not exists avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile_avatars_select_own" on storage.objects;
create policy "profile_avatars_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] = 'avatar'
    and array_length(storage.foldername(name), 1) = 2
    and split_part(name, '/', 3) ~ '^[A-Za-z0-9_-]+[.](png|jpg|webp|heic|heif)$'
    and exists (
      select 1 from public.profiles profile
      where profile.id = auth.uid()
    )
  );

drop policy if exists "profile_avatars_insert_own" on storage.objects;
create policy "profile_avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] = 'avatar'
    and array_length(storage.foldername(name), 1) = 2
    and split_part(name, '/', 3) ~ '^[A-Za-z0-9_-]+[.](png|jpg|webp|heic|heif)$'
    and exists (
      select 1 from public.profiles profile
      where profile.id = auth.uid()
    )
  );

drop policy if exists "profile_avatars_update_own" on storage.objects;
create policy "profile_avatars_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] = 'avatar'
    and array_length(storage.foldername(name), 1) = 2
    and split_part(name, '/', 3) ~ '^[A-Za-z0-9_-]+[.](png|jpg|webp|heic|heif)$'
    and exists (
      select 1 from public.profiles profile
      where profile.id = auth.uid()
    )
  )
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] = 'avatar'
    and array_length(storage.foldername(name), 1) = 2
    and split_part(name, '/', 3) ~ '^[A-Za-z0-9_-]+[.](png|jpg|webp|heic|heif)$'
    and exists (
      select 1 from public.profiles profile
      where profile.id = auth.uid()
    )
  );

drop policy if exists "profile_avatars_delete_own" on storage.objects;
create policy "profile_avatars_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] = 'avatar'
    and array_length(storage.foldername(name), 1) = 2
    and split_part(name, '/', 3) ~ '^[A-Za-z0-9_-]+[.](png|jpg|webp|heic|heif)$'
    and exists (
      select 1 from public.profiles profile
      where profile.id = auth.uid()
    )
  );
