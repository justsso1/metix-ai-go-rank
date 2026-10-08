import { completeTopThree } from "./leaderboard.ts";
import type {
  LookupProgress,
  MatchedJob,
  RankLookupFound,
  RankLookupResult,
  RankedPerson,
  SearchQuery,
} from "./types";

type PeerRankCard = {
  rank?: number;
  name?: string;
  avatar?: string;
  title?: string;
  company?: string;
};

type PeerRankAdviceItem = { title?: string; description?: string };

type PeerRankJob = {
  id?: string;
  title?: string;
  company?: string;
  location?: string;
  workplace?: string;
  url?: string;
};

type PeerRankFirst = {
  rank?: number;
  total?: number;
  percent?: number;
  recruiter_page?: number;
  reply_score?: number;
};

export type PeerRankData = {
  rank: number;
  total: number;
  percent?: number;
  reply_score?: number;
  recruiter_page?: number;
  title?: string;
  location?: string;
  summary?: string;
  highlights?: { skills?: string[]; points?: string[] };
  cohort?: { label?: string; geo?: string };
  self?: PeerRankCard;
  top?: PeerRankCard[];
  ahead?: PeerRankCard[];
  advice?: { personalized?: boolean; note?: string; items?: PeerRankAdviceItem[] };
  first?: PeerRankFirst | null;
  jobs?: PeerRankJob[];
  og_image_url?: string;
  og_image_width?: number;
  og_image_height?: number;
};

export function peerRankApiBase(): string {
  return "/bapi";
}

function intYear(raw: string): number {
  return Math.round(Number(raw));
}

function yearsFromLabel(label: string): number {
  const plus = label.match(/(\d+(?:\.\d+)?)\+\s*yr/i);
  if (plus) return intYear(plus[1]);
  const range = label.match(/(\d+(?:\.\d+)?)\s*[–-]\s*\d+(?:\.\d+)?\s*yr/i);
  if (range) return intYear(range[1]);
  return 0;
}

function yoeBand(label: string): string {
  const plus = label.match(/(\d+(?:\.\d+)?)\+\s*yr/i);
  if (plus) return `${intYear(plus[1])}+ yr`;
  const range = label.match(/(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*yr/i);
  if (!range) return "";
  const a = intYear(range[1]);
  const b = intYear(range[2]);
  return a === b ? `${a} yr` : `${a}–${b} yr`;
}

function asPerson(card: PeerRankCard, id: string): RankedPerson {
  const title = String(card.title || "").trim();
  const company = String(card.company || "").trim();
  const fullName = String(card.name || "Peer").trim() || "Peer";
  return {
    id,
    rank: Number(card.rank) || 0,
    fullName,
    headline: [title, company].filter(Boolean).join(" at "),
    title,
    company,
    location: "",
    skills: [],
    yearsExperience: 0,
    avatar: String(card.avatar || "").startsWith("http") ? String(card.avatar) : undefined,
  };
}

const WORK_STYLE: Record<string, string> = {
  remote: "Remote",
  onsite: "On-site",
  hybrid: "Hybrid",
};

function asJob(row: PeerRankJob, fallbackId: string): MatchedJob | null {
  const title = String(row.title || "").trim();
  const apply = String(row.url || "").trim();
  if (!title || !/^https?:\/\//i.test(apply)) return null;
  const work = String(row.workplace || "").toLowerCase();
  return {
    id: String(row.id || fallbackId),
    title,
    company: String(row.company || "").trim(),
    location: String(row.location || "").trim(),
    workStyle: WORK_STYLE[work] || "On-site",
    url: apply,
  };
}

export function rankFromPeerRank(url: string, handle: string, data: PeerRankData, taskId?: string): RankLookupFound {
  const title = String(data.title || data.self?.title || "Professional").trim() || "Professional";
  const location = String(data.location || data.cohort?.geo || "").trim();
  const label = String(data.cohort?.label || "").trim();
  const query: SearchQuery = {
    jobTitle: title,
    location,
    seniorityBand: yoeBand(label),
    companyType: "",
  };
  const skills = (data.highlights?.skills || []).map(String).filter(Boolean);
  const selfName = String(data.self?.name || "").trim() || handle;
  const selfTitle = String(data.self?.title || title).trim();
  const selfCompany = String(data.self?.company || "").trim();
  const profile = {
    handle,
    fullName: selfName,
    headline: [selfTitle, selfCompany].filter(Boolean).join(" at ") || title,
    title: selfTitle,
    company: selfCompany,
    location,
    metro: location,
    jobFamily: title,
    yearsExperience: yearsFromLabel(label),
    skills,
    avatar: String(data.self?.avatar || "").startsWith("http") ? String(data.self?.avatar) : undefined,
  };
  const strongest = (data.top || []).map((card, i) => asPerson(card, `${handle}-top-${card.rank ?? i}`));
  const justAhead = (data.ahead || []).map((card, i) => asPerson(card, `${handle}-ahead-${card.rank ?? i}`));
  const suggestions = (data.advice?.items || [])
    .map((item) => {
      const heading = String(item.title || "").trim();
      const body = String(item.description || "").trim();
      if (heading && body) return `${heading} — ${body}`;
      return heading || body;
    })
    .filter(Boolean);
  const first = data.first && Number.isFinite(Number(data.first.rank))
    ? {
      profileHandle: handle,
      query,
      ranking: {
        kind: "exact" as const,
        rank: Number(data.first.rank),
        poolSize: Number(data.first.total) || Number(data.total),
      },
    }
    : undefined;
  const found: Omit<RankLookupFound, "topThree"> = {
    status: "found",
    inputUrl: url,
    profile,
    query,
    ranking: { kind: "exact", rank: Number(data.rank), poolSize: Number(data.total) },
    recruiterReplyScore: typeof data.reply_score === "number" ? data.reply_score : null,
    previousRanking: first,
    keywords: skills,
    suggestions,
    adviceKind: data.advice?.personalized ? "personalized" : "general",
    topSearch: String(data.summary || "").trim(),
    rankedAt: new Date().toISOString(),
    profileVersion: "live",
    revision: first ? 1 : 0,
    peopleAbove: { strongest, justAhead },
    jobs: (data.jobs || []).map((row, i) => asJob(row, `${handle}-job-${i}`)).filter((row): row is MatchedJob => Boolean(row)),
    ogImageUrl: safeOgImageUrl(data.og_image_url),
    ogImageWidth: positiveDimension(data.og_image_width),
    ogImageHeight: positiveDimension(data.og_image_height),
  };
  return { ...found, topThree: completeTopThree(found), ...(taskId ? { taskId } : {}) };
}

type PeerRankEnvelope = { ok: boolean; status: number; code: number; msg: string; data: unknown; retryAfter: string | null };

async function peerRankRequest(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; headers?: Record<string, string>; signal?: AbortSignal },
): Promise<PeerRankEnvelope> {
  const res = await fetch(`${peerRankApiBase()}${path}`, {
    method: init.method,
    headers: {
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: init.signal,
  });
  let body: { code?: unknown; msg?: unknown; data?: unknown } = {};
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  const code = typeof body.code === "number" ? body.code : res.status;
  return {
    // OpenJobs BAPI uses code 0 for success; some compatible endpoints use 200.
    ok: res.ok && (code === 0 || code === 200),
    status: res.ok ? code : res.status,
    code,
    msg: typeof body.msg === "string" ? body.msg.trim() : "",
    data: body.data,
    retryAfter: res.headers.get("Retry-After"),
  };
}

function failureText(pack: PeerRankEnvelope, fallback: string): string {
  if (pack.status === 429) {
    const seconds = Number(pack.retryAfter);
    const wait = Number.isFinite(seconds) && seconds >= 0 ? ` Try again in ${Math.ceil(seconds)} seconds.` : "";
    return `${pack.msg || "Too many requests."}${wait}`;
  }
  return pack.msg || fallback;
}

type AcceptedTask = { taskId: string; queryToken: string };
type RankTask = {
  status?: unknown;
  result?: unknown;
  errorMsg?: unknown;
  rank?: unknown;
  total?: unknown;
  og_image_url?: unknown;
  og_image_width?: unknown;
  og_image_height?: unknown;
};

function taskState(data: unknown): RankTask {
  return data && typeof data === "object" ? data as RankTask : {};
}

function taskSucceeded(status: unknown): boolean {
  return status === "succeeded" || status === "completed" || status === "success";
}

function taskFailed(status: unknown): boolean {
  return status === "failed" || status === "error";
}

function taskPending(status: unknown): boolean {
  return status === "pending" || status === "running" || status === "processing" || status === "queued";
}

function rankUnavailable(status: unknown): boolean {
  return status === 404 || status === 410 || status === 503 || status === 6306 || status === "unavailable" || status === "expired";
}

function profileNotFound(status: unknown): boolean {
  return status === "not_found" || status === "profile_not_found";
}

function completedRankData(state: RankTask): PeerRankData | null {
  const result = state.result && typeof state.result === "object" ? state.result as PeerRankData : state as PeerRankData;
  if (!Number.isFinite(Number(result.rank)) || !Number.isFinite(Number(result.total))) return null;
  return {
    ...result,
    og_image_url: result.og_image_url ?? state.og_image_url as string | undefined,
    og_image_width: result.og_image_width ?? state.og_image_width as number | undefined,
    og_image_height: result.og_image_height ?? state.og_image_height as number | undefined,
  };
}

function safeOgImageUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch { return undefined; }
}

function positiveDimension(value: unknown): number | undefined {
  const dimension = Number(value);
  return Number.isInteger(dimension) && dimension > 0 ? dimension : undefined;
}

function acceptedTask(data: unknown): AcceptedTask | null {
  if (!data || typeof data !== "object") return null;
  const task = data as { taskId?: unknown; queryToken?: unknown };
  if (typeof task.taskId !== "string" || !task.taskId || typeof task.queryToken !== "string" || !task.queryToken) return null;
  return { taskId: task.taskId, queryToken: task.queryToken };
}

export async function lookupPeerRank(
  url: string,
  handle: string,
  options: {
    onProgress?: (progress: LookupProgress) => void;
    signal?: AbortSignal;
    pollMs?: number;
  } = {},
): Promise<RankLookupResult> {
  options.onProgress?.({ step: "profile" });
  const progress = (async () => {
    await wait(2_000, options.signal);
    options.onProgress?.({ step: "query" });
    await wait(6_000, options.signal);
    options.onProgress?.({ step: "rank" });
  })();
  const pollMs = options.pollMs ?? 2_000;

  try {
    const submitted = await peerRankRequest("/peer-rank/rank", {
      method: "POST",
      body: { linkedinUrl: url },
      signal: options.signal,
    });
    if (submitted.code === 6306) {
      return { status: "unavailable", inputUrl: url, message: failureText(submitted, "This ranking is unavailable.") };
    }
    if (submitted.status === 404) {
      return { status: "not_found", inputUrl: url, handle, suggestions: [] };
    }
    if (submitted.status === 400) {
      return { status: "invalid", inputUrl: url, message: failureText(submitted, "Use a public LinkedIn profile URL.") };
    }
    if (rankUnavailable(submitted.status)) {
      return { status: "unavailable", inputUrl: url, message: failureText(submitted, "This ranking is unavailable.") };
    }
    if (!submitted.ok) throw new Error(failureText(submitted, "The lookup did not finish. Try the URL again."));
    const submittedState = taskState(submitted.data);
    if (profileNotFound(submittedState.status)) return { status: "not_found", inputUrl: url, handle, suggestions: [] };
    if (rankUnavailable(submittedState.status)) return { status: "unavailable", inputUrl: url, message: "This ranking is unavailable." };
    const task = acceptedTask(submitted.data);
    if (!task) throw new Error("The lookup did not finish. Try the URL again.");

    // A submitted task is accepted while pending. Keep the caller in its loading
    // state and poll with the returned query token until the task is terminal.
    while (!options.signal?.aborted) {
      const pack = await peerRankRequest(`/peer-rank/rank/${encodeURIComponent(task.taskId)}`, {
        method: "GET",
        headers: { "X-Peer-Rank-Token": task.queryToken },
        signal: options.signal,
      });
      if (!pack.ok) {
        if (rankUnavailable(pack.code) || rankUnavailable(pack.status)) return { status: "unavailable", inputUrl: url, message: failureText(pack, "This ranking is unavailable.") };
        return { status: "invalid", inputUrl: url, message: failureText(pack, "The lookup did not finish. Try the URL again.") };
      }
      const state = taskState(pack.data);
      if (profileNotFound(state.status)) return { status: "not_found", inputUrl: url, handle, suggestions: [] };
      if (rankUnavailable(state.status)) return { status: "unavailable", inputUrl: url, message: "This ranking is unavailable." };
      if (taskFailed(state.status)) {
        const message = typeof state.errorMsg === "string" && state.errorMsg.trim()
          ? state.errorMsg.trim()
          : "We couldn't score that peer group. Try again in a moment.";
        return { status: "invalid", inputUrl: url, message };
      }
      if (!taskPending(state.status)) {
        const data = completedRankData(state);
        if (data) return rankFromPeerRank(url, handle, data, task.taskId);
        if (taskSucceeded(state.status)) throw new Error("The lookup did not finish. Try the URL again.");
      }
      await wait(pollMs, options.signal);
    }
    throw new DOMException("Aborted", "AbortError");
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    if (err instanceof Error && err.message) throw err;
    throw new Error("The lookup did not finish. Try the URL again.");
  } finally {
    progress.catch(() => undefined);
  }
}

/** Resume a ranking task linked from email without submitting another profile lookup. */
export async function lookupPeerRankTask(
  taskId: string,
  options: { onProgress?: (progress: LookupProgress) => void; signal?: AbortSignal; pollMs?: number } = {},
): Promise<RankLookupResult> {
  const id = taskId.trim();
  if (!id || id.length > 64) return { status: "invalid", inputUrl: "", message: "This ranking link is invalid." };
  const pollMs = options.pollMs ?? 2_000;
  options.onProgress?.({ step: "profile" });

  const tokenResponse = await peerRankRequest("/peer-rank/email/result-token", {
    method: "POST",
    body: { task_id: id },
    signal: options.signal,
  });
  if (!tokenResponse.ok) {
    return { status: "invalid", inputUrl: "", message: failureText(tokenResponse, "Could not access this ranking. Try again later.") };
  }
  const tokenData = tokenResponse.data as { queryToken?: unknown } | null;
  const queryToken = typeof tokenData?.queryToken === "string" ? tokenData.queryToken.trim() : "";
  if (!queryToken) return { status: "invalid", inputUrl: "", message: "Could not access this ranking. Try again later." };

  while (!options.signal?.aborted) {
    const pack = await peerRankRequest(`/peer-rank/rank/${encodeURIComponent(id)}`, {
      method: "GET",
      headers: { "X-Peer-Rank-Token": queryToken },
      signal: options.signal,
    });
    if (!pack.ok) {
      if (rankUnavailable(pack.code) || rankUnavailable(pack.status)) return { status: "unavailable", inputUrl: "", message: failureText(pack, "This ranking link is unavailable.") };
      return { status: "invalid", inputUrl: "", message: failureText(pack, "Could not access this ranking. Try again later.") };
    }

    const state = taskState(pack.data);
    if (profileNotFound(state.status) || rankUnavailable(state.status)) {
      return { status: "unavailable", inputUrl: "", message: "This ranking link is unavailable." };
    }
    if (taskFailed(state.status)) {
      const message = typeof state.errorMsg === "string" && state.errorMsg.trim()
        ? state.errorMsg.trim()
        : "We couldn't score that peer group. Try again in a moment.";
      return { status: "invalid", inputUrl: "", message };
    }
    if (!taskPending(state.status)) {
      const data = completedRankData(state);
      if (data) return rankFromPeerRank("", id, data, id);
      if (taskSucceeded(state.status)) throw new Error("The lookup did not finish. Try the link again.");
    }

    options.onProgress?.({ step: "rank" });
    await wait(pollMs, options.signal);
  }
  throw new DOMException("Aborted", "AbortError");
}

export async function removePeerRankProfile(linkedinUrl: string, signal?: AbortSignal): Promise<void> {
  const pack = await peerRankRequest("/peer-rank/remove-me", {
    method: "POST",
    body: { linkedinUrl },
    signal,
  });
  if (!pack.ok) throw new Error(failureText(pack, "Remove failed."));
}

export type PeerRankEmailType = "NEXT_RANK" | "TOP_JOBS";

export async function requestPeerRankEmail(
  linkedinUrl: string,
  email: string,
  type: PeerRankEmailType,
  signal?: AbortSignal,
): Promise<void> {
  const pack = await peerRankRequest("/peer-rank/email", {
    method: "POST",
    body: { linkedinUrl, email, type },
    signal,
  });
  if (!pack.ok) throw new Error(failureText(pack, "We couldn’t save your request. Please try again."));
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      globalThis.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
