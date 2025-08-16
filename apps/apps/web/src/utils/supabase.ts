import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ChatConfig } from '../types/config';

let supabaseClient: SupabaseClient | null = null;

export function initSupabase(config: ChatConfig): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(config.supabaseUrl, config.supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });
  }
  return supabaseClient;
}

export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    throw new Error('Supabase no está inicializado. Llama a initSupabase() primero.');
  }
  return supabaseClient;
}

export async function ensureAuth(): Promise<string> {
  const supabase = getSupabase();
  
  let { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    // Crear sesión anónima para usuarios no registrados
    const { data, error } = await supabase.auth.signInAnonymously();
    
    if (error) {
      throw new Error(`Error de autenticación: ${error.message}`);
    }
    
    session = data.session;
  }
  
  if (!session?.user?.id) {
    throw new Error('No se pudo obtener ID de usuario');
  }
  
  return session.user.id;
}

export async function getCurrentUser() {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}