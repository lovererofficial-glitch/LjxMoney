import type { SupabaseClient } from '@supabase/supabase-js';

export interface Profile {
  displayName: string | null;
  avatarPath: string | null;
}

const errorMessage = (error: { message: string } | null): Error | null =>
  error ? new Error(error.message) : null;

export const fetchProfile = async (
  client: SupabaseClient,
  userId: string,
): Promise<Profile> => {
  const { data, error } = await client
    .from('profiles')
    .select('display_name, avatar_path')
    .eq('id', userId)
    .maybeSingle();
  const failure = errorMessage(error);
  if (failure) {
    throw failure;
  }
  return {
    displayName: (data?.display_name as string | null) ?? null,
    avatarPath: (data?.avatar_path as string | null) ?? null,
  };
};

export const saveProfileDisplayName = async (
  client: SupabaseClient,
  userId: string,
  displayName: string,
): Promise<void> => {
  const { error } = await client
    .from('profiles')
    .upsert(
      {
        id: userId,
        display_name: displayName || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
  const failure = errorMessage(error);
  if (failure) {
    throw failure;
  }
};

export const saveProfileAvatarPath = async (
  client: SupabaseClient,
  userId: string,
  avatarPath: string | null,
): Promise<void> => {
  const { error } = await client
    .from('profiles')
    .upsert(
      {
        id: userId,
        avatar_path: avatarPath || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
  const failure = errorMessage(error);
  if (failure) {
    throw failure;
  }
};
