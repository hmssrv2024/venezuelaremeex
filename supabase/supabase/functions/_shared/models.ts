export interface LLMProvider {
  name: string;
  textModel: string;
  visionModel?: string;
  sttModel?: string;
  baseUrl: string;
  apiKey: string;
}

export function getProviders(): { minimax: LLMProvider; gemini: LLMProvider } {
  return {
    minimax: {
      name: 'minimax',
      textModel: Deno.env.get('MINIMAX_TEXT_MODEL') || 'chat-model',
      visionModel: Deno.env.get('MINIMAX_VISION_MODEL') || 'vision-model',
      sttModel: Deno.env.get('MINIMAX_STT_MODEL') || 'stt-model',
      baseUrl: Deno.env.get('MINIMAX_BASE_URL') || 'https://api.minimax.ai',
      apiKey: Deno.env.get('MINIMAX_API_KEY') || ''
    },
    gemini: {
      name: 'gemini',
      textModel: 'gemini-1.5-flash',
      visionModel: 'gemini-1.5-flash',
      baseUrl: Deno.env.get('GEMINI_BASE_URL') || 'https://generativelanguage.googleapis.com',
      apiKey: Deno.env.get('GEMINI_API_KEY') || ''
    }
  };
}

export async function callMiniMax(provider: LLMProvider, endpoint: string, payload: any) {
  const response = await fetch(`${provider.baseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`MiniMax API error: ${error}`);
  }

  return response.json();
}

export async function callGemini(provider: LLMProvider, endpoint: string, payload: any) {
  const response = await fetch(`${provider.baseUrl}${endpoint}?key=${provider.apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  return response.json();
}

export function selectBestModel(messageType: string, providers: { minimax: LLMProvider; gemini: LLMProvider }) {
  // Lógica para seleccionar el mejor modelo según el tipo de mensaje
  switch (messageType) {
    case 'vision':
      return 'gemini'; // Gemini es generalmente mejor para visión
    case 'audio':
    case 'transcription':
      return 'minimax'; // Asumimos que MiniMax tiene mejor STT
    case 'text':
    default:
      return 'gemini'; // Gemini por defecto para texto
  }
}