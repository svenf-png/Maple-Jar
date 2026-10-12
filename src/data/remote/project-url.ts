/** Projekt-URL prüfen: `https://<ref>.supabase.co`, ohne Pfad. Gibt den Origin zurück oder null. */
export function parseProjectUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password || url.port) return null;
  if (url.search || url.hash) return null;
  if (url.pathname !== '/' && url.pathname !== '') return null;
  if (!/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)) return null;
  return url.origin;
}
