-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pgjwt";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Create custom types
CREATE TYPE chat_status AS ENUM ('active', 'paused', 'ended');
CREATE TYPE message_type AS ENUM ('text', 'audio', 'image', 'file', 'system');
CREATE TYPE llm_provider AS ENUM ('minimax', 'gemini', 'auto', 'hybrid');
CREATE TYPE takeover_status AS ENUM ('active', 'inactive');
CREATE TYPE enhancement_style AS ENUM ('formal', 'concise', 'friendly', 'sales', 'neutral');

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin(user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS(
    SELECT 1 FROM profiles 
    WHERE id = user_id AND role = 'admin'
  );
$$;

-- Profiles table
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  avatar_url text,
  role text DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  preferences jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Conversations table
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  title text,
  status chat_status DEFAULT 'active',
  preferred_llm llm_provider DEFAULT 'auto',
  context jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  last_activity timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Messages table
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  type message_type DEFAULT 'text',
  content text,
  metadata jsonb DEFAULT '{}',
  llm_provider llm_provider,
  tokens_used integer DEFAULT 0,
  response_time_ms integer,
  is_admin_message boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Attachments table
CREATE TABLE attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES messages(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_size bigint,
  mime_type text,
  storage_path text NOT NULL,
  public_url text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Admin drafts table (for enhancement feature)
CREATE TABLE admin_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  original_content text NOT NULL,
  enhanced_content text NOT NULL,
  style enhancement_style NOT NULL,
  diff_html text,
  created_at timestamptz DEFAULT now()
);

-- Events table (for realtime presence and notifications)
CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_data jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Documents table (for RAG system)
CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  file_name text,
  file_size bigint,
  mime_type text,
  embedding vector(1536), -- for OpenAI embeddings, adjust size as needed
  metadata jsonb DEFAULT '{}',
  uploaded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Takeovers table (admin conversation control)
CREATE TABLE takeovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  admin_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  status takeover_status DEFAULT 'active',
  reason text,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz
);

-- Create indexes for performance
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_conversations_last_activity ON conversations(last_activity DESC);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_messages_user_id ON messages(user_id);

CREATE INDEX idx_attachments_message_id ON attachments(message_id);

CREATE INDEX idx_events_conversation_id ON events(conversation_id);
CREATE INDEX idx_events_created_at ON events(created_at DESC);

CREATE INDEX idx_documents_embedding ON documents USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_documents_uploaded_by ON documents(uploaded_by);

CREATE INDEX idx_takeovers_conversation_id ON takeovers(conversation_id);
CREATE INDEX idx_takeovers_status ON takeovers(status);

-- Auto-updated triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();