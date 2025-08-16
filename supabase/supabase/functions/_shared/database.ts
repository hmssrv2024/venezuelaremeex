export async function createConversation(userId: string, title: string = 'Nueva Conversación') {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  const response = await fetch(`${supabaseUrl}/rest/v1/conversations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceRoleKey}`,
      'apikey': serviceRoleKey,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      user_id: userId,
      title,
      status: 'active'
    })
  });
  
  if (!response.ok) {
    throw new Error('Error creating conversation');
  }
  
  const data = await response.json();
  return data[0];
}

export async function getConversationHistory(conversationId: string, limit: number = 20) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  const response = await fetch(
    `${supabaseUrl}/rest/v1/messages?conversation_id=eq.${conversationId}&order=created_at.asc&limit=${limit}`,
    {
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey
      }
    }
  );
  
  if (!response.ok) {
    throw new Error('Error fetching conversation history');
  }
  
  return response.json();
}

export async function saveMessage(conversationId: string, sender: string, content: string, type: string = 'text', metadata: any = {}) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  const response = await fetch(`${supabaseUrl}/rest/v1/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceRoleKey}`,
      'apikey': serviceRoleKey,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      conversation_id: conversationId,
      sender,
      content,
      type,
      metadata,
      status: 'sent'
    })
  });
  
  if (!response.ok) {
    throw new Error('Error saving message');
  }
  
  const data = await response.json();
  return data[0];
}

export async function logEvent(name: string, payload: any, conversationId?: string, userId?: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  await fetch(`${supabaseUrl}/rest/v1/events`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceRoleKey}`,
      'apikey': serviceRoleKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name,
      payload,
      conversation_id: conversationId,
      user_id: userId,
      created_at: new Date().toISOString()
    })
  });
}