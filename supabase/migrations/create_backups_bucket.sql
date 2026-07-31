-- Crear bucket para backups
-- Ejecutar en Supabase Dashboard → SQL Editor

INSERT INTO storage.buckets (id, name, public, avif_autodetection)
VALUES ('backups', 'backups', false, false)
ON CONFLICT (id) DO NOTHING;

-- Política: solo el owner puede leer/escribir en su carpeta
-- Los archivos se guardan como: user_{uid}/{timestamp}/{table}.csv
-- storage.foldername(name) devuelve ['user_{uid}', '{timestamp}']
CREATE POLICY "users_read_own_backups" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'backups' AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = 'user_' || auth.uid()::text
  );

CREATE POLICY "users_insert_own_backups" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'backups' AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = 'user_' || auth.uid()::text
  );

CREATE POLICY "users_delete_own_backups" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'backups' AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = 'user_' || auth.uid()::text
  );
