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
            fileData, 
            fileName, 
            title, 
            mimeType, 
            tags = [], 
            isPublic = false,
            metadata = {},
            chunkSize = 1000,
            chunkOverlap = 200
        } = await req.json();

        console.log('Document upload request received:', { fileName, title, mimeType, isPublic });

        if (!fileData || !fileName || !title) {
            throw new Error('File data, filename, and title are required');
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

        // Validar tipo de archivo
        const allowedTypes = ['application/pdf', 'text/plain', 'text/markdown'];
        if (!allowedTypes.includes(mimeType)) {
            throw new Error(`Document type ${mimeType} not supported. Allowed types: ${allowedTypes.join(', ')}`);
        }

        const startTime = Date.now();

        // Procesar contenido del documento
        let textContent = '';
        if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
            // Para archivos de texto, decodificar directamente
            const base64Data = fileData.includes(',') ? fileData.split(',')[1] : fileData;
            textContent = atob(base64Data);
        } else if (mimeType === 'application/pdf') {
            // Para PDFs, necesitaríamos una librería de extracción de texto
            // Por ahora, usar el título como contenido
            textContent = `Documento PDF: ${title}. Contenido del archivo ${fileName}.`;
        }

        if (!textContent.trim()) {
            throw new Error('No text content could be extracted from the document');
        }

        // Dividir contenido en chunks
        const chunks = splitTextIntoChunks(textContent, chunkSize, chunkOverlap);
        const documentIds = [];

        // Subir archivo a storage si es necesario
        let storagePath = null;
        if (fileData) {
            const timestamp = Date.now();
            const randomSuffix = Math.random().toString(36).substring(2, 8);
            const extension = fileName.split('.').pop();
            const uniqueFileName = `documents/${userId}/${timestamp}_${randomSuffix}.${extension}`;

            const base64Data = fileData.includes(',') ? fileData.split(',')[1] : fileData;
            const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

            const uploadResponse = await fetch(`${supabaseUrl}/storage/v1/object/uploads/${uniqueFileName}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'Content-Type': mimeType,
                    'x-upsert': 'true'
                },
                body: binaryData
            });

            if (uploadResponse.ok) {
                storagePath = uniqueFileName;
            }
        }

        // Procesar cada chunk
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            
            // Generar embedding para el chunk
            const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'text-embedding-ada-002',
                    input: chunk
                })
            });

            if (!embeddingResponse.ok) {
                console.warn(`Failed to generate embedding for chunk ${i}`);
                continue;
            }

            const embeddingData = await embeddingResponse.json();
            const embedding = embeddingData.data[0].embedding;

            // Guardar documento en la base de datos
            const docData = {
                title: chunks.length > 1 ? `${title} (Parte ${i + 1}/${chunks.length})` : title,
                content: chunk,
                mime_type: mimeType,
                storage_path: storagePath,
                file_size: fileData ? Math.ceil((fileData.length * 3) / 4) : chunk.length,
                chunk_index: i,
                total_chunks: chunks.length,
                embedding: embedding,
                metadata: {
                    ...metadata,
                    original_filename: fileName,
                    chunk_info: {
                        index: i,
                        total: chunks.length,
                        size: chunk.length
                    },
                    processing_info: {
                        uploaded_at: new Date().toISOString(),
                        chunk_size: chunkSize,
                        chunk_overlap: chunkOverlap
                    }
                },
                tags: tags,
                is_public: isPublic,
                uploaded_by: userId
            };

            const saveResponse = await fetch(`${supabaseUrl}/rest/v1/documents`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(docData)
            });

            if (saveResponse.ok) {
                const savedDoc = await saveResponse.json();
                documentIds.push(savedDoc[0].id);
            } else {
                console.warn(`Failed to save chunk ${i}`);
            }
        }

        const processingTime = Date.now() - startTime;

        // Registrar evento
        await fetch(`${supabaseUrl}/rest/v1/events`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: userId,
                event_type: 'document_uploaded',
                event_data: {
                    title: title,
                    filename: fileName,
                    mime_type: mimeType,
                    chunks_created: documentIds.length,
                    processing_time_ms: processingTime,
                    is_public: isPublic,
                    tags: tags,
                    document_ids: documentIds
                },
                source: 'admin'
            })
        });

        return new Response(JSON.stringify({
            data: {
                title: title,
                filename: fileName,
                chunks_created: documentIds.length,
                document_ids: documentIds,
                storage_path: storagePath,
                processing_time: processingTime,
                text_length: textContent.length,
                is_public: isPublic
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Document upload error:', error);

        const errorResponse = {
            error: {
                code: 'DOCUMENT_UPLOAD_ERROR',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});

// Función para dividir texto en chunks
function splitTextIntoChunks(text, chunkSize, overlap) {
    const chunks = [];
    const words = text.split(/\s+/);
    
    let currentChunk = [];
    let currentSize = 0;
    
    for (const word of words) {
        currentChunk.push(word);
        currentSize += word.length + 1; // +1 para el espacio
        
        if (currentSize >= chunkSize) {
            chunks.push(currentChunk.join(' '));
            
            // Calcular overlap
            const overlapWords = Math.floor(overlap / (currentSize / currentChunk.length));
            currentChunk = currentChunk.slice(-overlapWords);
            currentSize = currentChunk.reduce((sum, word) => sum + word.length + 1, 0);
        }
    }
    
    // Añadir el último chunk si tiene contenido
    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(' '));
    }
    
    return chunks.filter(chunk => chunk.trim().length > 0);
}