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
            message, 
            conversationId, 
            llmProvider = 'auto', 
            useRag = false,
            attachments = [],
            stream = true 
        } = await req.json();

        console.log('Chat request received:', { 
            conversationId, 
            llmProvider, 
            useRag, 
            attachmentsCount: attachments.length,
            stream 
        });

        // Validar entrada
        if (!message || !conversationId) {
            throw new Error('Message and conversationId are required');
        }

        // Obtener credenciales
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const minimaxApiKey = Deno.env.get('MINIMAX_API_KEY');
        const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
        const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error('Supabase configuration missing');
        }

        // Obtener usuario del token
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

        // Verificar que la conversación pertenece al usuario
        const convResponse = await fetch(`${supabaseUrl}/rest/v1/conversations?id=eq.${conversationId}&user_id=eq.${userId}`, {
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey
            }
        });

        const convData = await convResponse.json();
        if (!convData || convData.length === 0) {
            throw new Error('Conversation not found');
        }

        const conversation = convData[0];

        // Verificar si el bot está pausado
        if (conversation.bot_paused) {
            return new Response(JSON.stringify({
                error: {
                    code: 'BOT_PAUSED',
                    message: 'El bot está pausado. Un administrador tomará control de la conversación.'
                }
            }), {
                status: 423,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Guardar mensaje del usuario
        const userMessageData = {
            conversation_id: conversationId,
            sender: 'user',
            sender_id: userId,
            type: attachments.length > 0 ? 'file' : 'text',
            content: message,
            status: 'sent'
        };

        const saveMessageResponse = await fetch(`${supabaseUrl}/rest/v1/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(userMessageData)
        });

        if (!saveMessageResponse.ok) {
            throw new Error('Failed to save user message');
        }

        const savedMessage = await saveMessageResponse.json();
        const messageId = savedMessage[0].id;

        // Procesar attachments si existen
        for (const attachment of attachments) {
            const attachmentData = {
                message_id: messageId,
                kind: attachment.kind,
                storage_path: attachment.storage_path,
                public_url: attachment.public_url,
                mime_type: attachment.mime_type,
                size_bytes: attachment.size_bytes || 0
            };

            await fetch(`${supabaseUrl}/rest/v1/attachments`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(attachmentData)
            });
        }

        // Obtener historial de conversación
        const historyResponse = await fetch(
            `${supabaseUrl}/rest/v1/messages?conversation_id=eq.${conversationId}&order=created_at.asc&limit=20`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            }
        );

        const history = await historyResponse.json();

        // Preparar contexto RAG si está habilitado
        let ragContext = '';
        if (useRag && openaiApiKey) {
            try {
                // Generar embedding para el mensaje
                const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${openaiApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'text-embedding-ada-002',
                        input: message
                    })
                });

                if (embeddingResponse.ok) {
                    const embeddingData = await embeddingResponse.json();
                    const embedding = embeddingData.data[0].embedding;

                    // Buscar documentos similares
                    const ragResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/search_documents`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${serviceRoleKey}`,
                            'apikey': serviceRoleKey,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            query_embedding: embedding,
                            match_threshold: 0.7,
                            match_count: 3
                        })
                    });

                    if (ragResponse.ok) {
                        const ragData = await ragResponse.json();
                        if (ragData.length > 0) {
                            ragContext = ragData.map(doc => `**${doc.title}**\n${doc.content}`).join('\n\n');
                        }
                    }
                }
            } catch (error) {
                console.warn('RAG search failed:', error);
            }
        }

        // Construir prompt del sistema
        let systemPrompt = `Eres un asistente virtual inteligente y servicial. Responde de manera clara, precisa y útil. Usa un tono profesional pero amigable.`;
        
        if (ragContext) {
            systemPrompt += `\n\nContexto de documentos relevantes:\n${ragContext}\n\nUsa esta información para enriquecer tu respuesta cuando sea relevante.`;
        }

        // Determinar proveedor LLM
        let selectedProvider = llmProvider;
        if (llmProvider === 'auto') {
            // Lógica simple: alternar entre providers
            selectedProvider = Math.random() > 0.5 ? 'gemini' : 'minimax';
        }

        // Medir tiempo de procesamiento
        const startTime = Date.now();
        let responseText = '';
        let tokensEstimated = 0;

        if (stream) {
            // Configurar streaming SSE
            const readable = new ReadableStream({
                async start(controller) {
                    try {
                        if (selectedProvider === 'gemini' && geminiApiKey) {
                            await streamGeminiResponse(controller, message, history, systemPrompt, geminiApiKey);
                        } else if (selectedProvider === 'minimax' && minimaxApiKey) {
                            await streamMinimaxResponse(controller, message, history, systemPrompt, minimaxApiKey);
                        } else {
                            // Fallback a respuesta simple
                            const response = 'Lo siento, no hay proveedores LLM disponibles en este momento.';
                            controller.enqueue(`data: ${JSON.stringify({ content: response, done: true })}\n\n`);
                        }
                    } catch (error) {
                        console.error('Streaming error:', error);
                        controller.enqueue(`data: ${JSON.stringify({ error: error.message, done: true })}\n\n`);
                    } finally {
                        controller.close();
                    }
                }
            });

            return new Response(readable, {
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                }
            });
        } else {
            // Respuesta no streaming
            if (selectedProvider === 'gemini' && geminiApiKey) {
                responseText = await getGeminiResponse(message, history, systemPrompt, geminiApiKey);
            } else if (selectedProvider === 'minimax' && minimaxApiKey) {
                responseText = await getMinimaxResponse(message, history, systemPrompt, minimaxApiKey);
            } else {
                responseText = 'Lo siento, no hay proveedores LLM disponibles en este momento.';
            }

            const processingTime = Date.now() - startTime;
            tokensEstimated = Math.ceil(responseText.length / 4); // Estimación aproximada

            // Guardar respuesta del bot
            const botMessageData = {
                conversation_id: conversationId,
                sender: 'bot',
                sender_id: null,
                type: 'text',
                content: responseText,
                tokens_estimated: tokensEstimated,
                processing_time_ms: processingTime,
                llm_provider: selectedProvider,
                status: 'sent'
            };

            await fetch(`${supabaseUrl}/rest/v1/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(botMessageData)
            });

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
                    event_type: 'chat_response',
                    event_data: {
                        llm_provider: selectedProvider,
                        processing_time_ms: processingTime,
                        tokens_estimated: tokensEstimated,
                        used_rag: !!ragContext
                    },
                    source: 'bot'
                })
            });

            return new Response(JSON.stringify({
                data: {
                    response: responseText,
                    provider: selectedProvider,
                    processing_time: processingTime,
                    tokens_estimated: tokensEstimated
                }
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

    } catch (error) {
        console.error('Chat error:', error);

        const errorResponse = {
            error: {
                code: 'CHAT_ERROR',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});

// Función para streaming con Gemini
async function streamGeminiResponse(controller, message, history, systemPrompt, apiKey) {
    try {
        const messages = buildGeminiMessages(history, systemPrompt, message);
        
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:streamGenerateContent?key=' + apiKey, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: messages,
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 4000
                }
            })
        });

        if (!response.ok) {
            throw new Error('Gemini API error');
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        let fullResponse = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                            const text = data.candidates[0].content.parts[0].text;
                            fullResponse += text;
                            controller.enqueue(`data: ${JSON.stringify({ content: text, done: false })}\n\n`);
                        }
                    } catch (e) {
                        console.warn('Error parsing streaming chunk:', e);
                    }
                }
            }
        }

        controller.enqueue(`data: ${JSON.stringify({ content: '', done: true, fullResponse })}\n\n`);
    } catch (error) {
        throw error;
    }
}

// Función para streaming con MiniMax
async function streamMinimaxResponse(controller, message, history, systemPrompt, apiKey) {
    try {
        const messages = buildMinimaxMessages(history, systemPrompt, message);
        
        const response = await fetch('https://api.minimax.ai/v1/text/chatcompletion_v2', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'abab6.5s-chat',
                messages: messages,
                temperature: 0.7,
                max_tokens: 4000,
                stream: true
            })
        });

        if (!response.ok) {
            throw new Error('MiniMax API error');
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        let fullResponse = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.choices?.[0]?.delta?.content) {
                            const text = data.choices[0].delta.content;
                            fullResponse += text;
                            controller.enqueue(`data: ${JSON.stringify({ content: text, done: false })}\n\n`);
                        }
                    } catch (e) {
                        console.warn('Error parsing streaming chunk:', e);
                    }
                }
            }
        }

        controller.enqueue(`data: ${JSON.stringify({ content: '', done: true, fullResponse })}\n\n`);
    } catch (error) {
        throw error;
    }
}

// Función para respuesta Gemini no streaming
async function getGeminiResponse(message, history, systemPrompt, apiKey) {
    const messages = buildGeminiMessages(history, systemPrompt, message);
    
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=' + apiKey, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: messages,
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 4000
            }
        })
    });

    if (!response.ok) {
        throw new Error('Gemini API error');
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No se pudo generar respuesta';
}

// Función para respuesta MiniMax no streaming
async function getMinimaxResponse(message, history, systemPrompt, apiKey) {
    const messages = buildMinimaxMessages(history, systemPrompt, message);
    
    const response = await fetch('https://api.minimax.ai/v1/text/chatcompletion_v2', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'abab6.5s-chat',
            messages: messages,
            temperature: 0.7,
            max_tokens: 4000
        })
    });

    if (!response.ok) {
        throw new Error('MiniMax API error');
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'No se pudo generar respuesta';
}

// Construir mensajes para Gemini
function buildGeminiMessages(history, systemPrompt, currentMessage) {
    const messages = [];
    
    // Agregar prompt del sistema como primer mensaje
    messages.push({
        role: 'user',
        parts: [{ text: systemPrompt }]
    });
    messages.push({
        role: 'model',
        parts: [{ text: 'Entendido. Estoy listo para ayudarte.' }]
    });

    // Agregar historial
    for (const msg of history.slice(-10)) { // Últimos 10 mensajes
        if (msg.sender === 'user') {
            messages.push({
                role: 'user',
                parts: [{ text: msg.content }]
            });
        } else if (msg.sender === 'bot') {
            messages.push({
                role: 'model',
                parts: [{ text: msg.content }]
            });
        }
    }

    // Agregar mensaje actual
    messages.push({
        role: 'user',
        parts: [{ text: currentMessage }]
    });

    return messages;
}

// Construir mensajes para MiniMax
function buildMinimaxMessages(history, systemPrompt, currentMessage) {
    const messages = [];
    
    // Agregar prompt del sistema
    messages.push({
        role: 'system',
        content: systemPrompt
    });

    // Agregar historial
    for (const msg of history.slice(-10)) { // Últimos 10 mensajes
        if (msg.sender === 'user') {
            messages.push({
                role: 'user',
                content: msg.content
            });
        } else if (msg.sender === 'bot') {
            messages.push({
                role: 'assistant',
                content: msg.content
            });
        }
    }

    // Agregar mensaje actual
    messages.push({
        role: 'user',
        content: currentMessage
    });

    return messages;
}