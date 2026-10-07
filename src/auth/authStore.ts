import { create } from 'zustand';

import { getSupabaseClient } from '../lib/supabase';
import { createAuthStore } from './authStoreCore';
import { createSupabaseAuthApi } from './authSupabaseApi';

const supabase = getSupabaseClient();

export const useAuthStore = create(
  supabase ? createAuthStore(createSupabaseAuthApi(supabase)) : createAuthStore(null),
);
