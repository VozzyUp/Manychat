/** WhatsApp customer service window: free-form messages only within 24 h of the last inbound (§4.2). */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function withinServiceWindow(
  lastInboundAt: Date | string | null | undefined,
  now = new Date(),
): boolean {
  if (!lastInboundAt) return false;
  const last = typeof lastInboundAt === 'string' ? new Date(lastInboundAt) : lastInboundAt;
  return now.getTime() - last.getTime() < SERVICE_WINDOW_MS;
}

/** Extension for a media MIME type (storage path tenant/yyyy/mm/wamid.ext). */
export function extensionFor(mimeType: string, filename?: string): string {
  const fromName = filename?.match(/\.([a-z0-9]{1,8})$/i)?.[1];
  if (fromName) return fromName.toLowerCase();
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/amr': 'amr',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'text/plain': 'txt',
  };
  return map[mimeType.split(';')[0]!.trim().toLowerCase()] ?? 'bin';
}
