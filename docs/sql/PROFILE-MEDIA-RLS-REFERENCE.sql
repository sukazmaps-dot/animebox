-- Equivalent to the verified existing production policies. Reference only.
-- Keep the private signed-upload + server byte-inspection pipeline.
-- Do NOT add authenticated INSERT/UPDATE to either bucket.
begin;
drop policy if exists "Profile media public read" on storage.objects;
create policy "Profile media public read" on storage.objects
  for select to public using (bucket_id = 'profile-media');
drop policy if exists "Users delete own profile media" on storage.objects;
create policy "Users delete own profile media" on storage.objects
  for delete to authenticated using (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
commit;
-- Publishing INSERTs use service-role only after the application verifies
-- user_id, pending path, actual MIME, pixels, animation and live Premium rights.
-- A browser owner cannot use a direct upsert to bypass those checks.
