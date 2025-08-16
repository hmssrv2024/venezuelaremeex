-- Habilitar RLS en todas las tablas
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE takeovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

-- Políticas para la tabla profiles
-- Los usuarios pueden ver y editar su propio perfil
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Los admins pueden ver todos los perfiles
CREATE POLICY "Admins can view all profiles" ON profiles
  FOR SELECT USING (is_admin(auth.uid()));

-- Los admins pueden actualizar roles de usuario
CREATE POLICY "Admins can update user roles" ON profiles
  FOR UPDATE USING (is_admin(auth.uid()));

-- Políticas para la tabla conversations
-- Los usuarios pueden ver y gestionar sus propias conversaciones
CREATE POLICY "Users can view own conversations" ON conversations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create conversations" ON conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations" ON conversations
  FOR UPDATE USING (auth.uid() = user_id);

-- Los admins pueden ver y gestionar todas las conversaciones
CREATE POLICY "Admins can view all conversations" ON conversations
  FOR ALL USING (is_admin(auth.uid()));

-- Políticas para la tabla messages
-- Los usuarios pueden ver mensajes de sus conversaciones
CREATE POLICY "Users can view messages from own conversations" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE id = messages.conversation_id AND user_id = auth.uid()
    )
  );

-- Los usuarios pueden crear mensajes en sus conversaciones
CREATE POLICY "Users can create messages in own conversations" ON messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE id = messages.conversation_id AND user_id = auth.uid()
    )
    AND (sender = 'user' AND sender_id = auth.uid())
  );

-- Los admins pueden ver todos los mensajes
CREATE POLICY "Admins can view all messages" ON messages
  FOR SELECT USING (is_admin(auth.uid()));

-- Los admins pueden crear mensajes como admin en cualquier conversación
CREATE POLICY "Admins can create admin messages" ON messages
  FOR INSERT WITH CHECK (
    is_admin(auth.uid()) AND 
    sender = 'admin' AND 
    sender_id = auth.uid()
  );

-- El servicio puede crear mensajes del bot
CREATE POLICY "Service can create bot messages" ON messages
  FOR INSERT WITH CHECK (sender = 'bot' AND sender_id IS NULL);

-- Políticas para la tabla attachments
-- Los usuarios pueden ver archivos adjuntos de mensajes en sus conversaciones
CREATE POLICY "Users can view attachments from own conversations" ON attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE m.id = attachments.message_id AND c.user_id = auth.uid()
    )
  );

-- Los usuarios pueden crear archivos adjuntos en sus mensajes
CREATE POLICY "Users can create attachments for own messages" ON attachments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE m.id = attachments.message_id AND c.user_id = auth.uid()
    )
  );

-- Los admins pueden ver todos los archivos adjuntos
CREATE POLICY "Admins can view all attachments" ON attachments
  FOR ALL USING (is_admin(auth.uid()));

-- Políticas para la tabla admin_drafts
-- Solo los admins pueden gestionar borradores
CREATE POLICY "Admins can manage drafts" ON admin_drafts
  FOR ALL USING (is_admin(auth.uid()));

-- Políticas para la tabla events
-- Los usuarios pueden ver eventos de sus conversaciones
CREATE POLICY "Users can view events from own conversations" ON events
  FOR SELECT USING (
    conversation_id IS NULL OR
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE id = events.conversation_id AND user_id = auth.uid()
    )
  );

-- Los admins pueden ver todos los eventos
CREATE POLICY "Admins can view all events" ON events
  FOR ALL USING (is_admin(auth.uid()));

-- El sistema puede crear eventos
CREATE POLICY "Service can create events" ON events
  FOR INSERT WITH CHECK (true);

-- Políticas para la tabla documents
-- Todos pueden ver documentos públicos
CREATE POLICY "Anyone can view public documents" ON documents
  FOR SELECT USING (is_public = true);

-- Los usuarios pueden ver documentos que subieron
CREATE POLICY "Users can view own documents" ON documents
  FOR SELECT USING (auth.uid() = uploaded_by);

-- Los usuarios pueden crear documentos
CREATE POLICY "Users can create documents" ON documents
  FOR INSERT WITH CHECK (auth.uid() = uploaded_by);

-- Los usuarios pueden actualizar sus documentos
CREATE POLICY "Users can update own documents" ON documents
  FOR UPDATE USING (auth.uid() = uploaded_by);

-- Los admins pueden gestionar todos los documentos
CREATE POLICY "Admins can manage all documents" ON documents
  FOR ALL USING (is_admin(auth.uid()));

-- Políticas para la tabla takeovers
-- Solo los admins pueden gestionar takeovers
CREATE POLICY "Admins can manage takeovers" ON takeovers
  FOR ALL USING (is_admin(auth.uid()));

-- Políticas para la tabla system_config
-- Solo los admins pueden ver y gestionar la configuración
CREATE POLICY "Admins can manage system config" ON system_config
  FOR ALL USING (is_admin(auth.uid()));

-- Funciones adicionales para el sistema

-- Función para buscar documentos por similitud semántica
CREATE OR REPLACE FUNCTION search_documents(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  title text,
  content text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.title,
    d.content,
    1 - (d.embedding <=> query_embedding) as similarity
  FROM documents d
  WHERE 
    d.is_public = true AND
    1 - (d.embedding <=> query_embedding) > match_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Función para obtener estadísticas de conversaciones
CREATE OR REPLACE FUNCTION get_conversation_stats(conversation_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_messages', COUNT(*),
    'user_messages', COUNT(*) FILTER (WHERE sender = 'user'),
    'bot_messages', COUNT(*) FILTER (WHERE sender = 'bot'),
    'admin_messages', COUNT(*) FILTER (WHERE sender = 'admin'),
    'total_tokens', COALESCE(SUM(tokens_estimated), 0),
    'avg_response_time', COALESCE(AVG(processing_time_ms), 0),
    'attachments_count', (
      SELECT COUNT(*) 
      FROM attachments a 
      JOIN messages m ON a.message_id = m.id 
      WHERE m.conversation_id = conversation_id_param
    )
  ) INTO result
  FROM messages
  WHERE conversation_id = conversation_id_param;
  
  RETURN result;
END;
$$;

-- Función para limpiar conversaciones antiguas (para mantenimiento)
CREATE OR REPLACE FUNCTION cleanup_old_conversations(days_old int DEFAULT 90)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count int;
BEGIN
  -- Solo eliminar conversaciones cerradas sin actividad reciente
  DELETE FROM conversations
  WHERE 
    status = 'closed' AND
    updated_at < now() - interval '1 day' * days_old AND
    NOT EXISTS (
      SELECT 1 FROM takeovers 
      WHERE conversation_id = conversations.id AND active = true
    );
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Registrar evento de limpieza
  INSERT INTO events (event_type, event_data, source)
  VALUES (
    'cleanup_completed',
    jsonb_build_object('deleted_conversations', deleted_count, 'days_old', days_old),
    'system'
  );
  
  RETURN deleted_count;
END;
$$;

-- Vista para facilitar consultas de mensajes con metadatos
CREATE VIEW message_details AS
SELECT 
  m.*,
  c.title as conversation_title,
  c.user_id as conversation_user_id,
  p.full_name as sender_name,
  p.email as sender_email,
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'kind', a.kind,
        'public_url', a.public_url,
        'mime_type', a.mime_type,
        'size_bytes', a.size_bytes
      )
    ) FILTER (WHERE a.id IS NOT NULL), 
    '[]'::jsonb
  ) as attachments
FROM messages m
JOIN conversations c ON m.conversation_id = c.id
LEFT JOIN profiles p ON m.sender_id = p.id
LEFT JOIN attachments a ON m.id = a.message_id
GROUP BY m.id, c.title, c.user_id, p.full_name, p.email;

-- Crear usuario administrador por defecto (opcional)
-- Nota: Este será configurado en el seed