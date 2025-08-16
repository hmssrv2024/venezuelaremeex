-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE takeovers ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON profiles
  FOR SELECT USING (is_admin(auth.uid()));

-- Conversations policies
CREATE POLICY "Users can view their own conversations" ON conversations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own conversations" ON conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations" ON conversations
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all conversations" ON conversations
  FOR ALL USING (is_admin(auth.uid()));

-- Messages policies
CREATE POLICY "Users can view messages in their conversations" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE id = messages.conversation_id 
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert messages in their conversations" ON messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE id = messages.conversation_id 
      AND user_id = auth.uid()
    ) OR auth.uid() = user_id
  );

CREATE POLICY "Admins can view all messages" ON messages
  FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert messages" ON messages
  FOR INSERT WITH CHECK (is_admin(auth.uid()));

-- Attachments policies
CREATE POLICY "Users can view attachments in their messages" ON attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE m.id = attachments.message_id 
      AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert attachments in their messages" ON attachments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE m.id = attachments.message_id 
      AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all attachments" ON attachments
  FOR ALL USING (is_admin(auth.uid()));

-- Admin drafts policies
CREATE POLICY "Admins can manage their drafts" ON admin_drafts
  FOR ALL USING (is_admin(auth.uid()) AND auth.uid() = admin_id);

-- Events policies
CREATE POLICY "Users can view events in their conversations" ON events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE id = events.conversation_id 
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert events" ON events
  FOR INSERT WITH CHECK (true); -- Edge functions will handle this

CREATE POLICY "Admins can view all events" ON events
  FOR ALL USING (is_admin(auth.uid()));

-- Documents policies (RAG system)
CREATE POLICY "Everyone can view documents" ON documents
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage documents" ON documents
  FOR ALL USING (is_admin(auth.uid()));

-- Takeovers policies
CREATE POLICY "Admins can manage takeovers" ON takeovers
  FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Users can view takeovers of their conversations" ON takeovers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE id = takeovers.conversation_id 
      AND user_id = auth.uid()
    )
  );