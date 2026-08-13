-- Bucket "documents" + políticas de storage (tickets, docs de préstamo)
-- Ejecutar en Supabase Dashboard → SQL Editor

INSERT INTO storage.buckets (id, name, public, avif_autodetection)
VALUES ('documents', 'documents', false, false)
ON CONFLICT (id) DO NOTHING;

-- Cualquier usuario autenticado puede leer archivos del bucket documents
-- (necesario para createSignedUrl en tickets y documentos de préstamo)
DROP POLICY IF EXISTS "users_read_documents" ON storage.objects;
CREATE POLICY "users_read_documents" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'documents' AND auth.role() = 'authenticated'
  );

-- Usuarios autenticados pueden subir archivos al bucket documents
DROP POLICY IF EXISTS "users_insert_documents" ON storage.objects;
CREATE POLICY "users_insert_documents" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'documents' AND auth.role() = 'authenticated'
  );

-- Usuarios autenticados pueden borrar sus archivos en el bucket documents
DROP POLICY IF EXISTS "users_delete_documents" ON storage.objects;
CREATE POLICY "users_delete_documents" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'documents' AND auth.role() = 'authenticated'
  );