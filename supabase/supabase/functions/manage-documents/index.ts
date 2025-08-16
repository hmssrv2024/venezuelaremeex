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
        const url = new URL(req.url);
        const action = url.searchParams.get('action') || 'list';
        const documentId = url.searchParams.get('id');
        
        console.log('Document management request:', { action, documentId, method: req.method });

        // Obtener credenciales
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

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

        // Verificar permisos de admin para acciones que lo requieran
        const adminActions = ['delete', 'update', 'reindex'];
        if (adminActions.includes(action)) {
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
        }

        let result = {};

        switch (action) {
            case 'list':
                result = await listDocuments(req, supabaseUrl, serviceRoleKey, userId);
                break;
            case 'get':
                if (!documentId) throw new Error('Document ID required for get action');
                result = await getDocument(documentId, supabaseUrl, serviceRoleKey, userId);
                break;
            case 'update':
                if (!documentId) throw new Error('Document ID required for update action');
                result = await updateDocument(documentId, req, supabaseUrl, serviceRoleKey, userId);
                break;
            case 'delete':
                if (!documentId) throw new Error('Document ID required for delete action');
                result = await deleteDocument(documentId, supabaseUrl, serviceRoleKey, userId);
                break;
            case 'reindex':
                if (!documentId) throw new Error('Document ID required for reindex action');
                if (!openaiApiKey) throw new Error('OpenAI API key required for reindexing');
                result = await reindexDocument(documentId, supabaseUrl, serviceRoleKey, openaiApiKey, userId);
                break;
            case 'stats':
                result = await getDocumentStats(supabaseUrl, serviceRoleKey, userId);
                break;
            default:
                throw new Error(`Invalid action: ${action}`);
        }

        return new Response(JSON.stringify({
            data: result
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Document management error:', error);

        const errorResponse = {
            error: {
                code: 'DOCUMENT_MANAGEMENT_ERROR',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});

// Listar documentos con filtros y paginación
async function listDocuments(req, supabaseUrl, serviceRoleKey, userId) {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const search = url.searchParams.get('search') || '';
    const tag = url.searchParams.get('tag') || '';
    const mimeType = url.searchParams.get('mime_type') || '';
    const isPublic = url.searchParams.get('is_public');
    const uploadedBy = url.searchParams.get('uploaded_by');
    
    const offset = (page - 1) * limit;
    
    // Construir consulta
    let query = `${supabaseUrl}/rest/v1/documents?select=id,title,content,mime_type,file_size,chunk_index,total_chunks,metadata,tags,is_public,uploaded_by,created_at,updated_at&order=created_at.desc&limit=${limit}&offset=${offset}`;
    
    // Aplicar filtros
    const filters = [];
    if (search) {
        filters.push(`title.ilike.*${search}*`);
    }
    if (tag) {
        filters.push(`tags.cs.{"${tag}"}`);
    }
    if (mimeType) {
        filters.push(`mime_type.eq.${mimeType}`);
    }
    if (isPublic !== null && isPublic !== undefined) {
        filters.push(`is_public.eq.${isPublic}`);
    }
    if (uploadedBy) {
        filters.push(`uploaded_by.eq.${uploadedBy}`);
    }
    
    if (filters.length > 0) {
        query += '&' + filters.join('&');
    }

    const response = await fetch(query, {
        headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey
        }
    });

    if (!response.ok) {
        throw new Error('Failed to fetch documents');
    }

    const documents = await response.json();

    // Obtener conteo total para paginación
    let countQuery = `${supabaseUrl}/rest/v1/documents?select=count`;
    if (filters.length > 0) {
        countQuery += '&' + filters.join('&');
    }

    const countResponse = await fetch(countQuery, {
        headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey,
            'Prefer': 'count=exact'
        }
    });

    const totalCount = countResponse.headers.get('content-range')?.split('/')[1] || 0;

    return {
        documents: documents,
        pagination: {
            page: page,
            limit: limit,
            total: parseInt(totalCount),
            total_pages: Math.ceil(parseInt(totalCount) / limit)
        },
        filters: {
            search,
            tag,
            mime_type: mimeType,
            is_public: isPublic,
            uploaded_by: uploadedBy
        }
    };
}

// Obtener documento individual
async function getDocument(documentId, supabaseUrl, serviceRoleKey, userId) {
    const response = await fetch(`${supabaseUrl}/rest/v1/documents?id=eq.${documentId}`, {
        headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey
        }
    });

    if (!response.ok) {
        throw new Error('Failed to fetch document');
    }

    const documents = await response.json();
    if (documents.length === 0) {
        throw new Error('Document not found');
    }

    const document = documents[0];

    // Si el documento tiene chunks, obtener todos los chunks relacionados
    if (document.total_chunks > 1) {
        const chunksResponse = await fetch(
            `${supabaseUrl}/rest/v1/documents?title.like.${encodeURIComponent(document.title.split(' (Parte ')[0])}*&order=chunk_index.asc`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            }
        );

        if (chunksResponse.ok) {
            const chunks = await chunksResponse.json();
            document.all_chunks = chunks;
        }
    }

    return document;
}

// Actualizar documento
async function updateDocument(documentId, req, supabaseUrl, serviceRoleKey, userId) {
    const { title, tags, is_public, metadata } = await req.json();
    
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (tags !== undefined) updateData.tags = tags;
    if (is_public !== undefined) updateData.is_public = is_public;
    if (metadata !== undefined) updateData.metadata = metadata;
    
    if (Object.keys(updateData).length === 0) {
        throw new Error('No fields to update');
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/documents?id=eq.${documentId}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify(updateData)
    });

    if (!response.ok) {
        throw new Error('Failed to update document');
    }

    const updatedDocument = await response.json();

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
            event_type: 'document_updated',
            event_data: {
                document_id: documentId,
                updated_fields: Object.keys(updateData)
            },
            source: 'admin'
        })
    });

    return updatedDocument[0];
}

// Eliminar documento
async function deleteDocument(documentId, supabaseUrl, serviceRoleKey, userId) {
    // Obtener documento para información de storage
    const docResponse = await fetch(`${supabaseUrl}/rest/v1/documents?id=eq.${documentId}`, {
        headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey
        }
    });

    if (!docResponse.ok) {
        throw new Error('Document not found');
    }

    const documents = await docResponse.json();
    if (documents.length === 0) {
        throw new Error('Document not found');
    }

    const document = documents[0];

    // Eliminar archivo de storage si existe
    if (document.storage_path) {
        await fetch(`${supabaseUrl}/storage/v1/object/uploads/${document.storage_path}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`
            }
        });
    }

    // Eliminar documento de la base de datos
    const deleteResponse = await fetch(`${supabaseUrl}/rest/v1/documents?id=eq.${documentId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey
        }
    });

    if (!deleteResponse.ok) {
        throw new Error('Failed to delete document');
    }

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
            event_type: 'document_deleted',
            event_data: {
                document_id: documentId,
                title: document.title,
                had_storage_file: !!document.storage_path
            },
            source: 'admin'
        })
    });

    return { deleted: true, document_id: documentId };
}

// Re-indexar documento (regenerar embeddings)
async function reindexDocument(documentId, supabaseUrl, serviceRoleKey, openaiApiKey, userId) {
    // Obtener documento
    const docResponse = await fetch(`${supabaseUrl}/rest/v1/documents?id=eq.${documentId}`, {
        headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey
        }
    });

    if (!docResponse.ok) {
        throw new Error('Document not found');
    }

    const documents = await docResponse.json();
    if (documents.length === 0) {
        throw new Error('Document not found');
    }

    const document = documents[0];

    // Generar nuevo embedding
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'text-embedding-ada-002',
            input: document.content
        })
    });

    if (!embeddingResponse.ok) {
        throw new Error('Failed to generate new embedding');
    }

    const embeddingData = await embeddingResponse.json();
    const newEmbedding = embeddingData.data[0].embedding;

    // Actualizar documento con nuevo embedding
    const updateResponse = await fetch(`${supabaseUrl}/rest/v1/documents?id=eq.${documentId}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify({
            embedding: newEmbedding
        })
    });

    if (!updateResponse.ok) {
        throw new Error('Failed to update document embedding');
    }

    const updatedDocument = await updateResponse.json();

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
            event_type: 'document_reindexed',
            event_data: {
                document_id: documentId,
                title: document.title
            },
            source: 'admin'
        })
    });

    return updatedDocument[0];
}

// Obtener estadísticas de documentos
async function getDocumentStats(supabaseUrl, serviceRoleKey, userId) {
    // Obtener estadísticas generales
    const statsResponse = await fetch(`${supabaseUrl}/rest/v1/documents?select=count,mime_type,is_public,uploaded_by`, {
        headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey,
            'Prefer': 'count=exact'
        }
    });

    const totalCount = statsResponse.headers.get('content-range')?.split('/')[1] || 0;
    const documents = await statsResponse.json();

    // Calcular estadísticas
    const mimeTypeStats = {};
    const uploaderStats = {};
    let publicCount = 0;

    for (const doc of documents) {
        // Contar por tipo MIME
        mimeTypeStats[doc.mime_type] = (mimeTypeStats[doc.mime_type] || 0) + 1;
        
        // Contar por uploader
        uploaderStats[doc.uploaded_by] = (uploaderStats[doc.uploaded_by] || 0) + 1;
        
        // Contar públicos
        if (doc.is_public) publicCount++;
    }

    return {
        total_documents: parseInt(totalCount),
        public_documents: publicCount,
        private_documents: parseInt(totalCount) - publicCount,
        mime_type_distribution: mimeTypeStats,
        uploader_distribution: uploaderStats,
        generated_at: new Date().toISOString()
    };
}