import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://xlkntakqdvqlhlpsngjl.supabase.co';
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_7RiggmHDt_BDbx6pTSeuag_70cZAPjF';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
