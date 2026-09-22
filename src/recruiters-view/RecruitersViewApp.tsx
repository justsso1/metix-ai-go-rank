import { trackCampaign, trackCampaignPage } from "./analytics";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, Linkedin } from "lucide-react";
import ResultStage, { RankingCard } from "./ResultStage";
import RankingJourney from "./RankingJourney";
import { createPortal, flushSync } from "react-dom";
import {
  campaignAddress,
  campaignPage,
  missingResultAddress,
  taskIdFromSharePath,
  viewStateKey,
  type CampaignPage,
  type ResultPage,
} from "./routes";
import { ProfileImprovements, useCampaign } from "./CampaignPanels";
import JobMatches from "./JobMatches";
import { shortlistKey } from "./job-shortlist";
import { rankingUpdateKey } from "./ranking-update";
import {
  applySharedMockState,
  campaignKey,
  CONTACT_KEY,
  readCampaign,
  scopeLabel,
  showsJobMatches,
} from "./campaign";
import { shareMetadata } from "./share";
import { lookupPeerRankTask, removePeerRankProfile } from "./peer-rank-api";
import {
  GENERIC_SUGGESTIONS,
  isPreviewHandle,
  lookupRanking,
  parseLinkedInInput,
  upgradeMockSnapshot,
} from "./mock";
import type {
  LookupProgress,
  RankLookupResult,
  RankLookupFound,
  RankLookupNotFound,
  RankLookupUnavailable,
} from "./types";

const REMOVED_KEY = "metix-recruiters-view-removed";
const REMOVE_REDIRECT_DELAY_MS = 1800;
const holdJourneyResult = () => {};

export default function RecruitersViewApp({
  initialResult,
  initialPage = initialResult ? "result" : "entry",
}: {
  initialResult?: RankLookupFound;
  initialPage?: CampaignPage;
}) {
  const [page, setPage] = useState<CampaignPage>(initialPage);
  const [returnScroll, setReturnScroll] = useState<number | null>(null);
  const [url, setUrl] = useState(initialResult?.inputUrl ?? "");
  const [error, setError] = useState("");
  const [retryTaskId, setRetryTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<LookupProgress | null>(null);
  const [result, setResult] = useState<RankLookupResult | null>(
    initialResult ?? null,
  );
  const removed = useRef<string[]>([]);
  const [toast, setToast] = useState<{
    message: string;
    kind: "success" | "error";
  } | null>(null);
  const [removing, setRemoving] = useState(false);
  const removeInFlight = useRef(false);
  const removeRequest = useRef<AbortController | null>(null);
  const removeRedirectTimer = useRef<number | null>(null);
  const [reveal, setReveal] = useState(false);
  const [journey, setJourney] = useState<number | null>(null);
  const journeyNumber = useRef(0);
  const journeyActive = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const stored = JSON.parse(
        window.localStorage.getItem(REMOVED_KEY) || "[]",
      );
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
    const linkedInUrl = params.get("linkedin_url")?.trim();
    const taskId =
      params.get("task_id") ??
      params.get("taskId") ??
      taskIdFromSharePath(location.pathname);
    const restore = history.state?.rv;
    if (taskId !== null) {
      if (linkedInUrl) setUrl(linkedInUrl);
      setPage("result");
      void runTaskLookup(taskId);
    } else if (linkedInUrl) {
      setUrl(linkedInUrl);
    } else if (restore?.result && scene !== "entry") {
      const restored = applyRemoval(restore.result);
      if (
        restored.status === "not_found" &&
        restored.handle &&
        !isPreviewHandle(restored.handle)
      ) {
        const nextUrl =
          restored.inputUrl || `https://www.linkedin.com/in/${restored.handle}`;
        setUrl(nextUrl);
        void runLookup(nextUrl, params);
      } else if (restored.status === "not_found")
        showUnavailableResult(restored, true, restore.scroll ?? 0);
      else if (restored.status === "invalid") showInlineError(restored.message);
      else {
        setResult(restored);
        setReturnScroll(restore.scroll ?? 0);
      }
    } else if (params.get("u")) {
      const nextUrl = `https://www.linkedin.com/in/${params.get("u")}`;
      setUrl(nextUrl);
      void runLookup(nextUrl, params);
    } else if (initialResult) {
      const restored = applyRemoval(initialResult);
      if (restored.status === "not_found")
        showUnavailableResult(restored, true);
      else
        history.replaceState(
          {
            ...history.state,
            rv: { page: scene, result: initialResult, scroll: 0 },
          },
          "",
          location.href,
        );
    } else if (scene !== "entry") {
      setPage("entry");
      history.replaceState({}, "", "/recruiters-view/");
    }
    const previousRestoration = history.scrollRestoration;
    history.scrollRestoration = "manual";
    const pop = (event: PopStateEvent) => {
      removeRequest.current?.abort();
      if (removeRedirectTimer.current !== null)
        window.clearTimeout(removeRedirectTimer.current);
      removeRedirectTimer.current = null;
      removeInFlight.current = false;
      setRemoving(false);
      setToast(null);
      abortRef.current?.abort();
      journeyActive.current = false;
      setLoading(false);
      setReveal(false);
      setJourney(null);
      setError("");
      setRetryTaskId(null);
      const destination = campaignPage(location.pathname, location.search);
      setPage(destination);
      if (destination === "entry") {
        setResult(null);
        setReturnScroll(event.state?.rv?.scroll ?? 0);
      } else if (event.state?.rv?.result) {
        const restored = applyRemoval(event.state.rv.result);
        const query = new URLSearchParams(location.search);
        if (
          restored.status === "not_found" &&
          restored.handle &&
          !isPreviewHandle(restored.handle)
        ) {
          const nextUrl =
            restored.inputUrl ||
            `https://www.linkedin.com/in/${restored.handle}`;
          setUrl(nextUrl);
          void runLookup(nextUrl, query);
        } else if (restored.status === "not_found")
          showUnavailableResult(restored, true, event.state.rv.scroll ?? 0);
        else if (restored.status === "invalid")
          showInlineError(restored.message);
        else {
          setResult(restored);
          setReturnScroll(event.state.rv.scroll ?? 0);
        }
      } else {
        const query = new URLSearchParams(location.search);
        const linkedTaskId =
          query.get("task_id") ??
          query.get("taskId") ??
          taskIdFromSharePath(location.pathname);
        if (linkedTaskId !== null) {
          void runTaskLookup(linkedTaskId);
          return;
        }
        const handle =
          query.get("u") ?? location.pathname.split("/").filter(Boolean).at(-1);
        if (handle)
          void runLookup(`https://www.linkedin.com/in/${handle}`, query);
      }
    };
    let scrollFrame = 0;
    const saveScroll = () => {
      if (journeyActive.current) return;
      cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(() => {
        if (history.state?.rv)
          history.replaceState(
            {
              ...history.state,
              rv: { ...history.state.rv, scroll: window.scrollY },
            },
            "",
            location.href,
          );
      });
    };
    window.addEventListener("scroll", saveScroll, { passive: true });
    window.addEventListener("popstate", pop);
    return () => {
      cancelAnimationFrame(scrollFrame);
      window.removeEventListener("scroll", saveScroll);
      window.removeEventListener("popstate", pop);
      history.scrollRestoration = previousRestoration;
    };
  }, []);

  useEffect(() => {
    if (returnScroll === null || loading) return;
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: returnScroll, behavior: "instant" });
      setReturnScroll(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [page, result, loading, returnScroll]);

  useEffect(() => {
    if (loading) return;
    // A deep link may still be on the entry scene during its first React render.
    // The SDK has already attributed that direct load to the result page.
    if (
      page === "entry" &&
      campaignPage(location.pathname, location.search) === "result"
    )
      return;
    const scene = page === "entry" ? "root" : page;
    trackCampaignPage(scene);
    if (page === "result" && result?.status === "found" && journey === null) {
      trackCampaign("result_view", {
        mode: result.profileVersion === "live" ? "live" : "demo",
      });
    }
  }, [
    page,
    loading,
    journey,
    result?.status === "found"
      ? `${result.profile.handle}:${result.revision}`
      : "",
  ]);

  function changePage(next: ResultPage, current: RankLookupFound) {
    trackCampaign("navigate", { destination: next });
    const positions = { result: 0, improve: 0, opportunities: 0 };
    try {
      Object.assign(
        positions,
        JSON.parse(
          sessionStorage.getItem(viewStateKey(current.profile.handle)) || "{}",
        ),
      );
    } catch {
      /* Optional view memory. */
    }
    if (page !== "entry") positions[page] = window.scrollY;
    try {
      sessionStorage.setItem(
        viewStateKey(current.profile.handle),
        JSON.stringify(positions),
      );
    } catch {
      /* Optional view memory. */
    }
    history.replaceState(
      {
        ...history.state,
        rv: { page, result: current, scroll: window.scrollY },
      },
      "",
      location.href,
    );
    const enter = () => {
      history.pushState(
        { rv: { page: next, result: current, scroll: positions[next] } },
        "",
        campaignAddress(current, next),
      );
      flushSync(() => {
        setReveal(false);
        setPage(next);
      });
      window.scrollTo({ top: positions[next], behavior: "instant" });
      document
        .querySelector<HTMLElement>(
          next !== "result" ? ".rv-task-heading" : ".rv-result-title",
        )
        ?.focus({ preventScroll: true });
    };
    const transition = (
      document as Document & {
        startViewTransition?: (callback: () => void) => unknown;
      }
    ).startViewTransition;
    if (
      transition &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
      window.innerWidth >= 960
    )
      transition.call(document, enter);
    else enter();
  }

  // Keep the browser's metadata aligned after client-side navigation.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (
      loading ||
      (!result &&
        (params.has("task_id") ||
          params.has("taskId") ||
          taskIdFromSharePath(window.location.pathname) !== null))
    )
      return;
    const metadata = shareMetadata();
    if (result?.status === "found" && result.ogImageUrl) {
      const name = result.profile.fullName.trim();
      metadata.title = name
        ? `${name}'s Recruiter Search ranking · Metix AI`
        : "Recruiter Search ranking · Metix AI";
      if (result.ranking.kind === "exact")
        metadata.description = `${name || "This candidate"} ranks #${result.ranking.rank} among ${result.ranking.poolSize} peers in a recruiter search.`;
    }
    const ogImage =
      result?.status === "found"
        ? result.ogImageUrl || metadata.image
        : metadata.image;
    const ogImageWidth =
      result?.status === "found"
        ? result.ogImageWidth || metadata.imageWidth
        : metadata.imageWidth;
    const ogImageHeight =
      result?.status === "found"
        ? result.ogImageHeight || metadata.imageHeight
        : metadata.imageHeight;
    document.title =
      result?.status === "not_found"
        ? "Profile not indexed · Metix AI"
        : result?.status === "unavailable"
          ? "Ranking unavailable · Metix AI"
          : (page === "improve" || page === "opportunities") &&
              result?.status === "found"
            ? `${page === "improve" ? "Improve your ranking" : "Jobs matched to your experience"} · ${result.profile.fullName} · Metix AI`
            : metadata.title;
    const values: Record<string, string> = {
      "og:title": metadata.title,
      "og:description": metadata.description,
      "og:url": window.location.href,
      "og:image": ogImage.startsWith("/")
        ? `${window.location.origin}${ogImage}`
        : ogImage,
      "og:image:alt": metadata.imageAlt,
      "og:image:width": String(ogImageWidth),
      "og:image:height": String(ogImageHeight),
      "twitter:title": metadata.title,
      "twitter:description": metadata.description,
      "twitter:image": ogImage.startsWith("/")
        ? `${window.location.origin}${ogImage}`
        : ogImage,
      "twitter:image:alt": metadata.imageAlt,
    };
    for (const [key, content] of Object.entries(values)) {
      document
        .querySelector<HTMLMetaElement>(
          `meta[property="${key}"], meta[name="${key}"]`,
        )
        ?.setAttribute("content", content);
    }
    document
      .querySelector<HTMLLinkElement>('link[rel="canonical"]')
      ?.setAttribute("href", window.location.href);
  }, [loading, result, page]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      removeRequest.current?.abort();
      if (removeRedirectTimer.current !== null)
        window.clearTimeout(removeRedirectTimer.current);
    },
    [],
  );

  function forgetLocalRemoval(handle: string) {
    const key = handle.toLowerCase();
    const next = removed.current.filter((item) => item.toLowerCase() !== key);
    removed.current = next;
    try {
      window.localStorage.setItem(REMOVED_KEY, JSON.stringify(next));
    } catch {
      /* Lookup still continues. */
    }
  }

  function applyRemoval(current: RankLookupResult): RankLookupResult {
    if (current.status === "found") current = upgradeMockSnapshot(current);
    if (current.status !== "found") return current;
    const key = current.profile.handle.toLowerCase();
    if (!removed.current.some((item) => item.toLowerCase() === key))
      return current;
    return {
      status: "not_found",
      inputUrl: current.inputUrl,
      handle: current.profile.handle,
      suggestions: GENERIC_SUGGESTIONS,
    };
  }

  function showUnavailableResult(
    current: RankLookupNotFound | RankLookupUnavailable,
    replace = false,
    scroll = 0,
    address?: string,
  ) {
    journeyActive.current = false;
    setJourney(null);
    setReveal(false);
    setResult(current);
    setPage("result");
    setReturnScroll(scroll);
    setRetryTaskId(null);
    const view = { rv: { page: "result", result: current, scroll } };
    const destination =
      address ??
      (current.status === "not_found"
        ? missingResultAddress(current.handle)
        : location.pathname + location.search);
    if (replace) history.replaceState(view, "", destination);
    else history.pushState(view, "", destination);
  }

  function showInlineError(message: string, taskId?: string) {
    journeyActive.current = false;
    setJourney(null);
    setReveal(false);
    setResult(null);
    setPage("entry");
    setReturnScroll(0);
    setError(message);
    setRetryTaskId(taskId ?? null);
    if (location.pathname !== "/recruiters-view/" || location.search)
      history.replaceState({}, "", "/recruiters-view/");
  }

  async function runLookup(raw: string, params?: URLSearchParams) {
    setRetryTaskId(null);
    const parsed = parseLinkedInInput(raw);
    if (parsed.ok === false) {
      trackCampaign("lookup_error", { reason: "invalid_input" });
      setError(parsed.message);
      setResult({ status: "invalid", inputUrl: raw, message: parsed.message });
      return;
    }
    trackCampaign("lookup_start", {
      source: params ? "link" : "input",
      mode: "live",
    });
    forgetLocalRemoval(parsed.handle);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError("");
    setLoading(true);
    setProgress({ step: "profile" });
    setResult(null);
    setReveal(!params);
    if (!params) {
      history.replaceState(
        { ...history.state, rv: { page: "entry", scroll: window.scrollY } },
        "",
        location.href,
      );
      journeyActive.current = true;
      setJourney(++journeyNumber.current);
      window.scrollTo({ top: 0, behavior: "instant" });
    }

    try {
      let next = await lookupRanking(parsed.url, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      if (controller.signal.aborted) return;
      next = applyRemoval(next);
      if (params && next.status === "found")
        next = applySharedMockState(next, params);
      if (!params && next.status === "found") next = readCampaign(next).result;

      trackCampaign(
        next.status === "found" ? "lookup_success" : "lookup_error",
        { result_type: next.status },
      );
      if (next.status === "found") {
        setResult(next);
        const scene = params
          ? campaignPage(location.pathname, location.search)
          : "result";
        const address = campaignAddress(
          next,
          scene === "entry" ? "result" : scene,
        );
        const view = { rv: { page: scene, result: next, scroll: 0 } };
        if (params) history.replaceState(view, "", address);
        else history.pushState(view, "", address);
        setPage(scene);
        setReturnScroll(params ? 0 : null);
      } else if (next.status === "not_found" || next.status === "unavailable") {
        showUnavailableResult(
          next,
          !!params,
          0,
          missingResultAddress(parsed.handle),
        );
      } else showInlineError(next.message);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      trackCampaign("lookup_error", { reason: "service_error" });
      showInlineError(
        (err as Error).message ||
          "The lookup did not finish. Try the URL again.",
      );
    } finally {
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

  async function runTaskLookup(taskId: string) {
    trackCampaign("lookup_start", { source: "link", mode: "live" });
    setRetryTaskId(null);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError("");
    setLoading(true);
    setProgress({ step: "profile" });
    setResult(null);
    setReveal(false);
    journeyActive.current = false;
    setJourney(null);

    try {
      let next = await lookupPeerRankTask(taskId, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      if (controller.signal.aborted) return;
      next = applyRemoval(next);
      trackCampaign(
        next.status === "found" ? "lookup_success" : "lookup_error",
        { result_type: next.status },
      );
      if (next.status === "found") {
        setResult(next);
        const scene = campaignPage(location.pathname, location.search);
        const destination = scene === "entry" ? "result" : scene;
        history.replaceState(
          { rv: { page: destination, result: next, scroll: 0 } },
          "",
          campaignAddress(next, destination),
        );
        setPage(destination);
        setReturnScroll(0);
      } else if (next.status === "not_found" || next.status === "unavailable")
        showUnavailableResult(next, true);
      else showInlineError(next.message, taskId);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      trackCampaign("lookup_error", { reason: "service_error" });
      showInlineError(
        (err as Error).message ||
          "The lookup did not finish. Try the link again.",
        taskId,
      );
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
        setProgress(null);
      }
    }
  }

  function finishJourney() {
    journeyActive.current = false;
    setReveal(false);
    setJourney(null);
    if (history.state?.rv)
      history.replaceState(
        {
          ...history.state,
          rv: { ...history.state.rv, scroll: window.scrollY },
        },
        "",
        location.href,
      );
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(".rv-result-title")
        ?.focus({ preventScroll: true }),
    );
  }

  async function onRemove(handle: string, linkedinUrl: string) {
    if (removeInFlight.current) return;
    removeInFlight.current = true;
    setRemoving(true);
    setToast(null);
    trackCampaign("remove_profile");
    const controller = new AbortController();
    removeRequest.current = controller;
    let outcome: { message: string; kind: "success" | "error" };
    try {
      await removePeerRankProfile(linkedinUrl, controller.signal);
      if (controller.signal.aborted) return;
      const next = Array.from(new Set([...removed.current, handle]));
      removed.current = next;
      try {
        window.localStorage.setItem(REMOVED_KEY, JSON.stringify(next));
        window.localStorage.removeItem(campaignKey(handle));
        window.localStorage.removeItem(shortlistKey(handle));
        window.localStorage.removeItem(rankingUpdateKey(handle));
        window.localStorage.removeItem(CONTACT_KEY);
      } catch {
        /* This lookup is still cleared in memory. */
      }
      outcome = { message: "Your profile has been removed.", kind: "success" };
    } catch (err) {
      if (controller.signal.aborted) return;
      outcome = {
        message: (err as Error).message || "Could not remove your profile.",
        kind: "error",
      };
    } finally {
      if (removeRequest.current === controller) removeRequest.current = null;
    }
    setToast(outcome);
    removeRedirectTimer.current = window.setTimeout(() => {
      removeRedirectTimer.current = null;
      window.history.replaceState({}, "", "/recruiters-view/");
      setPage("entry");
      setResult(null);
      setUrl("");
      setError("");
      setReveal(false);
      setReturnScroll(0);
      removeInFlight.current = false;
      setRemoving(false);
    }, REMOVE_REDIRECT_DELAY_MS);
  }

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const isResult = page !== "entry" && !loading && result?.status === "found";
  const isUnavailable =
    page === "result" &&
    !loading &&
    (result?.status === "not_found" || result?.status === "unavailable");
  const isEntry = page === "entry" && journey === null;
  return (
    <>
      {isEntry && (
        <header className="rv-hero">
          <div className="wrap">
            <p className="eyebrow reveal in">Recruiter's View</p>
            <h1 className="reveal in d1">
              Every recruiter search creates a ranking.{" "}
              <span className="em">Now you can see yours.</span>
            </h1>
            <p className="lead center reveal in d2">
              Paste your LinkedIn URL. See how you rank when recruiters search
              your role and city.
            </p>
          </div>
        </header>
      )}
      <section
        className={`rv-stage ${isResult || isUnavailable || journey !== null ? (page === "improve" || page === "opportunities" ? "is-result is-task" : "is-result") : "is-input"} ${journey !== null ? "has-journey" : ""}`}
      >
        {journey !== null && (
          <RankingJourney
            key={journey}
            result={result?.status === "found" ? result : null}
            onComplete={finishJourney}
            onCancel={() => {
              abortRef.current?.abort();
              journeyActive.current = false;
              setJourney(null);
              setLoading(false);
              setProgress(null);
              setReveal(false);
            }}
          />
        )}
        {!isEntry && !isResult && !isUnavailable && journey === null && (
          <div className="rv-route-loading" role="status">
            {progress ? (
              <LookupProgressView progress={progress} />
            ) : (
              <p>Loading your ranking…</p>
            )}
          </div>
        )}
        {isEntry && (
          <div className="wrap">
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
                    setRetryTaskId(null);
                  }}
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="https://www.linkedin.com/in/your-handle"
                  aria-label="LinkedIn profile URL"
                  disabled={loading}
                />
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={loading || !url.trim()}
                  data-track="lookup_submit"
                  data-track-location="entry"
                >
                  See your ranking
                </button>
              </div>
            </form>
            <p className="rv-demo-notice">
              See your ranking sends this LinkedIn URL to the ranking service.
            </p>
            {error && (
              <p className="rv-error" role="alert">
                {error}
              </p>
            )}
            {error && retryTaskId && (
              <button
                className="rv-lookup-retry"
                type="button"
                onClick={() => void runTaskLookup(retryTaskId)}
              >
                Try again
              </button>
            )}
            {loading && progress && <LookupProgressView progress={progress} />}
          </div>
        )}
        {isUnavailable &&
          result &&
          (result.status === "not_found" ||
            result.status === "unavailable") && (
            <div className="rv-missing-page">
              <div className="wrap">
                <a
                  className="rv-return"
                  href="/recruiters-view/"
                  data-track="return_to_search"
                  data-track-location={result.status}
                >
                  <ArrowLeft size={16} />
                  Back to search
                </a>
                <MissingResult result={result} />
              </div>
            </div>
          )}
        <div
          className={`rv-journey-destination ${journey !== null ? "is-covered" : ""}`}
          inert={journey !== null || undefined}
          aria-hidden={journey !== null || undefined}
        >
          {isResult && result?.status === "found" && (
            <FoundResult
              key={result.profile.handle}
              result={result}
              onResultChange={journey !== null ? holdJourneyResult : setResult}
              presentationPending={journey !== null}
              reveal={journey !== null ? false : reveal}
              page={page}
              onNavigate={changePage}
              removing={removing}
              onRemove={() => onRemove(result.profile.handle, result.inputUrl)}
            />
          )}
        </div>
      </section>

      {isEntry && <HowItWorks />}
      {toast &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className={`rv-toast is-${toast.kind}`}
            role={toast.kind === "error" ? "alert" : "status"}
          >
            {toast.message}
          </div>,
          document.body,
        )}
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

function FoundResult({
  result: initialResult,
  onResultChange,
  reveal,
  onRemove,
  page,
  onNavigate,
  removing,
  presentationPending = false,
}: {
  result: RankLookupFound;
  onResultChange: (result: RankLookupFound) => void;
  reveal: boolean;
  onRemove: () => void;
  page: ResultPage;
  onNavigate: (page: ResultPage, result: RankLookupFound) => void;
  removing: boolean;
  presentationPending?: boolean;
}) {
  const { state, email, saveEmail, ready } = useCampaign(
    initialResult,
    onResultChange,
  );
  // Finish the reveal before applying a saved ranking snapshot.
  const result = presentationPending ? initialResult : state.result;
  const next = (destination: ResultPage) => onNavigate(destination, result);
  useEffect(() => {
    if (ready)
      history.replaceState(
        { ...history.state, rv: { ...history.state?.rv, page, result } },
        "",
        location.href,
      );
  }, [result, ready, page]);
  if (page === "improve" || page === "opportunities")
    return (
      <div className="rv-task-page">
        <div className="wrap">
          <a
            className="rv-return"
            href={campaignAddress(result, "result")}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey)
                trackCampaign("navigate", { destination: "result" });
              else {
                event.preventDefault();
                next("result");
              }
            }}
          >
            <ArrowLeft size={16} />
            Back to ranking
          </a>
          <div className="rv-task-layout">
            <aside
              className="rv-task-sidebar"
              aria-label="Your current ranking"
            >
              <RankingCard result={result} />
              <div className="rv-task-mobile-identity">
                {result.profile.avatar && (
                  <img src={result.profile.avatar} alt="" />
                )}
                <div>
                  <b>{result.profile.fullName}</b>
                  <p>{scopeLabel(result.query)}</p>
                </div>
                <strong>
                  {result.ranking.kind === "exact"
                    ? `#${result.ranking.rank}`
                    : result.ranking.label}
                </strong>
              </div>
              <p className="rv-sidebar-status">
                <span />
                Your current ranking
              </p>
            </aside>
            <div className="rv-task-content">
              <header>
                <p className="rv-rank-kicker">
                  {page === "opportunities"
                    ? "YOUR NEXT OPPORTUNITY"
                    : "IMPROVE YOUR RANKING"}
                </p>
                <h1 className="rv-task-heading" tabIndex={-1}>
                  {page === "opportunities"
                    ? "Jobs matched to your experience"
                    : "Make your experience easier to find."}
                </h1>
                {page === "improve" && (
                  <p>
                    Make your changes on LinkedIn, then leave your email below.
                  </p>
                )}
              </header>
              {page === "opportunities" ? (
                showsJobMatches(result) ? (
                  <JobMatches
                    result={result}
                    email={email}
                    saveEmail={saveEmail}
                  />
                ) : (
                  <article className="rv-card">
                    <p>
                      {result.profileVersion === "live"
                        ? "No job matches came back with this ranking."
                        : "Job matches are available for profiles in the top 1% of their comparison group."}
                    </p>
                    <a
                      className="rv-return"
                      href={campaignAddress(result, "result")}
                      onClick={(event) => {
                        if (event.metaKey || event.ctrlKey)
                          trackCampaign("navigate", { destination: "result" });
                        else {
                          event.preventDefault();
                          next("result");
                        }
                      }}
                    >
                      Back to ranking <ArrowLeft size={16} />
                    </a>
                  </article>
                )
              ) : (
                <ProfileImprovements
                  key={result.profile.handle}
                  result={result}
                  email={email}
                  saveEmail={saveEmail}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  return (
    <div className="rv-result">
      <div className="rv-result-hero">
        <div className="wrap">
          <h1 className="rv-sr-only rv-result-title" tabIndex={-1}>
            Your recruiter search ranking
          </h1>
          <ResultStage
            result={result}
            ready={ready}
            reveal={reveal}
            presenting={presentationPending}
            updated={!presentationPending && state.status === "updated"}
            onImprove={() => next("improve")}
            onExplore={() => next("opportunities")}
          />
        </div>
      </div>
      <div className="rv-below">
        <div className="rv-result-links">
          <a
            href="/recruiters-view/"
            data-track="return_to_search"
            data-track-location="result"
          >
            Check another profile
          </a>
          {result.inputUrl ? (
            <button type="button" disabled={removing} onClick={onRemove}>
              {removing ? "Removing…" : "Remove me"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MissingResult({
  result,
}: {
  result: RankLookupNotFound | RankLookupUnavailable;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  const notFound = result.status === "not_found";
  return (
    <article className="rv-card rv-miss-card">
      <p className="rv-rank-kicker">
        {notFound ? "Not in the index yet" : "Ranking unavailable"}
      </p>
      <h1 ref={heading} tabIndex={-1} className="rv-missing-title">
        Your profile is not in the recruiter search index yet.
      </h1>
      {result.inputUrl && <p className="rv-missing-url">{result.inputUrl}</p>}
      {!notFound && (
        <p className="rv-missing-message" role="alert">
          {result.message}
        </p>
      )}
      <ul>
        {GENERIC_SUGGESTIONS.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
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
            <p>
              See your ranking, improve your profile, and return for your next
              update.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
