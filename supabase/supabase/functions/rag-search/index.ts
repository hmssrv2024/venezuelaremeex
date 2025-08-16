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
        const { query, limit = 5, threshold = 0.7, conversationId } = await req.json();

        console.log('RAG search request received:', { query, limit, threshold, conversationId });

        if (!query) {
            throw new Error('Query is required');
        }

        // Obtener credenciales
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error('Supabase configuration missing');
        }

        if (!openaiApiKey) {
            throw new Error('OpenAI API key required for embeddings');
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

        const startTime = Date.now();

        // Generar embedding para la consulta
        const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${openaiApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'text-embedding-ada-002',
                input: query
            })
        });

        if (!embeddingResponse.ok) {
            const errorText = await embeddingResponse.text();
            throw new Error(`OpenAI API error: ${errorText}`);
        }

        const embeddingData = await embeddingResponse.json();
        const queryEmbedding = embeddingData.data[0].embedding;

        // Realizar búsqueda semilántica
        const searchResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/search_documents`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query_embedding: queryEmbedding,
                match_threshold: threshold,
                match_count: limit
            })
        });

        if (!searchResponse.ok) {
            const errorText = await searchResponse.text();
            throw new Error(`Database search error: ${errorText}`);
        }

        const searchResults = await searchResponse.json();
        const processingTime = Date.now() - startTime;

        // Enriquecer resultados con metadata adicional
        const enrichedResults = [];
        for (const result of searchResults) {
            // Obtener metadata completa del documento
            const docResponse = await fetch(`${supabaseUrl}/rest/v1/documents?id=eq.${result.id}`, {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            });

            if (docResponse.ok) {
                const docData = await docResponse.json();
                if (docData.length > 0) {
                    const doc = docData[0];
                    enrichedResults.push({
                        id: result.id,
                        title: result.title,
                        content: result.content,
                        similarity: result.similarity,
                        metadata: doc.metadata,
                        tags: doc.tags,
                        chunk_index: doc.chunk_index,
                        total_chunks: doc.total_chunks,
                        mime_type: doc.mime_type,
                        created_at: doc.created_at
                    });
                }
            }
        }

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
                    event_type: 'rag_search',
                    event_data: {
                        query: query,
                        threshold: threshold,
                        limit: limit,
                        results_count: enrichedResults.length,
                        processing_time_ms: processingTime,
                        avg_similarity: enrichedResults.length > 0 ? 
                            enrichedResults.reduce((sum, r) => sum + r.similarity, 0) / enrichedResults.length : 0
                    },
                    source: 'user'
                })
            });
        }

        return new Response(JSON.stringify({
            data: {
                query: query,
                results: enrichedResults,
                total_results: enrichedResults.length,
                processing_time: processingTime,
                search_params: {
                    threshold: threshold,
                    limit: limit
                }
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('RAG search error:', error);

        const errorResponse = {
            error: {
                code: 'RAG_SEARCH_ERROR',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});