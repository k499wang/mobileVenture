import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';
import { env, serviceStatus } from '@/config/env';

// No placeholder client: disabled services cannot accidentally make network requests.
export const supabase = serviceStatus.supabase ? createClient(env.supabaseUrl!, env.supabasePublishableKey!, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true,
    detectSessionInUrl: false, lock: processLock },
}) : null;
