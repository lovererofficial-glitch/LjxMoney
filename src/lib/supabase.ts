import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * The app must remain fully usable offline/local when Supabase is not
 * configured. Only the public project URL and publishable/anon key are read
 * from EXPO_PUBLIC_* variables; no secret or service-role key ever ships.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

let cachedClient: SupabaseClient | null = null;

export const getSupabaseClient = (): SupabaseClient | null => {
  if (!isSupabaseConfigured) {
    return null;
  }
  if (!cachedClient) {
    cachedClient = createClient(supabaseUrl as string, supabasePublishableKey as string, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return cachedClient;
};
