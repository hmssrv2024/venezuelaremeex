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
        const { fileData, fileName, mimeType, conversationId, messageId } = await req.json();

        console.log('Upload request received:', { fileName, mimeType, conversationId, messageId });

        if (!fileData || !fileName || !mimeType) {
            throw new Error('File data, filename, and mime type are required');
        }

        // Obtener credenciales
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

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

        // Validar tipo de archivo
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/webp',
            'audio/webm', 'audio/wav', 'audio/mp3',
            'application/pdf', 'text/plain', 'text/markdown'
        ];

        if (!allowedTypes.includes(mimeType)) {
            throw new Error(`File type ${mimeType} not allowed`);
        }

        // Validar tamaño de archivo
        const maxSize = 50 * 1024 * 1024; // 50MB
        const base64Data = fileData.includes(',') ? fileData.split(',')[1] : fileData;
        const sizeBytes = (base64Data.length * 3) / 4;

        if (sizeBytes > maxSize) {
            throw new Error('File too large. Maximum size is 50MB.');
        }

        // Convertir base64 a binary
        const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

        // Generar nombre de archivo único
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const extension = fileName.split('.').pop();
        const uniqueFileName = `${userId}/${timestamp}_${randomSuffix}.${extension}`;

        // Subir a Supabase Storage
        const uploadResponse = await fetch(`${supabaseUrl}/storage/v1/object/uploads/${uniqueFileName}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Content-Type': mimeType,
                'x-upsert': 'true'
            },
            body: binaryData
        });

        if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            throw new Error(`Upload failed: ${errorText}`);
        }

        // Generar URL pública
        const publicUrl = `${supabaseUrl}/storage/v1/object/public/uploads/${uniqueFileName}`;

        // Determinar tipo de attachment
        let attachmentKind = 'file';
        if (mimeType.startsWith('image/')) {
            attachmentKind = 'image';
        } else if (mimeType.startsWith('audio/')) {
            attachmentKind = 'audio';
        }

        // Si se proporciona messageId, crear attachment
        let attachmentId = null;
        if (messageId) {
            const attachmentData = {
                message_id: messageId,
                kind: attachmentKind,
                storage_path: uniqueFileName,
                public_url: publicUrl,
                mime_type: mimeType,
                size_bytes: sizeBytes,
                alt_text: `Archivo: ${fileName}`
            };

            const attachmentResponse = await fetch(`${supabaseUrl}/rest/v1/attachments`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(attachmentData)
            });

            if (attachmentResponse.ok) {
                const attachment = await attachmentResponse.json();
                attachmentId = attachment[0].id;
            }
        }

        // Registrar evento
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
                    event_type: 'file_uploaded',
                    event_data: {
                        filename: fileName,
                        mime_type: mimeType,
                        size_bytes: sizeBytes,
                        attachment_kind: attachmentKind,
                        attachment_id: attachmentId
                    },
                    source: 'user'
                })
            });
        }

        return new Response(JSON.stringify({
            data: {
                public_url: publicUrl,
                storage_path: uniqueFileName,
                attachment_id: attachmentId,
                file_size: sizeBytes,
                mime_type: mimeType,
                kind: attachmentKind
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Upload error:', error);

        const errorResponse = {
            error: {
                code: 'UPLOAD_ERROR',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});