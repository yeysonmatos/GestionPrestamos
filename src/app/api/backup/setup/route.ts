import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { rateLimitByIp } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  if (!rateLimitByIp(request, 'backup:setup', 3, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' }, { status: 429 })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({
      error: 'SUPABASE_SERVICE_ROLE_KEY no configurada',
      hint: 'Agrega SUPABASE_SERVICE_ROLE_KEY a .env.local o ejecuta el SQL manualmente en Supabase Dashboard → SQL Editor',
      sql: `-- Crear bucket
INSERT INTO storage.buckets (id, name, public, avif_autodetection)
VALUES ('backups', 'backups', false, false)
ON CONFLICT (id) DO NOTHING;

-- Políticas RLS
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
  );`,
    }, { status: 400 })
  }

  const { data: buckets } = await admin.storage.listBuckets()
  if (buckets?.some(b => b.id === 'backups')) {
    return NextResponse.json({ success: true, message: 'El bucket backups ya existe' })
  }

  const { error } = await admin.storage.createBucket('backups', {
    public: false,
    allowedMimeTypes: ['text/csv', 'application/json'],
  })

  if (error) {
    return NextResponse.json({
      error: `Error al crear bucket: ${error.message}`,
      hint: 'Ejecuta el SQL manualmente en Supabase Dashboard → SQL Editor',
      sql: `INSERT INTO storage.buckets (id, name, public, avif_autodetection) VALUES ('backups', 'backups', false, false) ON CONFLICT (id) DO NOTHING;`,
    }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: 'Bucket backups creado correctamente' })
}

export async function GET() {
  return NextResponse.json({
    message: 'POST /api/backup/setup — Crea el bucket backups en Supabase Storage',
    hint: 'Necesita SUPABASE_SERVICE_ROLE_KEY en .env.local',
  })
}
