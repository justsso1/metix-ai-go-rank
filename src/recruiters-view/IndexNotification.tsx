import { trackCampaign } from './analytics';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { CONTACT_KEY } from './campaign';
import { validEmail, type EmailRequest } from './email-request';
import { readIndexNotification, submitIndexNotification } from './index-notification';

export default function IndexNotification({ handle }: { handle: string }) {
  const [expanded, setExpanded] = useState(false), [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState(''), [error, setError] = useState(''), [submitting, setSubmitting] = useState(false);
  const [request, setRequest] = useState<EmailRequest | null>(null);
  const input = useRef<HTMLInputElement>(null), submission = useRef<AbortController | null>(null);
  useEffect(() => {
    setRequest(readIndexNotification(handle)); setLoaded(true);
    try { setDraft(localStorage.getItem(CONTACT_KEY) || ''); } catch { /* Email reuse is optional. */ }
    return () => submission.current?.abort();
  }, [handle]);
  useEffect(() => { if (expanded) input.current?.focus({ preventScroll: true }); }, [expanded]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submission.current) return;
    const value = draft.trim();
    if (!validEmail(value)) { setError('Enter a valid email address.'); input.current?.focus(); return; }
    trackCampaign("email_request", { source: "index_notification", status: "submit", mode: "local_preview" });
    const controller = new AbortController(); submission.current = controller;
    setSubmitting(true); setError(''); setDraft(value);
    try {
      const saved = await submitIndexNotification(handle, value, { signal: controller.signal });
      if (!controller.signal.aborted) { setRequest(saved); trackCampaign("email_request", { source: "index_notification", status: "saved", mode: "local_preview" }); }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError('We couldn’t save your request. Please try again.');
    } finally {
      if (!controller.signal.aborted) { setSubmitting(false); submission.current = null; }
    }
  }

  if (!expanded && !request) return <button className="btn btn-secondary" type="button" disabled={!loaded} onClick={() => setExpanded(true)}>Notify me when indexed</button>;
  return <div className="rv-email-capture rv-index-notification" aria-busy={submitting}>
    {request ? <p className="rv-success" role="status"><Check size={18} aria-hidden="true" /><span>We’ll email you at <strong>{request.email}</strong> when your profile is indexed.</span></p> : <>
      <div className="rv-email-heading"><Bell size={18} aria-hidden="true" /><h2>Get notified when your profile is indexed</h2></div>
      <form className="rv-email-form" onSubmit={submit} noValidate>
        <label className="rv-sr-only" htmlFor="rv-index-email">Your email address</label>
        <input ref={input} id="rv-index-email" type="email" required maxLength={254} autoComplete="email" placeholder="Your email address" value={draft} disabled={submitting} aria-invalid={!!error} aria-describedby={error ? 'rv-index-error' : undefined} onChange={event => { setDraft(event.target.value); setError(''); }} />
        <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Notify me'}</button>
      </form>
      {error && <p className="rv-error" id="rv-index-error" role="alert">{error}</p>}
    </>}
  </div>;
}
