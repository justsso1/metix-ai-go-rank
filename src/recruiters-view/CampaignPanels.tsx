import { trackCampaign } from './analytics';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, ChevronDown, Mail } from 'lucide-react';
import {
  CONTACT_KEY, initialCampaign,
} from './campaign';
import type { RankLookupFound } from './types';
import { readRankingUpdate, submitRankingUpdate, validRankingUpdateEmail, type RankingUpdateRequest } from './ranking-update';

export function useCampaign(initial: RankLookupFound, onResult: (result: RankLookupFound) => void) {
  const [state, setState] = useState(() => initialCampaign(initial));
  const [email, setEmail] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setState(initialCampaign(initial));
    try { setEmail(localStorage.getItem(CONTACT_KEY) || ''); } catch { /* Optional persistence. */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) onResult(state.result);
  }, [state.result, ready, onResult]);
  function saveEmail(value: string) {
    setEmail(value);
    try { localStorage.setItem(CONTACT_KEY, value); } catch { /* Continue in memory. */ }
  }
  return { state, email, saveEmail, ready };
}

export function ProfileImprovements({ result, email, saveEmail }: {
  result: RankLookupFound; email: string; saveEmail: (value: string) => void;
}) {
  const [request, setRequest] = useState<RankingUpdateRequest | null>(null);
  const [draft, setDraft] = useState(email);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const submission = useRef<AbortController | null>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const touched = useRef(false);

  useEffect(() => { if (!touched.current) setDraft(email); }, [email]);
  useEffect(() => {
    setRequest(readRankingUpdate(result.profile.handle));
    setLoaded(true);
    return () => submission.current?.abort();
  }, [result.profile.handle]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submission.current || request) return;
    const value = draft.trim();
    if (!validRankingUpdateEmail(value)) {
      setError('Enter a valid email address.');
      emailInput.current?.focus();
      return;
    }
    trackCampaign("email_request", { source: "ranking_update", status: "submit" });
    const controller = new AbortController();
    submission.current = controller;
    setSubmitting(true); setError(''); setDraft(value);
    try {
      const saved = await submitRankingUpdate(result.profile.handle, value, { signal: controller.signal, linkedinUrl: result.inputUrl });
      if (controller.signal.aborted) return;
      setRequest(saved); trackCampaign("email_request", { source: "ranking_update", status: "saved" });
      saveEmail(saved.email);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message || 'We couldn’t save your request. Please try again.');
        trackCampaign("email_request", { source: "ranking_update", status: "error" });
      }
    } finally {
      if (!controller.signal.aborted) { setSubmitting(false); submission.current = null; }
    }
  }

  const suggestions = result.suggestions.slice(0, 3);
  return <article className="rv-card rv-improve-card">
    <div className="rv-section-heading"><h2>Your profile checklist</h2><span className="rv-advice-count">{suggestions.length} suggestions</span></div>
    <ol className="rv-advice-list">{suggestions.map((suggestion, index) => {
      const split = suggestion.indexOf(' — ');
      const title = split > 0 ? suggestion.slice(0, split) : ['Make your headline specific', 'Show the impact of your work', 'Clarify your specialization'][index] ?? 'Strengthen your profile';
      const body = split > 0 ? suggestion.slice(split + 3) : suggestion;
      return <li key={suggestion}>
        <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
        <details><summary data-track="checklist_detail" data-track-location="improve" data-track-item-index={index + 1}>{title}<ChevronDown size={16} aria-hidden="true" /></summary><p>{body}</p></details>
      </li>;
    })}</ol>
    <a className="rv-profile-edit-link" href={result.inputUrl} target="_blank" rel="noopener noreferrer" data-track="edit_profile" data-track-location="improve">Edit LinkedIn profile <ArrowUpRight size={15} aria-hidden="true" /></a>

    <div className="rv-email-capture rv-ranking-update-form" aria-busy={submitting}>
      <div className="rv-email-heading"><Mail size={18} aria-hidden="true" /><h3>Recheck your ranking</h3></div>
      {!loaded ? <p role="status">Loading your request…</p> : request ? <p className="rv-success" role="status"><Check size={18} aria-hidden="true" /><span>Update requested. We’ll update your ranking within 5 hours and email <strong>{request.email}</strong> when it’s ready.</span></p> : <>
        <p id="rv-ranking-update-help">Updated your profile? We’ll email your new ranking within 5 hours.</p>
        <form className="rv-email-form" onSubmit={submit} noValidate>
          <label className="rv-sr-only" htmlFor="rv-ranking-update-email">Your email address</label>
          <input ref={emailInput} id="rv-ranking-update-email" type="email" required maxLength={254} autoComplete="email" placeholder="Your email address" value={draft} disabled={submitting} aria-invalid={!!error} aria-describedby={error ? 'rv-ranking-update-help rv-ranking-update-error' : 'rv-ranking-update-help'} onChange={event => { touched.current = true; setDraft(event.target.value); setError(''); }} />
          <button className="btn btn-primary" type="submit" disabled={submitting} data-track="email_submit_click" data-track-location="improve" data-track-source="ranking_update">{submitting ? 'Submitting…' : 'Get my updated ranking'}</button>
        </form>
      </>}
      {error && <p id="rv-ranking-update-error" className="rv-error" role="alert">{error}</p>}
    </div>
  </article>;
}
