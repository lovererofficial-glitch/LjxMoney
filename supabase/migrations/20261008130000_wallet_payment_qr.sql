-- Wallet payment QR assets are stored in a private bucket. Wallet rows only
-- contain the object path; image bytes never enter the finance sync payload.
alter table public.wallets
  add column if not exists payment_qr_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wallet-payment-qrs',
  'wallet-payment-qrs',
  false,
  12582912,
  array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "wallet_payment_qrs_select_own" on storage.objects;
create policy "wallet_payment_qrs_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'wallet-payment-qrs'
    and (storage.foldername(name))[1] = auth.uid()::text
    and array_length(storage.foldername(name), 1) = 2
    and split_part(name, '/', 3) ~ '^payment-qr-[A-Za-z0-9_-]+$'
    and exists (
      select 1 from public.wallets wallet
      where wallet.user_id = auth.uid()
        and wallet.id = (storage.foldername(name))[2]
    )
  );

drop policy if exists "wallet_payment_qrs_insert_own" on storage.objects;
create policy "wallet_payment_qrs_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'wallet-payment-qrs'
    and (storage.foldername(name))[1] = auth.uid()::text
    and array_length(storage.foldername(name), 1) = 2
    and split_part(name, '/', 3) ~ '^payment-qr-[A-Za-z0-9_-]+$'
    and exists (
      select 1 from public.wallets wallet
      where wallet.user_id = auth.uid()
        and wallet.id = (storage.foldername(name))[2]
    )
  );

drop policy if exists "wallet_payment_qrs_update_own" on storage.objects;
create policy "wallet_payment_qrs_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'wallet-payment-qrs'
    and (storage.foldername(name))[1] = auth.uid()::text
    and array_length(storage.foldername(name), 1) = 2
    and split_part(name, '/', 3) ~ '^payment-qr-[A-Za-z0-9_-]+$'
    and exists (
      select 1 from public.wallets wallet
      where wallet.user_id = auth.uid()
        and wallet.id = (storage.foldername(name))[2]
    )
  )
  with check (
    bucket_id = 'wallet-payment-qrs'
    and (storage.foldername(name))[1] = auth.uid()::text
    and array_length(storage.foldername(name), 1) = 2
    and split_part(name, '/', 3) ~ '^payment-qr-[A-Za-z0-9_-]+$'
    and exists (
      select 1 from public.wallets wallet
      where wallet.user_id = auth.uid()
        and wallet.id = (storage.foldername(name))[2]
    )
  );

drop policy if exists "wallet_payment_qrs_delete_own" on storage.objects;
create policy "wallet_payment_qrs_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'wallet-payment-qrs'
    and (storage.foldername(name))[1] = auth.uid()::text
    and array_length(storage.foldername(name), 1) = 2
    and split_part(name, '/', 3) ~ '^payment-qr-[A-Za-z0-9_-]+$'
    and exists (
      select 1 from public.wallets wallet
      where wallet.user_id = auth.uid()
        and wallet.id = (storage.foldername(name))[2]
    )
  );