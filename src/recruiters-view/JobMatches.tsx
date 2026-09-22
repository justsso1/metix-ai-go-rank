import { trackCampaign } from './analytics';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Mail } from 'lucide-react';
import { matchedJobs, type MatchedJob } from './campaign';
import { readShortlist, submitShortlist, validShortlistEmail, type ShortlistRequest } from './job-shortlist';
import type { RankLookupFound } from './types';

export default function JobMatches({ result, email, saveEmail }: { result: RankLookupFound; email: string; saveEmail: (email: string) => void }) {
  const [selected, setSelected] = useState<MatchedJob | null>(null);
  const [request, setRequest] = useState<ShortlistRequest | null>(null);
  const [draft, setDraft] = useState(email), [error, setError] = useState(''), [submitting, setSubmitting] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), submission = useRef<AbortController | null>(null);
  const emailInput = useRef<HTMLInputElement>(null), touched = useRef(false);
  useEffect(() => { if (!touched.current) setDraft(email); }, [email]);
  useEffect(() => {
    setRequest(readShortlist(result.profile.handle)); setLoaded(true);
    return () => submission.current?.abort();
  }, [result.profile.handle]);
  useEffect(() => { if (selected) dialog.current?.showModal(); }, [selected]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submission.current) return;
    const value = draft.trim();
    if (!validShortlistEmail(value)) { setError('Enter a valid email address.'); emailInput.current?.focus(); return; }
    trackCampaign("email_request", { source: "job_shortlist", status: "submit", mode: "local_preview" });
    const controller = new AbortController(); submission.current = controller;
    setSubmitting(true); setError(''); setDraft(value);
    try {
      const saved = await submitShortlist(result, value, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setRequest(saved); trackCampaign("email_request", { source: "job_shortlist", status: "saved", mode: "local_preview" }); saveEmail(saved.email);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError('We couldn’t save your request. Please try again.');
    } finally {
      if (!controller.signal.aborted) { setSubmitting(false); submission.current = null; }
    }
  }
  return <article className="rv-card rv-jobs-card">
    <div className="rv-job-list">
      {matchedJobs(result).slice(0, 3).map((job, index) => job.url ? <a key={job.id} className="rv-job" onClick={() => trackCampaign("job_click", { destination: "external", mode: "live" })} href={job.url} target="_blank" rel="noopener noreferrer" aria-label={`Apply: ${job.title} at ${job.company}`}>
        <span className="rv-job-number">{String(index + 1).padStart(2, '0')}</span>
        <span className="rv-job-content"><strong>{job.title}</strong><span>{job.company} · {job.location} · {job.workStyle}</span></span>
        <ArrowUpRight size={18} aria-hidden="true" />
      </a> : <button key={job.id} type="button" className="rv-job" onClick={() => { trackCampaign("job_click", { destination: "details", mode: "demo" }); setSelected(job); }} aria-label={`View details: ${job.title} at ${job.company}`}>
        <span className="rv-job-number">{String(index + 1).padStart(2, '0')}</span>
        <span className="rv-job-content"><strong>{job.title}</strong><span>{job.company} · {job.location} · {job.workStyle}</span><small>{job.reason}</small></span>
        <ArrowUpRight size={18} aria-hidden="true" />
      </button>)}
    </div>
    <div className="rv-email-capture rv-shortlist-form" aria-busy={submitting}>
      <div className="rv-email-heading"><Mail size={18} /><h2>Get your top 10 job matches by email</h2></div>
      {!loaded ? <p role="status">Loading your request…</p> : request ? <p className="rv-success" role="status"><Check size={18} /><span>We’ll email your top 10 job matches to <strong>{request.email}</strong> within 24 hours.</span></p> : <form className="rv-email-form" onSubmit={submit} noValidate>
        <label className="rv-sr-only" htmlFor="rv-shortlist-email">Your email address</label>
        <input ref={emailInput} id="rv-shortlist-email" type="email" required maxLength={254} autoComplete="email" placeholder="Your email address" value={draft} disabled={submitting} aria-invalid={!!error} aria-describedby={error ? 'rv-shortlist-error' : undefined} onChange={event => { touched.current = true; setDraft(event.target.value); setError(''); }} />
        <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Send me the shortlist'}</button>
      </form>}
      {error && <p id="rv-shortlist-error" className="rv-error" role="alert">{error}</p>}
    </div>
    <dialog ref={dialog} className="rv-job-dialog" aria-labelledby="rv-job-detail-title" onClose={() => setSelected(null)} onClick={event => { if (event.target === dialog.current) dialog.current?.close(); }}>
      {selected && <><div className="rv-section-heading"><p className="rv-rank-kicker">EXAMPLE JOB</p><button type="button" className="rv-text-button" onClick={() => dialog.current?.close()}>Close</button></div><h3 id="rv-job-detail-title">{selected.title}</h3><p>{selected.company} · {selected.location} · {selected.workStyle}</p><h4>Why this role fits</h4><p>{selected.reason}</p><div className="rv-keywords">{(selected.skills || []).map(skill => <span key={skill} className="rv-keyword">{skill}</span>)}</div><h4>What you would work on</h4><p>Own projects from design to delivery, partner with product and engineering, and bring your expertise to a growing team.</p><p className="rv-demo-note">This is a sample recommendation for the preview. Live job details and application links will come from the jobs service.</p></>}
    </dialog>
  </article>;
}
