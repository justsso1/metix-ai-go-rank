export type EmailRequest = { email: string; submittedAt: string };
type RequestStore = Pick<Storage, 'getItem' | 'setItem'>;
export type EmailRequestOptions = { signal?: AbortSignal; storage?: RequestStore; delayMs?: number };
export const validEmail = (value: string) => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export function readEmailRequest(key: string, storage?: RequestStore): EmailRequest | null {
  try {
    const record = JSON.parse((storage ?? localStorage).getItem(key) || 'null');
    return record && typeof record.email === 'string' && validEmail(record.email) && typeof record.submittedAt === 'string' && Number.isFinite(Date.parse(record.submittedAt)) ? record : null;
  } catch { return null; }
}

/** Local preview adapter. Replace with the request API when available. */
export async function submitEmailRequest(key: string, rawEmail: string, options: EmailRequestOptions = {}): Promise<EmailRequest> {
  const email = rawEmail.trim();
  if (!validEmail(email)) throw new Error('Enter a valid email address.');
  await new Promise<void>((resolve, reject) => {
    if (options.signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { options.signal?.removeEventListener('abort', abort); resolve(); }, options.delayMs ?? 650);
    options.signal?.addEventListener('abort', abort, { once: true });
  });
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const request = { email, submittedAt: new Date().toISOString() };
  // A storage failure must not leave the interface claiming a saved request.
  (options.storage ?? localStorage).setItem(key, JSON.stringify(request));
  return request;
}
