-- Función para búsqueda semántica de documentos
CREATE OR REPLACE FUNCTION search_documents(
  query_embedding vector(1536),
  match_count int DEFAULT 5,
  similarity_threshold float DEFAULT 0.7
)
RETURNS TABLE (
  id uuid,
  title text,
  text_content text,
  similarity float,
  metadata jsonb
)
LANGUAGE sql
AS $$
  SELECT 
    documents.id,
    documents.title,
    documents.text_content,
    1 - (documents.embedding <=> query_embedding) as similarity,
    documents.metadata
  FROM documents
  WHERE documents.embedding IS NOT NULL
    AND 1 - (documents.embedding <=> query_embedding) > similarity_threshold
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Función para notificar cambios de takeover via Realtime
CREATE OR REPLACE FUNCTION notify_takeover_change(
  conversation_id uuid,
  action text,
  admin_name text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_notify(
    'takeover_change',
    json_build_object(
      'conversation_id', conversation_id,
      'action', action,
      'admin_name', admin_name,
      'timestamp', now()
    )::text
  );
END;
$$;

-- Función para obtener estadísticas de conversaciones
CREATE OR REPLACE FUNCTION get_conversation_stats()
RETURNS TABLE (
  total_conversations bigint,
  active_conversations bigint,
  total_messages bigint,
  total_users bigint,
  avg_messages_per_conversation numeric
)
LANGUAGE sql
AS $$
  SELECT 
    COUNT(DISTINCT c.id) as total_conversations,
    COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'active') as active_conversations,
    COUNT(DISTINCT m.id) as total_messages,
    COUNT(DISTINCT c.user_id) as total_users,
    ROUND(COUNT(DISTINCT m.id)::numeric / NULLIF(COUNT(DISTINCT c.id), 0), 2) as avg_messages_per_conversation
  FROM conversations c
  LEFT JOIN messages m ON c.id = m.conversation_id;
$$;

-- Función para limpiar conversaciones antiguas
CREATE OR REPLACE FUNCTION cleanup_old_conversations(days_old int DEFAULT 90)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count int;
BEGIN
  -- Archivar conversaciones inactivas
  UPDATE conversations 
  SET status = 'archived'
  WHERE status = 'active'
    AND updated_at < (now() - (days_old || ' days')::interval)
    AND id NOT IN (
      SELECT DISTINCT conversation_id 
      FROM messages 
      WHERE created_at > (now() - '7 days'::interval)
    );
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

-- Función para obtener métricas de modelos LLM
CREATE OR REPLACE FUNCTION get_model_metrics(days_back int DEFAULT 7)
RETURNS TABLE (
  model_name text,
  total_calls bigint,
  avg_latency_ms numeric,
  total_tokens bigint,
  error_rate numeric
)
LANGUAGE sql
AS $$
  SELECT 
    (payload->>'model_used')::text as model_name,
    COUNT(*) as total_calls,
    ROUND(AVG((payload->>'latency_ms')::numeric), 2) as avg_latency_ms,
    SUM((payload->>'tokens_estimated')::bigint) as total_tokens,
    ROUND(
      COUNT(*) FILTER (WHERE name LIKE '%error%')::numeric / 
      NULLIF(COUNT(*), 0) * 100, 2
    ) as error_rate
  FROM events
  WHERE created_at > (now() - (days_back || ' days')::interval)
    AND payload->>'model_used' IS NOT NULL
  GROUP BY payload->>'model_used'
  ORDER BY total_calls DESC;
$$;

-- Vista para el dashboard admin
CREATE OR REPLACE VIEW admin_dashboard AS
SELECT 
  'conversations' as metric,
  COUNT(*)::text as value,
  'Total de conversaciones' as description
FROM conversations
UNION ALL
SELECT 
  'active_conversations' as metric,
  COUNT(*)::text as value,
  'Conversaciones activas' as description
FROM conversations WHERE status = 'active'
UNION ALL
SELECT 
  'messages_today' as metric,
  COUNT(*)::text as value,
  'Mensajes hoy' as description
FROM messages WHERE DATE(created_at) = CURRENT_DATE
UNION ALL
SELECT 
  'users_active' as metric,
  COUNT(DISTINCT user_id)::text as value,
  'Usuarios con actividad reciente' as description
FROM conversations WHERE updated_at > (now() - '7 days'::interval);

-- Trigger para actualizar timestamp de conversación cuando hay nuevo mensaje
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations 
  SET updated_at = now() 
  WHERE id = NEW.conversation_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversation_on_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_timestamp();

-- Función para generar título automático de conversación
CREATE OR REPLACE FUNCTION generate_conversation_title(conversation_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  first_message text;
  title text;
BEGIN
  -- Obtener el primer mensaje del usuario
  SELECT content INTO first_message
  FROM messages
  WHERE conversation_id = generate_conversation_title.conversation_id
    AND sender = 'user'
    AND type = 'text'
  ORDER BY created_at ASC
  LIMIT 1;
  
  IF first_message IS NULL THEN
    RETURN 'Nueva Conversación';
  END IF;
  
  -- Generar título basado en las primeras palabras
  title := LEFT(first_message, 50);
  
  IF LENGTH(first_message) > 50 THEN
    title := title || '...';
  END IF;
  
  RETURN title;
END;
$$;

-- Índices adicionales para optimización
CREATE INDEX IF NOT EXISTS idx_messages_sender_type ON messages(sender, type);
CREATE INDEX IF NOT EXISTS idx_events_name_created_at ON events(name, created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_status_updated ON conversations(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_takeovers_active_conversation ON takeovers(active, conversation_id) WHERE active = true;