export async function checkRateLimit(identifier: string, endpoint: string): Promise<boolean> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  const maxRequests = parseInt(Deno.env.get('RATE_LIMIT_MAX_REQUESTS') || '100');
  const windowMinutes = parseInt(Deno.env.get('RATE_LIMIT_WINDOW_MINUTES') || '15');
  
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  
  // Contar requests en la ventana actual
  const countResponse = await fetch(
    `${supabaseUrl}/rest/v1/rate_limits?identifier=eq.${identifier}&endpoint=eq.${endpoint}&window_start=gte.${windowStart}&select=count`,
    {
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey
      }
    }
  );
  
  if (!countResponse.ok) {
    console.error('Error checking rate limit:', await countResponse.text());
    return true; // Permitir en caso de error
  }
  
  const counts = await countResponse.json();
  const currentCount = counts.reduce((sum: number, item: any) => sum + item.count, 0);
  
  if (currentCount >= maxRequests) {
    return false; // Rate limit excedido
  }
  
  // Registrar este request
  await fetch(`${supabaseUrl}/rest/v1/rate_limits`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceRoleKey}`,
      'apikey': serviceRoleKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      identifier,
      endpoint,
      count: 1,
      window_start: new Date().toISOString()
    })
  });
  
  return true;
}