import { createClient } from './supabase-client'

export async function uploadFile(bucket: string, path: string, file: File): Promise<string | null> {
  const supabase = createClient()

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file)

  if (error) {
    console.error('Upload error:', error)
    return null
  }

  const { data: urlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(path)

  return urlData?.publicUrl || null
}

export async function deleteFile(bucket: string, path: string): Promise<boolean> {
  const supabase = createClient()

  const { error } = await supabase.storage
    .from(bucket)
    .remove([path])

  if (error) {
    console.error('Delete error:', error)
    return false
  }

  return true
}

export function getFilePath(userId: string, folder: string, fileName: string): string {
  return `${userId}/${folder}/${Date.now()}-${fileName}`
}
