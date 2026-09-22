import { trackCampaign, trackCampaignPage } from './analytics';
import { type FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, Linkedin } from "lucide-react";
import ResultStage, { RankingCard } from './ResultStage';
import RankingJourney from './RankingJourney';
import { flushSync } from 'react-dom';
import { campaignAddress, campaignPage, missingResultAddress, viewStateKey, type CampaignPage, type ResultPage } from './routes';
import { ProfileImprovements, useCampaign } from './CampaignPanels';
import JobMatches from './JobMatches';
import IndexNotification from './IndexNotification';
import { indexNotificationKey } from './index-notification';
import { shortlistKey } from './job-shortlist';
import { rankingUpdateKey } from './ranking-update';
import { applySharedMockState, campaignKey, CONTACT_KEY, readCampaign, resultShareUrl, scopeLabel, showsJobMatches } from './campaign';
import { shareMetadata } from './share';
import { atlasEnabled, ATLAS_LOOKUP_MS, removeAtlasProfile } from "./atlas";
import {
  EXAMPLES,
  GENERIC_SUGGESTIONS,
  isPreviewHandle,
  lookupRanking,
  parseLinkedInInput,
  SHARE_ORIGIN,
  upgradeMockSnapshot,
} from "./mock";
import type {
  LookupProgress,
  RankLookupResult,
  RankLookupFound,
  RankLookupNotFound,
} from "./types";

const REMOVED_KEY = "metix-recruiters-view-removed";
const holdJourneyResult = () => {};

export default function RecruitersViewApp({ initialResult, initialPage = initialResult ? 'result' : 'entry' }: { initialResult?: RankLookupFound; initialPage?: CampaignPage }) {
  const [page, setPage] = useState<CampaignPage>(initialPage);
  const [returnScroll, setReturnScroll] = useState<number | null>(null);
  const [url, setUrl] = useState(initialResult?.inputUrl ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<LookupProgress | null>(null);
  const [result, setResult] = useState<RankLookupResult | null>(initialResult ?? null);
  const removed = useRef<string[]>([]);
  const [toast, setToast] = useState("");
  const [reveal, setReveal] = useState(false);
  const [journey, setJourney] = useState<number | null>(null);
  const journeyNumber = useRef(0);
  const journeyActive = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(REMOVED_KEY) || "[]");
      if (Array.isArray(stored)) {
        removed.current = stored.filter((item) => typeof item === "string");
      }
    } catch {
      removed.current = [];
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const scene = campaignPage(location.pathname, location.search);
    setPage(scene);
    const restore = history.state?.rv;
    if (restore?.result && scene !== 'entry') {
      const restored = applyRemoval(restore.result);
      if (restored.status === 'not_found' && restored.handle && !isPreviewHandle(restored.handle)) {
        const nextUrl = restored.inputUrl || `https://www.linkedin.com/in/${restored.handle}`;
        setUrl(nextUrl);
        void runLookup(nextUrl, params);
      } else if (restored.status === 'not_found') showMissingResult(restored, true, restore.scroll ?? 0);
      else { setResult(restored); setReturnScroll(restore.scroll ?? 0); }
    } else if (params.get('u')) {
      const nextUrl = `https://www.linkedin.com/in/${params.get('u')}`;
      setUrl(nextUrl); void runLookup(nextUrl, params);
    } else if (initialResult) {
      const restored = applyRemoval(initialResult);
      if (restored.status === 'not_found') showMissingResult(restored, true);
      else history.replaceState({ ...history.state, rv: { page: scene, result: initialResult, scroll: 0 } }, '', location.href);
    } else if (scene !== 'entry') { setPage('entry'); history.replaceState({}, '', '/recruiters-view/'); }
    const previousRestoration = history.scrollRestoration; history.scrollRestoration = 'manual';
    const pop = (event: PopStateEvent) => {
      abortRef.current?.abort(); journeyActive.current = false; setLoading(false); setReveal(false); setJourney(null); setError('');
      const destination = campaignPage(location.pathname, location.search);
      setPage(destination);
      if (destination === 'entry') { setResult(null); setReturnScroll(event.state?.rv?.scroll ?? 0); }
      else if (event.state?.rv?.result) {
        const restored = applyRemoval(event.state.rv.result);
        const query = new URLSearchParams(location.search);
        if (restored.status === 'not_found' && restored.handle && !isPreviewHandle(restored.handle)) {
          const nextUrl = restored.inputUrl || `https://www.linkedin.com/in/${restored.handle}`;
          setUrl(nextUrl);
          void runLookup(nextUrl, query);
        } else if (restored.status === 'not_found') showMissingResult(restored, true, event.state.rv.scroll ?? 0);
        else { setResult(restored); setReturnScroll(event.state.rv.scroll ?? 0); }
      }
      else {
        const query = new URLSearchParams(location.search);
        const handle = query.get('u') ?? location.pathname.split('/').filter(Boolean).at(-1);
        if (handle) void runLookup(`https://www.linkedin.com/in/${handle}`, query);
      }
    };
    let scrollFrame = 0;
    const saveScroll = () => {
      if (journeyActive.current) return;
      cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(() => {
        if (history.state?.rv) history.replaceState({ ...history.state, rv: { ...history.state.rv, scroll: window.scrollY } }, '', location.href);
      });
    };
    window.addEventListener('scroll', saveScroll, { passive: true });
    window.addEventListener('popstate', pop);
    return () => { cancelAnimationFrame(scrollFrame); window.removeEventListener('scroll', saveScroll); window.removeEventListener('popstate', pop); history.scrollRestoration = previousRestoration; };
  }, []);

  useEffect(() => {
    if (returnScroll === null || loading) return;
    const frame = requestAnimationFrame(() => { window.scrollTo({ top: returnScroll, behavior: 'instant' }); setReturnScroll(null); });
    return () => cancelAnimationFrame(frame);
  }, [page, result, loading, returnScroll]);

  useEffect(() => {
    if (loading) return;
    const scene = page === 'entry' ? 'root' : page === 'result' && location.pathname.startsWith('/recruiters-view/share/') ? 'share' : page;
    trackCampaignPage(scene);
    if (page === 'result' && result?.status === 'found' && journey === null) {
      trackCampaign('result_view', { mode: result.profileVersion === 'atlas' ? 'live' : 'demo' });
    }
  }, [page, loading, journey, result?.status === 'found' ? `${result.profile.handle}:${result.revision}` : '']);

  function changePage(next: ResultPage, current: RankLookupFound) {
    trackCampaign('navigate', { destination: next });
    const positions = { result: 0, improve: 0, opportunities: 0 };
    try { Object.assign(positions, JSON.parse(sessionStorage.getItem(viewStateKey(current.profile.handle)) || '{}')); } catch { /* Optional view memory. */ }
    if (page !== 'entry') positions[page] = window.scrollY;
    try { sessionStorage.setItem(viewStateKey(current.profile.handle), JSON.stringify(positions)); } catch { /* Optional view memory. */ }
    history.replaceState({ ...history.state, rv: { page, result: current, scroll: window.scrollY } }, '', location.href);
    const enter = () => {
      history.pushState({ rv: { page: next, result: current, scroll: positions[next] } }, '', campaignAddress(current, next));
      flushSync(() => { setReveal(false); setPage(next); });
      window.scrollTo({ top: positions[next], behavior: 'instant' });
      document.querySelector<HTMLElement>(next !== 'result' ? '.rv-task-heading' : '.rv-result-title')?.focus({ preventScroll: true });
    };
    const transition = (document as Document & { startViewTransition?: (callback: () => void) => unknown }).startViewTransition;
    if (transition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && window.innerWidth >= 960) transition.call(document, enter);
    else enter();
  }

  // Keep the browser's title/metadata aligned when an example changes without
  // a reload. Social crawlers receive these values from the prebuilt HTML.
  useEffect(() => {
    if (loading) return;
    const metadata = shareMetadata(result?.status === 'found' ? result : undefined);
    document.title = result?.status === 'not_found' ? 'Profile not indexed · Metix AI' : (page === 'improve' || page === 'opportunities') && result?.status === 'found' ? `${page === 'improve' ? 'Improve your ranking' : 'Jobs matched to your experience'} · ${result.profile.fullName} · Metix AI` : metadata.title;
    const values: Record<string, string> = {
      'og:title': metadata.title,
      'og:description': metadata.description,
      'og:url': `${SHARE_ORIGIN}${metadata.path}`,
      'og:image': `${SHARE_ORIGIN}${metadata.image}`,
      'og:image:alt': metadata.imageAlt,
      'og:image:width': String(metadata.imageWidth),
      'og:image:height': String(metadata.imageHeight),
      'twitter:title': metadata.title,
      'twitter:description': metadata.description,
      'twitter:image': `${SHARE_ORIGIN}${metadata.image}`,
      'twitter:image:alt': metadata.imageAlt,
    };
    for (const [key, content] of Object.entries(values)) {
      document.querySelector<HTMLMetaElement>(`meta[property="${key}"], meta[name="${key}"]`)?.setAttribute('content', content);
    }
    document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute('href', `${SHARE_ORIGIN}${metadata.path}`);
  }, [loading, result, page]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function forgetLocalRemoval(handle: string) {
    const key = handle.toLowerCase();
    const next = removed.current.filter((item) => item.toLowerCase() !== key);
    removed.current = next;
    try {
      window.localStorage.setItem(REMOVED_KEY, JSON.stringify(next));
    } catch { /* Lookup still continues. */ }
  }

  function applyRemoval(current: RankLookupResult): RankLookupResult {
    if (current.status === 'found') current = upgradeMockSnapshot(current);
    if (current.status !== 'found') return current;
    const key = current.profile.handle.toLowerCase();
    if (!removed.current.some((item) => item.toLowerCase() === key)) return current;
    return { status: 'not_found', inputUrl: current.inputUrl, handle: current.profile.handle, suggestions: GENERIC_SUGGESTIONS };
  }

  function showMissingResult(current: RankLookupNotFound, replace = false, scroll = 0) {
    journeyActive.current = false;
    setJourney(null); setReveal(false); setResult(current); setPage('result'); setReturnScroll(scroll);
    const view = { rv: { page: 'result', result: current, scroll } };
    if (replace) history.replaceState(view, '', missingResultAddress(current.handle));
    else history.pushState(view, '', missingResultAddress(current.handle));
  }

  async function runLookup(raw: string, params?: URLSearchParams) {
    const parsed = parseLinkedInInput(raw);
    if (parsed.ok === false) {
      trackCampaign("lookup_error", { reason: "invalid_input" });
      setError(parsed.message);
      setResult({ status: "invalid", inputUrl: raw, message: parsed.message });
      return;
    }
    trackCampaign("lookup_start", { source: params ? "link" : "input", mode: atlasEnabled() && !isPreviewHandle(parsed.handle) ? "live" : "demo" });
    forgetLocalRemoval(parsed.handle);
    abortRef.current?.abort();
    const controller = new AbortController();
    let timedOut = false;
    // Normal algorithm latency is 15–20s. Do not abort a valid response at that boundary.
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, ATLAS_LOOKUP_MS);
    abortRef.current = controller;
    setError("");
    setLoading(true);
    setProgress({ step: "profile" });
    setResult(null);
    setReveal(!params);
    if (!params) {
      history.replaceState({ ...history.state, rv: { page: 'entry', scroll: window.scrollY } }, '', location.href);
      journeyActive.current = true;
      setJourney(++journeyNumber.current);
      window.scrollTo({ top: 0, behavior: 'instant' });
    }

    try {
      let next = await lookupRanking(parsed.url, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      if (controller.signal.aborted) return;
      next = applyRemoval(next);
      if (params && next.status === "found") next = applySharedMockState(next, params);
      if (!params && next.status === "found") next = readCampaign(next).result;

      trackCampaign(next.status === "found" ? "lookup_success" : "lookup_error", { result_type: next.status });
      setResult(next);
      if (next.status === 'found') {
        const scene = params ? campaignPage(location.pathname, location.search) : 'result';
        const address = campaignAddress(next, scene === 'entry' ? 'result' : scene);
        const view = { rv: { page: scene, result: next, scroll: 0 } };
        if (params) history.replaceState(view, '', address); else history.pushState(view, '', address);
        setPage(scene); setReturnScroll(params ? 0 : null);
      } else if (next.status === 'not_found') showMissingResult(next, !!params);
      else { journeyActive.current = false; setJourney(null); if (params) { setPage('entry'); history.replaceState({}, '', '/recruiters-view/'); } }

    } catch (err) {
      if ((err as Error).name === "AbortError" && !timedOut) return;
      trackCampaign("lookup_error", { reason: timedOut ? "timeout" : "service_error" });
      journeyActive.current = false; setJourney(null);
      setError(timedOut ? "This is taking longer than expected. Please try again." : "The lookup did not finish. Try the URL again.");
    } finally {
      window.clearTimeout(timeout);
      if (abortRef.current === controller) {
        setLoading(false);
        setProgress(null);
      }
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void runLookup(url);
  }

  function finishJourney() {
    journeyActive.current = false; setReveal(false); setJourney(null);
    if (history.state?.rv) history.replaceState({ ...history.state, rv: { ...history.state.rv, scroll: window.scrollY } }, '', location.href);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.rv-result-title')?.focus({ preventScroll: true }));
  }

  function onRemove(handle: string) {
    trackCampaign("remove_profile");
    if (atlasEnabled() && !isPreviewHandle(handle)) {
      void removeAtlasProfile(`https://www.linkedin.com/in/${handle}`).catch(() => undefined);
    }
    const next = Array.from(new Set([...removed.current, handle]));
    removed.current = next;
    try {
      window.localStorage.setItem(REMOVED_KEY, JSON.stringify(next));
      window.localStorage.removeItem(campaignKey(handle));
      window.localStorage.removeItem(shortlistKey(handle));
      window.localStorage.removeItem(rankingUpdateKey(handle));
      window.localStorage.removeItem(indexNotificationKey(handle));
      window.localStorage.removeItem(CONTACT_KEY);
    } catch { /* This lookup is still cleared in memory. */ }
    window.history.replaceState({}, "", "/recruiters-view/");
    setPage('entry');
    setResult(null); setUrl(''); setError(''); setReveal(false); setReturnScroll(0);
    setToast("Removed from this lookup on this device.");
  }

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const isResult = page !== 'entry' && !loading && result?.status === 'found';
  const isMissing = page === 'result' && !loading && result?.status === 'not_found';
  const isEntry = page === 'entry' && journey === null;
  return (
    <>
      {isEntry && <header className="rv-hero">
        <div className="wrap">
          <p className="eyebrow reveal in">Recruiter's View</p>
          <h1 className="reveal in d1">Every recruiter search creates a ranking. <span className="em">Now you can see yours.</span></h1>
          <p className="lead center reveal in d2">Paste your LinkedIn URL. See how you rank when recruiters search your role and city.</p>
        </div>
      </header>}
      <section className={`rv-stage ${isResult || isMissing || journey !== null ? (page === 'improve' || page === 'opportunities' ? 'is-result is-task' : 'is-result') : 'is-input'} ${journey !== null ? 'has-journey' : ''}`}>
        {journey !== null && <RankingJourney key={journey} result={result?.status === 'found' ? result : null}
          onComplete={finishJourney}
          onCancel={() => { abortRef.current?.abort(); journeyActive.current = false; setJourney(null); setLoading(false); setProgress(null); setReveal(false); }} />}
        {!isEntry && !isResult && !isMissing && journey === null && <div className="rv-route-loading" role="status">{error ? <><p className="rv-error">{error}</p><a href="/recruiters-view/">Try again</a></> : progress ? <LookupProgressView progress={progress} /> : <p>Loading your ranking…</p>}</div>}
        {isEntry && <div className="wrap">
          <form className="rv-composer" onSubmit={onSubmit}>
            <div className="rv-composer-label">
              <Linkedin size={16} strokeWidth={1.8} aria-hidden="true" />
              LinkedIn profile URL
            </div>
            <div className="rv-composer-row">
              <input
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setError("");
                }}
                type="text"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="https://www.linkedin.com/in/your-handle"
                aria-label="LinkedIn profile URL"
                disabled={loading}
              />
              <button className="btn btn-primary" type="submit" disabled={loading || !url.trim()}>
                See your ranking
              </button>
            </div>
          </form>
          <p className="rv-demo-notice">{atlasEnabled()
            ? "Local Atlas demo · Example cards stay preview data. A real LinkedIn URL hits Atlas on :8009 (about 30–90s)."
            : "Interactive preview · Example data, no live LinkedIn checks or email delivery."}</p>
          {error && <p className="rv-error" role="alert">{error}</p>}

          {!loading && (
            <div className="rv-examples">
              <div className="rv-examples-head">
                <h2>{result ? "Try another example" : "Try an example"}</h2>
              </div>
              <div className="rv-example-row">
                {EXAMPLES.map((example) => (
                  <button
                    key={example.id}
                    type="button"
                    className="rv-example"
                    onClick={() => {
                      setUrl(example.url);
                      void runLookup(example.url);
                    }}
                  >
                    <b>{example.label}</b>
                    <span>
                      {example.title} · {example.location}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading && progress && <LookupProgressView progress={progress} />}

        </div>}
        {isMissing && result?.status === 'not_found' && <div className="rv-missing-page"><div className="wrap">
          <a className="rv-return" href="/recruiters-view/"><ArrowLeft size={16} />Back to search</a>
          <MissingResult key={result.handle} result={result} />
        </div></div>}
        <div className={`rv-journey-destination ${journey !== null ? 'is-covered' : ''}`} inert={journey !== null || undefined} aria-hidden={journey !== null || undefined}>
        {isResult && result?.status === 'found' && <FoundResult
          key={result.profile.handle}
          result={result}
          onResultChange={journey !== null ? holdJourneyResult : setResult}
          presentationPending={journey !== null}
          reveal={journey !== null ? false : reveal}
          page={page}
          onNavigate={changePage}
          onRemove={() => onRemove(result.profile.handle)}
        />}
        </div>
      </section>

      {isEntry && <HowItWorks />}
      {toast && <div className="rv-toast" role="status">{toast}</div>}
    </>
  );
}

function LookupProgressView({ progress }: { progress: LookupProgress }) {
  const label =
    progress.step === "profile"
      ? "Reading the public profile"
      : progress.step === "query"
        ? "Building the recruiter search"
        : "Ranking in Recruiter Search";

  return (
    <div className="rv-progress" aria-live="polite">
      <div className="rv-progress-row">
        <span className="rv-balls" />
        {label}
      </div>
      <div className="rv-chips">
        {progress.query ? (
          <>
            <span className="rv-chip">{progress.query.jobTitle}</span>
            <span className="rv-chip">{progress.query.location}</span>
            <span className="rv-chip">{progress.query.seniorityBand}</span>
          </>
        ) : (
          <>
            <span className="rv-chip is-wait">Title</span>
            <span className="rv-chip is-wait">Location</span>
            <span className="rv-chip is-wait">Years</span>
          </>
        )}
      </div>
    </div>
  );
}

function FoundResult({ result: initialResult, onResultChange, reveal, onRemove, page, onNavigate, presentationPending = false }: {
  result: RankLookupFound; onResultChange: (result: RankLookupFound) => void; reveal: boolean; onRemove: () => void;
  page: ResultPage; onNavigate: (page: ResultPage, result: RankLookupFound) => void;
  presentationPending?: boolean;
}) {
  const { state, email, saveEmail, ready } = useCampaign(initialResult, onResultChange);
  // Finish the reveal before applying a saved ranking snapshot.
  const result = presentationPending ? initialResult : state.result;
  const next = (destination: ResultPage) => onNavigate(destination, result);
  useEffect(() => {
    if (ready) history.replaceState({ ...history.state, rv: { ...history.state?.rv, page, result } }, '', location.href);
  }, [result, ready, page]);
  if (page === 'improve' || page === 'opportunities') return <div className="rv-task-page">
    <div className="wrap">
      <a className="rv-return" href={campaignAddress(result, 'result')} onClick={event => { if (!event.metaKey && !event.ctrlKey) { event.preventDefault(); next('result'); } }}><ArrowLeft size={16} />Back to ranking</a>
      <div className="rv-task-layout">
        <aside className="rv-task-sidebar" aria-label="Your current ranking">
          <RankingCard result={result} />
          <div className="rv-task-mobile-identity">{result.profile.avatar && <img src={result.profile.avatar} alt="" />}<div><b>{result.profile.fullName}</b><p>{scopeLabel(result.query)}</p></div><strong>{result.ranking.kind === 'exact' ? `#${result.ranking.rank}` : result.ranking.label}</strong></div>
          <p className="rv-sidebar-status"><span />Your current ranking</p>
        </aside>
        <div className="rv-task-content"><header><p className="rv-rank-kicker">{page === 'opportunities' ? 'YOUR NEXT OPPORTUNITY' : 'IMPROVE YOUR RANKING'}</p><h1 className="rv-task-heading" tabIndex={-1}>{page === 'opportunities' ? 'Jobs matched to your experience' : 'Make your experience easier to find.'}</h1>{page === 'improve' && <p>Make your changes on LinkedIn, then leave your email below.</p>}</header>
          {page === 'opportunities' ? showsJobMatches(result) ? <JobMatches result={result} email={email} saveEmail={saveEmail} /> : <article className="rv-card"><p>Job matches are available for profiles in the top 1% of their comparison group.</p><a className="rv-return" href={campaignAddress(result, 'result')} onClick={event => { if (!event.metaKey && !event.ctrlKey) { event.preventDefault(); next('result'); } }}>Back to ranking <ArrowLeft size={16} /></a></article>
            : <ProfileImprovements key={result.profile.handle} result={result} email={email} saveEmail={saveEmail} />}
        </div>
      </div>
    </div>
  </div>;
  return <div className="rv-result">
    <div className="rv-result-hero"><div className="wrap">
      <h1 className="rv-sr-only rv-result-title" tabIndex={-1}>Your recruiter search ranking</h1>
      <ResultStage result={result} ready={ready} reveal={reveal} presenting={presentationPending} updated={!presentationPending && state.status === 'updated'} onImprove={() => next('improve')} onExplore={() => next('opportunities')} />
    </div></div>
    <div className="rv-below">
      <div className="rv-result-links">
        <a href="/recruiters-view/">Check another profile</a>
        <button type="button" onClick={onRemove}>Remove me</button>
      </div>
    </div>
  </div>;
}

function MissingResult({ result: { inputUrl, suggestions, handle } }: { result: RankLookupNotFound }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  return (
    <article className="rv-card rv-miss-card">
      <p className="rv-rank-kicker">Not in the index yet</p>
      <h1 ref={heading} tabIndex={-1} className="rv-missing-title">Your profile is not in the recruiter search index yet.</h1>
      <p className="rv-missing-url">{inputUrl}</p>
      <ul>
        {suggestions.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <IndexNotification key={handle} handle={handle} />
    </article>
  );
}

function HowItWorks() {
  return (
    <section className="rv-steps">
      <div className="wrap">
        <div className="rv-boards-head">
          <h2>How it works</h2>
        </div>
        <div className="rv-step-grid">
          <article className="rv-step">
            <div className="n">01</div>
            <h3>Paste your LinkedIn URL</h3>
            <p>One box. That is enough to look you up.</p>
          </article>
          <article className="rv-step">
            <div className="n">02</div>
            <h3>We build the search</h3>
            <p>Role, city, and seniority come from your profile.</p>
          </article>
          <article className="rv-step">
            <div className="n">03</div>
            <h3>See your rank</h3>
            <p>See your ranking, improve your profile, and return for your next update.</p>
          </article>
        </div>
      </div>
    </section>
  );
}
