import AsyncStorage from '@react-native-async-storage/async-storage';

import { appDefinition } from '@/config/app-definition';
import { supabase } from '@/lib/supabase';

type AppData = Record<string, unknown>;
const localKey = `factory.${appDefinition.id}.app-data`;

/** Local-first generic storage. Cloud sync is optional and protected by RLS. */
export async function readAppData(): Promise<AppData> {
  const local = await AsyncStorage.getItem(localKey);
  return local ? JSON.parse(local) as AppData : {};
}

export async function saveAppData(next: AppData) {
  await AsyncStorage.setItem(localKey, JSON.stringify(next));
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from('app_data').upsert({ app_id: appDefinition.id, user_id: user.id, data: next, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function hydrateAppDataFromCloud(): Promise<AppData> {
  if (!supabase) return readAppData();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return readAppData();
  const { data, error } = await supabase.from('app_data').select('data').eq('app_id', appDefinition.id).eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  if (!data) return readAppData();
  await AsyncStorage.setItem(localKey, JSON.stringify(data.data));
  return data.data as AppData;
}
