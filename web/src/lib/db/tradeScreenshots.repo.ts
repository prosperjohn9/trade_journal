import { supabase } from '@/src/lib/supabase/client';

export async function uploadTradeBeforeScreenshot(params: {
  userId: string;
  tradeId: string;
  file: File;
}): Promise<string> {
  const { userId, tradeId, file } = params;

  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `before/${userId}/${tradeId}.${ext}`;

  const { error } = await supabase.storage
    .from('trade-screenshots')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type || undefined,
    });

  if (error) throw error;
  return path;
}

export async function uploadTradeAfterScreenshot(params: {
  userId: string;
  tradeId: string;
  file: File;
}): Promise<string> {
  const { userId, tradeId, file } = params;

  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `after/${userId}/${tradeId}.${ext}`;

  const { error } = await supabase.storage
    .from('trade-screenshots')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type || undefined,
    });

  if (error) throw error;
  return path;
}

export async function signTradeScreenshotPath(path: string, seconds = 60 * 10) {
  const { data, error } = await supabase.storage
    .from('trade-screenshots')
    .createSignedUrl(path, seconds);

  if (error || !data?.signedUrl) return '';
  return data.signedUrl;
}