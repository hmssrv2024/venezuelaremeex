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
        const { action, conversationId, reason, notes } = await req.json();

        console.log('Takeover request received:', { action, conversationId, reason });

        if (!action || !conversationId) {
            throw new Error('Action and conversationId are required');
        }

        const validActions = ['start', 'end', 'pause_bot', 'resume_bot', 'status'];
        if (!validActions.includes(action)) {
            throw new Error(`Invalid action. Must be one of: ${validActions.join(', ')}`);
        }

        // Obtener credenciales
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

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

        // Verificar que la conversación existe
        const convResponse = await fetch(`${supabaseUrl}/rest/v1/conversations?id=eq.${conversationId}`, {
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
        let result = {};

        switch (action) {
            case 'start':
                result = await startTakeover(conversationId, userId, reason, notes, supabaseUrl, serviceRoleKey);
                break;
            case 'end':
                result = await endTakeover(conversationId, userId, supabaseUrl, serviceRoleKey);
                break;
            case 'pause_bot':
                result = await pauseBot(conversationId, userId, supabaseUrl, serviceRoleKey);
                break;
            case 'resume_bot':
                result = await resumeBot(conversationId, userId, supabaseUrl, serviceRoleKey);
                break;
            case 'status':
                result = await getTakeoverStatus(conversationId, supabaseUrl, serviceRoleKey);
                break;
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
                conversation_id: conversationId,
                user_id: userId,
                event_type: 'takeover_action',
                event_data: {
                    action: action,
                    reason: reason,
                    notes: notes,
                    result: result
                },
                source: 'admin'
            })
        });

        return new Response(JSON.stringify({
            data: {
                action: action,
                conversation_id: conversationId,
                ...result
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Takeover error:', error);

        const errorResponse = {
            error: {
                code: 'TAKEOVER_ERROR',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});

// Iniciar takeover
async function startTakeover(conversationId, adminId, reason, notes, supabaseUrl, serviceRoleKey) {
    // Verificar si ya hay un takeover activo
    const existingResponse = await fetch(
        `${supabaseUrl}/rest/v1/takeovers?conversation_id=eq.${conversationId}&active=eq.true`,
        {
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey
            }
        }
    );

    const existingTakeovers = await existingResponse.json();
    if (existingTakeovers && existingTakeovers.length > 0) {
        throw new Error('Takeover already active for this conversation');
    }

    // Crear nuevo takeover
    const takeoverData = {
        conversation_id: conversationId,
        admin_id: adminId,
        active: true,
        reason: reason || 'Intervención administrativa',
        notes: notes
    };

    const createResponse = await fetch(`${supabaseUrl}/rest/v1/takeovers`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify(takeoverData)
    });

    if (!createResponse.ok) {
        throw new Error('Failed to create takeover');
    }

    const takeover = await createResponse.json();

    // Pausar el bot automáticamente
    await pauseBot(conversationId, adminId, supabaseUrl, serviceRoleKey);

    return {
        takeover_id: takeover[0].id,
        status: 'started',
        bot_paused: true,
        admin_id: adminId
    };
}

// Finalizar takeover
async function endTakeover(conversationId, adminId, supabaseUrl, serviceRoleKey) {
    // Buscar takeover activo
    const activeResponse = await fetch(
        `${supabaseUrl}/rest/v1/takeovers?conversation_id=eq.${conversationId}&active=eq.true`,
        {
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey
            }
        }
    );

    const activeTakeovers = await activeResponse.json();
    if (!activeTakeovers || activeTakeovers.length === 0) {
        throw new Error('No active takeover found for this conversation');
    }

    const takeover = activeTakeovers[0];

    // Finalizar takeover
    const updateResponse = await fetch(`${supabaseUrl}/rest/v1/takeovers?id=eq.${takeover.id}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            active: false,
            ended_at: new Date().toISOString()
        })
    });

    if (!updateResponse.ok) {
        throw new Error('Failed to end takeover');
    }

    // Reanudar el bot automáticamente
    await resumeBot(conversationId, adminId, supabaseUrl, serviceRoleKey);

    return {
        takeover_id: takeover.id,
        status: 'ended',
        bot_paused: false
    };
}

// Pausar bot
async function pauseBot(conversationId, adminId, supabaseUrl, serviceRoleKey) {
    const updateResponse = await fetch(`${supabaseUrl}/rest/v1/conversations?id=eq.${conversationId}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            bot_paused: true
        })
    });

    if (!updateResponse.ok) {
        throw new Error('Failed to pause bot');
    }

    return {
        status: 'bot_paused',
        bot_paused: true
    };
}

// Reanudar bot
async function resumeBot(conversationId, adminId, supabaseUrl, serviceRoleKey) {
    const updateResponse = await fetch(`${supabaseUrl}/rest/v1/conversations?id=eq.${conversationId}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            bot_paused: false
        })
    });

    if (!updateResponse.ok) {
        throw new Error('Failed to resume bot');
    }

    return {
        status: 'bot_resumed',
        bot_paused: false
    };
}

// Obtener estado del takeover
async function getTakeoverStatus(conversationId, supabaseUrl, serviceRoleKey) {
    // Obtener takeover activo
    const takeoverResponse = await fetch(
        `${supabaseUrl}/rest/v1/takeovers?conversation_id=eq.${conversationId}&active=eq.true`,
        {
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey
            }
        }
    );

    const takeovers = await takeoverResponse.json();

    // Obtener estado del bot
    const convResponse = await fetch(`${supabaseUrl}/rest/v1/conversations?id=eq.${conversationId}`, {
        headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey
        }
    });

    const convData = await convResponse.json();
    const conversation = convData[0];

    return {
        has_active_takeover: takeovers && takeovers.length > 0,
        takeover: takeovers && takeovers.length > 0 ? takeovers[0] : null,
        bot_paused: conversation.bot_paused,
        conversation_status: conversation.status
    };
}