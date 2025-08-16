Deno.serve(async (req) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
        'Access-Control-Max-Age': '86400',
        'Access-Control-Allow-Credentials': 'false'
    };

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: corsHeaders });
    }

    try {
        const { audioData, provider = 'auto', conversationId } = await req.json();

        console.log('Transcribe request received:', { provider, conversationId });

        if (!audioData) {
            throw new Error('Audio data is required');
        }

        // Obtener credenciales
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const minimaxApiKey = Deno.env.get('MINIMAX_API_KEY');
        const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error('Supabase configuration missing');
        }

        // Verificar usuario
        const authHeader = req.headers.get('authorization');
        if (!authHeader) {
            throw new Error('Authorization header required');
        }

        const token = authHeader.replace('Bearer ', '');
        const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'apikey': serviceRoleKey
            }
        });

        if (!userResponse.ok) {
            throw new Error('Invalid token');
        }

        const userData = await userResponse.json();
        const userId = userData.id;

        let transcriptionText = '';
        let usedProvider = provider;
        const startTime = Date.now();

        // Determinar proveedor
        if (provider === 'auto') {
            usedProvider = geminiApiKey ? 'gemini' : (minimaxApiKey ? 'minimax' : null);
        }

        // Convertir base64 a binary
        const base64Data = audioData.includes(',') ? audioData.split(',')[1] : audioData;
        const audioBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

        if (usedProvider === 'gemini' && geminiApiKey) {
            transcriptionText = await transcribeWithGemini(audioBuffer, geminiApiKey);
        } else if (usedProvider === 'minimax' && minimaxApiKey) {
            transcriptionText = await transcribeWithMinimax(audioBuffer, minimaxApiKey);
        } else {
            throw new Error('No transcription provider available');
        }

        const processingTime = Date.now() - startTime;

        // Registrar evento si se proporciona conversationId
        if (conversationId) {
            await fetch(`${supabaseUrl}/rest/v1/events`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    conversation_id: conversationId,
                    user_id: userId,
                    event_type: 'audio_transcribed',
                    event_data: {
                        provider: usedProvider,
                        processing_time_ms: processingTime,
                        text_length: transcriptionText.length
                    },
                    source: 'user'
                })
            });
        }

        return new Response(JSON.stringify({
            data: {
                transcription: transcriptionText,
                provider: usedProvider,
                processing_time: processingTime
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Transcription error:', error);

        const errorResponse = {
            error: {
                code: 'TRANSCRIPTION_ERROR',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});

// Transcripción con Gemini
async function transcribeWithGemini(audioBuffer, apiKey) {
    try {
        // Gemini acepta audio en formato base64
        const base64Audio = btoa(String.fromCharCode(...audioBuffer));
        
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=' + apiKey, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            text: "Transcribe este audio a texto en español. Devuelve solo el texto transcrito sin comentarios adicionales."
                        },
                        {
                            inline_data: {
                                mime_type: "audio/webm",
                                data: base64Audio
                            }
                        }
                    ]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 1000
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API error: ${errorText}`);
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'No se pudo transcribir el audio';
    } catch (error) {
        console.error('Gemini transcription error:', error);
        throw error;
    }
}

// Transcripción con MiniMax
async function transcribeWithMinimax(audioBuffer, apiKey) {
    try {
        // Crear FormData para MiniMax STT
        const formData = new FormData();
        const audioBlob = new Blob([audioBuffer], { type: 'audio/webm' });
        formData.append('file', audioBlob, 'audio.webm');
        formData.append('model', 'speech-01');
        formData.append('language', 'es');
        
        const response = await fetch('https://api.minimax.ai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`MiniMax API error: ${errorText}`);
        }

        const data = await response.json();
        return data.text?.trim() || 'No se pudo transcribir el audio';
    } catch (error) {
        console.error('MiniMax transcription error:', error);
        throw error;
    }
}