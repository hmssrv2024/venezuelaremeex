export async function verifyAuth(req: Request): Promise<{ user: any; isAdmin: boolean }> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    throw new Error('No authorization header');
  }

  const token = authHeader.replace('Bearer ', '');
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Verificar token y obtener usuario
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': serviceRoleKey
    }
  });

  if (!userResponse.ok) {
    throw new Error('Token inválido');
  }

  const userData = await userResponse.json();
  
  // Verificar si es admin
  const profileResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userData.id}&select=role`, {
    headers: {
      'Authorization': `Bearer ${serviceRoleKey}`,
      'apikey': serviceRoleKey
    }
  });

  let isAdmin = false;
  if (profileResponse.ok) {
    const profiles = await profileResponse.json();
    isAdmin = profiles[0]?.role === 'admin';
  }

  return { user: userData, isAdmin };
}