-- Activar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pgjwt";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Función helper para verificar si el usuario es admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función helper para verificar propiedad de conversación
CREATE OR REPLACE FUNCTION owns_conversation(conversation_id uuid)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM conversations 
    WHERE id = conversation_id AND user_id = auth.uid()
  ) OR is_admin();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Tabla de perfiles de usuario
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text,
  avatar_url text,
  role text DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  preferences jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabla de conversaciones
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL DEFAULT 'Nueva Conversación',
  status text DEFAULT 'active' CHECK (status IN ('active', 'closed', 'archived')),
  bot_paused boolean DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabla de mensajes
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  sender text NOT NULL CHECK (sender IN ('user', 'admin', 'bot', 'system')),
  type text DEFAULT 'text' CHECK (type IN ('text', 'image', 'audio', 'file', 'system')),
  content text NOT NULL,
  model_used text,
  tokens_estimated integer DEFAULT 0,
  status text DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'blocked', 'failed')),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabla de archivos adjuntos
CREATE TABLE attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES messages(id) ON DELETE CASCADE NOT NULL,
  kind text NOT NULL CHECK (kind IN ('image', 'audio', 'file')),
  storage_path text NOT NULL,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  duration_sec integer, -- Para archivos de audio
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Tabla de borradores del admin
CREATE TABLE admin_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  original_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  draft_text text NOT NULL,
  style text DEFAULT 'neutro' CHECK (style IN ('formal', 'conciso', 'amable', 'vendedor', 'neutro')),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_by uuid REFERENCES profiles(id) NOT NULL,
  approved_at timestamptz,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Tabla de eventos para observabilidad
CREATE TABLE events (
  id bigserial PRIMARY KEY,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  payload jsonb DEFAULT '{}',
  ip_address inet,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Tabla de documentos para RAG
CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  mime_type text NOT NULL,
  storage_path text NOT NULL,
  text_content text NOT NULL,
  embedding vector(1536), -- Dimensión para embeddings de OpenAI/Gemini
  chunk_size integer DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  uploaded_by uuid REFERENCES profiles(id) NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabla de takeovers (control admin)
CREATE TABLE takeovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  admin_id uuid REFERENCES profiles(id) NOT NULL,
  active boolean DEFAULT true,
  reason text,
  created_at timestamptz DEFAULT now(),
  ended_at timestamptz
);

-- Tabla para rate limiting
CREATE TABLE rate_limits (
  id bigserial PRIMARY KEY,
  identifier text NOT NULL, -- IP address or user ID
  endpoint text NOT NULL,
  count integer DEFAULT 1,
  window_start timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Índices para optimización
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_attachments_message_id ON attachments(message_id);
CREATE INDEX idx_admin_drafts_conversation_id ON admin_drafts(conversation_id);
CREATE INDEX idx_admin_drafts_status ON admin_drafts(status);
CREATE INDEX idx_events_conversation_id ON events(conversation_id);
CREATE INDEX idx_events_name ON events(name);
CREATE INDEX idx_events_created_at ON events(created_at);
CREATE INDEX idx_documents_embedding ON documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_takeovers_conversation_id ON takeovers(conversation_id);
CREATE INDEX idx_takeovers_active ON takeovers(active);
CREATE INDEX idx_rate_limits_identifier ON rate_limits(identifier);
CREATE INDEX idx_rate_limits_endpoint ON rate_limits(endpoint);
CREATE INDEX idx_rate_limits_window_start ON rate_limits(window_start);

-- Índices GIN para búsquedas en JSONB
CREATE INDEX idx_events_payload ON events USING gin(payload);
CREATE INDEX idx_documents_metadata ON documents USING gin(metadata);
CREATE INDEX idx_conversations_metadata ON conversations USING gin(metadata);
CREATE INDEX idx_messages_metadata ON messages USING gin(metadata);

-- RLS (Row Level Security) - Perfiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Los usuarios pueden ver su propio perfil" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Los usuarios pueden actualizar su propio perfil" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Los admins pueden ver todos los perfiles" ON profiles
  FOR ALL USING (is_admin());

-- RLS - Conversaciones
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Los usuarios pueden ver sus conversaciones" ON conversations
  FOR SELECT USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "Los usuarios pueden crear conversaciones" ON conversations
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Los usuarios pueden actualizar sus conversaciones" ON conversations
  FOR UPDATE USING (user_id = auth.uid() OR is_admin());

-- RLS - Mensajes
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Los usuarios pueden ver mensajes de sus conversaciones" ON messages
  FOR SELECT USING (owns_conversation(conversation_id));

CREATE POLICY "Los usuarios pueden crear mensajes en sus conversaciones" ON messages
  FOR INSERT WITH CHECK (owns_conversation(conversation_id));

CREATE POLICY "Los usuarios y admins pueden actualizar mensajes" ON messages
  FOR UPDATE USING (owns_conversation(conversation_id));

-- RLS - Attachments
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Los usuarios pueden ver attachments de sus mensajes" ON attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM messages m 
      WHERE m.id = attachments.message_id 
      AND owns_conversation(m.conversation_id)
    )
  );

CREATE POLICY "Los usuarios pueden crear attachments" ON attachments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM messages m 
      WHERE m.id = attachments.message_id 
      AND owns_conversation(m.conversation_id)
    )
  );

-- RLS - Admin Drafts
ALTER TABLE admin_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo admins pueden ver y manipular drafts" ON admin_drafts
  FOR ALL USING (is_admin());

-- RLS - Events
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Los usuarios pueden ver sus eventos" ON events
  FOR SELECT USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "Sistema puede insertar eventos" ON events
  FOR INSERT WITH CHECK (true);

-- RLS - Documents
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Los usuarios pueden ver documentos" ON documents
  FOR SELECT USING (true); -- Documentos son públicos para RAG

CREATE POLICY "Solo admins pueden gestionar documentos" ON documents
  FOR ALL USING (is_admin());

-- RLS - Takeovers
ALTER TABLE takeovers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo admins pueden gestionar takeovers" ON takeovers
  FOR ALL USING (is_admin());

-- RLS - Rate Limits
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sistema puede gestionar rate limits" ON rate_limits
  FOR ALL USING (true);

-- Triggers para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Función para insertar perfil automáticamente al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', '')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para crear perfil automáticamente
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Función para limpiar rate limits antiguos
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM rate_limits 
  WHERE window_start < now() - interval '1 hour';
END;
$$ LANGUAGE plpgsql;

-- Storage bucket para uploads
INSERT INTO storage.buckets (id, name, public) 
VALUES ('uploads', 'uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Política de Storage para uploads
CREATE POLICY "Los usuarios pueden subir archivos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'uploads' AND auth.role() = 'authenticated');

CREATE POLICY "Los usuarios pueden ver archivos públicos" ON storage.objects
  FOR SELECT USING (bucket_id = 'uploads');

CREATE POLICY "Los propietarios pueden actualizar archivos" ON storage.objects
  FOR UPDATE USING (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Los propietarios pueden eliminar archivos" ON storage.objects
  FOR DELETE USING (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);