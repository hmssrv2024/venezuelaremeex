-- Crear bucket de storage para uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('uploads', 'uploads', true);

-- Políticas de storage para el bucket uploads
CREATE POLICY "Authenticated users can upload files" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'uploads' AND
  auth.role() = 'authenticated'
);

CREATE POLICY "Users can view uploaded files" ON storage.objects
FOR SELECT USING (
  bucket_id = 'uploads'
);

CREATE POLICY "Users can update own files" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'uploads' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own files" ON storage.objects
FOR DELETE USING (
  bucket_id = 'uploads' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Admins pueden gestionar todos los archivos
CREATE POLICY "Admins can manage all files" ON storage.objects
FOR ALL USING (
  bucket_id = 'uploads' AND
  is_admin(auth.uid())
);