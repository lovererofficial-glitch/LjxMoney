import type { SupabaseClient } from '@supabase/supabase-js';

export interface Profile {
  displayName: string | null;
  avatarUrl: string | null;
}

const errorMessage = (error: { message: string } | null): Error | null =>
  error ? new Error(error.message) : null;

export const fetchProfile = async (
  client: SupabaseClient,
  userId: string,
): Promise<Profile> => {
  const { data, error } = await client
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', userId)
    .maybeSingle();
  const failure = errorMessage(error);
  if (failure) {
    throw failure;
  }
  return {
    displayName: (data?.display_name as string | null) ?? null,
    avatarUrl: (data?.avatar_url as string | null) ?? null,
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
