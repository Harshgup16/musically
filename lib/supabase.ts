import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

let supabase: SupabaseClient;

try {
  const supabaseUrl = Constants.expoConfig?.extra?.SUPABASE_URL;
  const supabaseAnonKey = Constants.expoConfig?.extra?.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase configuration. Please check your environment variables and app configuration.');
  }

  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false
    }
  });
} catch (error) {
  console.error('Error initializing Supabase client:', error);
  throw error;
}

export { supabase };

export interface Song {
  id: string;
  title: string;
  artist: string;
  url: string;
  cover_url: string;
  duration: number;
  created_at: string;
}