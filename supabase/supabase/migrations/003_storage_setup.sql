-- Insert storage buckets
INSERT INTO storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
VALUES 
  ('chat-files', 'chat-files', true, ARRAY['image/*', 'audio/*', 'video/*', 'application/pdf', 'text/*'], 52428800), -- 50MB
  ('documents', 'documents', false, ARRAY['application/pdf', 'text/*', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], 104857600); -- 100MB

-- Storage policies for chat-files bucket
CREATE POLICY "Users can upload chat files" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'chat-files' AND
    auth.role() = 'authenticated'
  );

CREATE POLICY "Users can view chat files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'chat-files'
  );

CREATE POLICY "Users can delete their chat files" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'chat-files' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policies for documents bucket
CREATE POLICY "Admins can upload documents" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'documents' AND
    is_admin(auth.uid())
  );

CREATE POLICY "Admins can view documents" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'documents' AND
    is_admin(auth.uid())
  );

CREATE POLICY "Admins can delete documents" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'documents' AND
    is_admin(auth.uid())
  );