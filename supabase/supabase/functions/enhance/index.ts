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
        const { 
            originalText,
            style,
            intensity = 50,
            conversationId,
            originalMessageId = null,
            provider = 'auto'
        } = await req.json();

        console.log('Enhancement request received:', { style, intensity, conversationId, provider });

        if (!originalText || !style) {
            throw new Error('Original text and style are required');
        }

        // Validar estilo
        const validStyles = ['formal', 'conciso', 'amable', 'vendedor', 'neutro'];
        if (!validStyles.includes(style)) {
            throw new Error(`Invalid style. Must be one of: ${validStyles.join(', ')}`);
        }

        // Obtener credenciales
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const minimaxApiKey = Deno.env.get('MINIMAX_API_KEY');
        const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error('Supabase configuration missing');
        }

        // Verificar usuario y que sea admin
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

        // Verificar que el usuario es admin
        const profileResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey
            }
        });

        const profileData = await profileResponse.json();
        if (!profileData || profileData.length === 0 || profileData[0].role !== 'admin') {
            throw new Error('Admin access required');
        }

        const startTime = Date.now();
        let usedProvider = provider;

        // Determinar proveedor
        if (provider === 'auto') {
            usedProvider = geminiApiKey ? 'gemini' : (minimaxApiKey ? 'minimax' : null);
        }

        if (!usedProvider || (!geminiApiKey && !minimaxApiKey)) {
            throw new Error('No enhancement provider available');
        }

        // Construir prompt de mejora
        const enhancementPrompt = buildEnhancementPrompt(originalText, style, intensity);
        
        let enhancedText = '';
        
        if (usedProvider === 'gemini' && geminiApiKey) {
            enhancedText = await enhanceWithGemini(enhancementPrompt, geminiApiKey);
        } else if (usedProvider === 'minimax' && minimaxApiKey) {
            enhancedText = await enhanceWithMinimax(enhancementPrompt, minimaxApiKey);
        }

        const processingTime = Date.now() - startTime;

        // Calcular diferencias y métricas
        const diffData = calculateTextDiff(originalText, enhancedText);
        const metrics = calculateTextMetrics(originalText, enhancedText);

        // Guardar borrador en la base de datos
        const draftData = {
            conversation_id: conversationId,
            original_message_id: originalMessageId,
            original_text: originalText,
            draft_text: enhancedText,
            enhancement_style: style,
            enhancement_intensity: intensity,
            status: 'pending',
            diff_data: diffData,
            metrics: metrics,
            created_by: userId
        };

        const draftResponse = await fetch(`${supabaseUrl}/rest/v1/admin_drafts`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(draftData)
        });

        if (!draftResponse.ok) {
            throw new Error('Failed to save draft');
        }

        const savedDraft = await draftResponse.json();

        // Registrar evento
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
                event_type: 'text_enhanced',
                event_data: {
                    style: style,
                    intensity: intensity,
                    provider: usedProvider,
                    processing_time_ms: processingTime,
                    draft_id: savedDraft[0].id,
                    ...metrics
                },
                source: 'admin'
            })
        });

        return new Response(JSON.stringify({
            data: {
                draft_id: savedDraft[0].id,
                enhanced_text: enhancedText,
                original_text: originalText,
                diff_data: diffData,
                metrics: metrics,
                provider: usedProvider,
                processing_time: processingTime
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Enhancement error:', error);

        const errorResponse = {
            error: {
                code: 'ENHANCEMENT_ERROR',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});

// Construir prompt de mejora basado en estilo e intensidad
function buildEnhancementPrompt(originalText, style, intensity) {
    const stylePrompts = {
        formal: {
            low: 'Haz este texto ligeramente más formal manteniendo su esencia.',
            medium: 'Transforma este texto a un tono profesional y formal.',
            high: 'Convierte este texto en un lenguaje altamente formal y corporativo.'
        },
        conciso: {
            low: 'Reduce ligeramente este texto eliminando palabras innecesarias.',
            medium: 'Haz este texto más conciso y directo al punto.',
            high: 'Condensa este texto al mínimo necesario manteniendo toda la información clave.'
        },
        amable: {
            low: 'Añade un toque más amigable a este texto.',
            medium: 'Haz este texto más cálido y cercano.',
            high: 'Transforma este texto en extremadamente amigable y empático.'
        },
        vendedor: {
            low: 'Añade un ligero enfoque comercial a este texto.',
            medium: 'Haz este texto más persuasivo y orientado a ventas.',
            high: 'Convierte este texto en altamente persuasivo con enfoque de ventas agresivo.'
        },
        neutro: {
            low: 'Haz este texto ligeramente más objetivo y neutro.',
            medium: 'Elimina sesgos y haz este texto completamente neutro.',
            high: 'Transforma este texto en totalmente imparcial y objetivo.'
        }
    };

    const intensityLevel = intensity <= 33 ? 'low' : intensity <= 66 ? 'medium' : 'high';
    const basePrompt = stylePrompts[style][intensityLevel];

    return `${basePrompt}

Texto original:
"${originalText}"

Instrucciones:
- Mantén el significado y la información principal
- Devuelve solo el texto mejorado, sin explicaciones
- Conserva el idioma original (español)
- Ajusta la intensidad del cambio según se solicita

Texto mejorado:`;
}

// Mejora con Gemini
async function enhanceWithGemini(prompt, apiKey) {
    try {
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=' + apiKey, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 2000
                }
            })
        });

        if (!response.ok) {
            throw new Error('Gemini API error');
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'No se pudo mejorar el texto';
    } catch (error) {
        console.error('Gemini enhancement error:', error);
        throw error;
    }
}

// Mejora con MiniMax
async function enhanceWithMinimax(prompt, apiKey) {
    try {
        const response = await fetch('https://api.minimax.ai/v1/text/chatcompletion_v2', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'abab6.5s-chat',
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 2000
            })
        });

        if (!response.ok) {
            throw new Error('MiniMax API error');
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || 'No se pudo mejorar el texto';
    } catch (error) {
        console.error('MiniMax enhancement error:', error);
        throw error;
    }
}

// Calcular diferencias entre textos
function calculateTextDiff(original, enhanced) {
    // Implementación simple de diff - en producción se podría usar una librería más sofisticada
    const originalWords = original.split(/\s+/);
    const enhancedWords = enhanced.split(/\s+/);
    
    return {
        word_changes: {
            added: enhancedWords.length - originalWords.length,
            original_count: originalWords.length,
            enhanced_count: enhancedWords.length
        },
        char_changes: {
            added: enhanced.length - original.length,
            original_count: original.length,
            enhanced_count: enhanced.length
        }
    };
}

// Calcular métricas del texto
function calculateTextMetrics(original, enhanced) {
    const originalSentences = original.split(/[.!?]+/).filter(s => s.trim());
    const enhancedSentences = enhanced.split(/[.!?]+/).filter(s => s.trim());
    
    return {
        readability: {
            original_avg_sentence_length: original.length / originalSentences.length || 0,
            enhanced_avg_sentence_length: enhanced.length / enhancedSentences.length || 0
        },
        structure: {
            original_sentences: originalSentences.length,
            enhanced_sentences: enhancedSentences.length,
            sentence_change: enhancedSentences.length - originalSentences.length
        },
        complexity: {
            original_avg_word_length: (original.replace(/\s/g, '').length / original.split(/\s+/).length) || 0,
            enhanced_avg_word_length: (enhanced.replace(/\s/g, '').length / enhanced.split(/\s+/).length) || 0
        }
    };
}