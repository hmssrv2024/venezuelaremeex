-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pgjwt";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Crear enum types
CREATE TYPE user_role AS ENUM ('user', 'admin');
CREATE TYPE conversation_status AS ENUM ('active', 'closed');
CREATE TYPE message_sender AS ENUM ('user', 'admin', 'bot');
CREATE TYPE message_type AS ENUM ('text', 'image', 'audio', 'file', 'system');
CREATE TYPE message_status AS ENUM ('pending', 'sent', 'blocked');
CREATE TYPE attachment_kind AS ENUM ('image', 'audio', 'file');
CREATE TYPE draft_status AS ENUM ('pending', 'approved', 'rejected');

-- Función helper para verificar si un usuario es admin
CREATE OR REPLACE FUNCTION is_admin(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = user_id AND role = 'admin'
  );
END;
$$;

-- Tabla de perfiles de usuario
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  role user_role NOT NULL DEFAULT 'user',
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para profiles
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_email ON profiles(email);

-- Tabla de conversaciones
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Nueva conversación',
  status conversation_status NOT NULL DEFAULT 'active',
  bot_paused boolean NOT NULL DEFAULT false,
  llm_preference text DEFAULT 'auto', -- 'minimax', 'gemini', 'auto', 'hybrid'
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para conversations
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_conversations_created_at ON conversations(created_at DESC);

-- Tabla de mensajes
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender message_sender NOT NULL,
  sender_id uuid REFERENCES auth.users(id), -- null para bot
  type message_type NOT NULL DEFAULT 'text',
  content text NOT NULL,
  tokens_estimated int DEFAULT 0,
  status message_status NOT NULL DEFAULT 'sent',
  llm_provider text, -- 'minimax', 'gemini' para mensajes del bot
  processing_time_ms int, -- tiempo de procesamiento para respuestas del bot
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para messages
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_sender ON messages(sender);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_messages_type ON messages(type);

-- Tabla de archivos adjuntos
CREATE TABLE attachments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  kind attachment_kind NOT NULL,
  storage_path text NOT NULL,
  public_url text,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  duration_seconds int, -- para audio
  width int, -- para imágenes
  height int, -- para imágenes
  alt_text text, -- para accesibilidad
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para attachments
CREATE INDEX idx_attachments_message_id ON attachments(message_id);
CREATE INDEX idx_attachments_kind ON attachments(kind);

-- Tabla de borradores del admin (para mejorador de redacción)
CREATE TABLE admin_drafts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  original_message_id uuid REFERENCES messages(id), -- null si es mensaje nuevo
  original_text text,
  draft_text text NOT NULL,
  enhancement_style text NOT NULL, -- 'formal', 'conciso', 'amable', 'vendedor', 'neutro'
  enhancement_intensity int DEFAULT 50 CHECK (enhancement_intensity >= 0 AND enhancement_intensity <= 100),
  status draft_status NOT NULL DEFAULT 'pending',
  diff_data jsonb, -- para mostrar diferencias
  metrics jsonb DEFAULT '{}', -- métricas como longitud, tono, etc.
  created_by uuid NOT NULL REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz
);

-- Índices para admin_drafts
CREATE INDEX idx_admin_drafts_conversation_id ON admin_drafts(conversation_id);
CREATE INDEX idx_admin_drafts_created_by ON admin_drafts(created_by);
CREATE INDEX idx_admin_drafts_status ON admin_drafts(status);

-- Tabla de eventos del sistema (para logging y observabilidad)
CREATE TABLE events (
  id bigserial PRIMARY KEY,
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  event_type text NOT NULL,
  event_data jsonb NOT NULL DEFAULT '{}',
  source text NOT NULL DEFAULT 'system', -- 'user', 'admin', 'bot', 'system'
  severity text DEFAULT 'info', -- 'debug', 'info', 'warn', 'error'
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para events
CREATE INDEX idx_events_conversation_id ON events(conversation_id);
CREATE INDEX idx_events_user_id ON events(user_id);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_created_at ON events(created_at DESC);
CREATE INDEX idx_events_severity ON events(severity);

-- Tabla de documentos para RAG
CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  content text NOT NULL,
  mime_type text NOT NULL,
  storage_path text,
  file_size bigint DEFAULT 0,
  chunk_index int DEFAULT 0, -- para documentos divididos en chunks
  total_chunks int DEFAULT 1,
  embedding vector(1536), -- OpenAI embeddings dimension
  metadata jsonb DEFAULT '{}',
  tags text[] DEFAULT '{}',
  is_public boolean DEFAULT false,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para documents
CREATE INDEX idx_documents_title ON documents(title);
CREATE INDEX idx_documents_uploaded_by ON documents(uploaded_by);
CREATE INDEX idx_documents_tags ON documents USING GIN(tags);
CREATE INDEX idx_documents_is_public ON documents(is_public);
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);

-- Índice de similitud vectorial para RAG
CREATE INDEX idx_documents_embedding ON documents USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Tabla de control de conversaciones (takeover)
CREATE TABLE takeovers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL REFERENCES auth.users(id),
  active boolean NOT NULL DEFAULT true,
  reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

-- Índices para takeovers
CREATE INDEX idx_takeovers_conversation_id ON takeovers(conversation_id);
CREATE INDEX idx_takeovers_admin_id ON takeovers(admin_id);
CREATE INDEX idx_takeovers_active ON takeovers(active);

-- Tabla de configuración del sistema
CREATE TABLE system_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_config_updated_at BEFORE UPDATE ON system_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Función para crear perfil automáticamente cuando se registra un usuario
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para crear perfil automáticamente
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Insertar configuración por defecto del sistema
INSERT INTO system_config (key, value, description) VALUES
  ('chat_settings', '{"max_tokens": 4000, "temperature": 0.7, "streaming": true}', 'Configuración general del chat'),
  ('llm_settings', '{"minimax": {"enabled": true, "models": {"text": "abab6.5s-chat", "vision": "abab6.5s-chat", "audio": "speech-01"}}, "gemini": {"enabled": true, "models": {"text": "gemini-1.5-pro", "vision": "gemini-1.5-pro", "audio": "gemini-1.5-pro"}}}', 'Configuración de proveedores LLM'),
  ('upload_settings', '{"max_file_size": 10485760, "allowed_types": ["image/jpeg", "image/png", "image/webp", "audio/webm", "audio/wav", "audio/mp3", "application/pdf", "text/plain"]}', 'Configuración de subida de archivos'),
  ('rate_limits', '{"messages_per_hour": 100, "uploads_per_hour": 20, "admin_actions_per_hour": 200}', 'Límites de velocidad por usuario');
