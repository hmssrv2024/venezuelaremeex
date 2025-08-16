import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const MINIMAX_API_KEY = Deno.env.get('MINIMAX_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

interface VisionRequest {
  image_url?: string
  image_base64?: string
  prompt?: string
  model_provider?: 'gemini' | 'minimax'
  conversation_id?: string
  user_id?: string
}

interface VisionResponse {
  analysis: string
  model_used: string
  timestamp: string
}

async function analyzeWithGemini(imageData: string, prompt: string, isBase64: boolean = false): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY no está configurada')
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`
  
  const requestBody = {
    contents: [{
      parts: [
        {
          text: prompt || "Analiza esta imagen en detalle. Describe lo que ves y proporciona información relevante."
        },
        {
          inline_data: {
            mime_type: "image/jpeg",
            data: isBase64 ? imageData : await imageUrlToBase64(imageData)
          }
        }
      ]
    }],
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 1024,
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorData = await response.text()
    throw new Error(`Error de Gemini API: ${response.status} - ${errorData}`)
  }

  const data = await response.json()
  return data.candidates[0]?.content?.parts[0]?.text || 'No se pudo analizar la imagen'
}

async function analyzeWithMiniMax(imageData: string, prompt: string, isBase64: boolean = false): Promise<string> {
  if (!MINIMAX_API_KEY) {
    throw new Error('MINIMAX_API_KEY no está configurada')
  }

  // MiniMax vision API endpoint y formato
  const url = 'https://api.minimax.chat/v1/text/chatcompletion_pro'
  
  const imageUrl = isBase64 ? `data:image/jpeg;base64,${imageData}` : imageData
  
  const requestBody = {
    model: 'abab6.5s-chat',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: prompt || "Analiza esta imagen en detalle. Describe lo que ves y proporciona información relevante."
          },
          {
            type: 'image_url',
            image_url: {
              url: imageUrl
            }
          }
        ]
      }
    ],
    temperature: 0.7,
    max_tokens: 1024
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MINIMAX_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorData = await response.text()
    throw new Error(`Error de MiniMax API: ${response.status} - ${errorData}`)
  }

  const data = await response.json()
  return data.choices[0]?.message?.content || 'No se pudo analizar la imagen'
}

async function imageUrlToBase64(url: string): Promise<string> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`No se pudo cargar la imagen: ${response.status}`)
    }
    
    const arrayBuffer = await response.arrayBuffer()
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
    return base64
  } catch (error) {
    throw new Error(`Error al convertir imagen a base64: ${error.message}`)
  }
}

async function logVisionAnalysis(conversationId: string, userId: string, analysis: string, modelUsed: string) {
  try {
    await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        user_id: userId,
        content: `[ANÁLISIS DE IMAGEN - ${modelUsed.toUpperCase()}]: ${analysis}`,
        message_type: 'vision_analysis',
        metadata: {
          model_used: modelUsed,
          analysis_type: 'image_vision'
        }
      })
  } catch (error) {
    console.error('Error al guardar análisis de visión:', error)
  }
}

serve(async (req: Request) => {
  // Manejar CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const requestData: VisionRequest = await req.json()
    const {
      image_url,
      image_base64,
      prompt,
      model_provider = 'gemini',
      conversation_id,
      user_id
    } = requestData

    // Validar que se proporcione una imagen
    if (!image_url && !image_base64) {
      return new Response(
        JSON.stringify({ error: 'Se requiere image_url o image_base64' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    let analysis: string
    let modelUsed: string

    // Seleccionar el proveedor de modelo
    if (model_provider === 'minimax' && MINIMAX_API_KEY) {
      const imageData = image_base64 || image_url!
      analysis = await analyzeWithMiniMax(imageData, prompt || '', !!image_base64)
      modelUsed = 'minimax'
    } else if (GEMINI_API_KEY) {
      const imageData = image_base64 || image_url!
      analysis = await analyzeWithGemini(imageData, prompt || '', !!image_base64)
      modelUsed = 'gemini'
    } else {
      return new Response(
        JSON.stringify({ error: 'No hay API keys configuradas para análisis de imágenes' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Guardar el análisis en la base de datos si se proporcionan los IDs
    if (conversation_id && user_id) {
      await logVisionAnalysis(conversation_id, user_id, analysis, modelUsed)
    }

    const response: VisionResponse = {
      analysis,
      model_used: modelUsed,
      timestamp: new Date().toISOString()
    }

    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Error en función vision:', error)
    
    return new Response(
      JSON.stringify({ 
        error: 'Error interno del servidor',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})