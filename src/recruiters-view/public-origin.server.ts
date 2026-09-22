import { SITE_ORIGIN } from './site';

export function publicOriginForRequest(request: Request): string {
  const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').split(',')[0].trim();
  try {
    const url = new URL(`http://${host}`);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (!local && !url.hostname.endsWith('.metix.ai')) return SITE_ORIGIN;
    return new URL(`${local ? 'http' : 'https'}://${url.host}`).origin;
  } catch {
    return SITE_ORIGIN;
  }
}
