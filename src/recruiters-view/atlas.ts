import { completeTopThree } from "./leaderboard.ts";
import type {
  LookupProgress,
  MatchedJob,
  RankLookupFound,
  RankLookupResult,
  RankedPerson,
  SearchQuery,
} from "./types";

export const ATLAS_LOOKUP_MS = 120_000;

type AtlasCard = {
  rank?: number;
  name?: string;
  avatar?: string;
  title?: string;
  company?: string;
};

type AtlasAdviceItem = { title?: string; description?: string };

type AtlasJob = {
  id?: string;
  title?: string;
  company?: string;
  location?: string;
  workplace?: string;
  url?: string;
};

type AtlasFirst = {
  rank?: number;
  total?: number;
  percent?: number;
  recruiter_page?: number;
  reply_score?: number;
};

export type AtlasRankData = {
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
  self?: AtlasCard;
  top?: AtlasCard[];
  ahead?: AtlasCard[];
  advice?: { personalized?: boolean; note?: string; items?: AtlasAdviceItem[] };
  first?: AtlasFirst | null;
  jobs?: AtlasJob[];
};

const GENERIC = [
  "Name the tools and systems in your recent roles, not only the team name.",
  "Make the current title match how recruiters search the job family.",
  "Write a short summary that states the role, years, and domain in one line.",
];

function env(): Record<string, unknown> {
  try {
    return ((import.meta as { env?: Record<string, unknown> }).env) ?? {};
  } catch {
    return {};
  }
}

export function atlasEnabled(): boolean {
  const e = env();
  return e.PUBLIC_ATLAS_LIVE === true || e.PUBLIC_ATLAS_LIVE === "true";
}

export function atlasBase(): string {
  const raw = env().PUBLIC_ATLAS_BASE;
  if (typeof raw === "string" && raw) return raw.replace(/\/$/, "");
  // Same-origin Vite proxy. Direct 127.0.0.1:8009 breaks when the page is
  // opened via LAN IP (phone / another laptop).
  return "/atlas";
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

function asPerson(card: AtlasCard, id: string): RankedPerson {
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

function asJob(row: AtlasJob, fallbackId: string): MatchedJob | null {
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

export function rankFromAtlas(url: string, handle: string, data: AtlasRankData): RankLookupFound {
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
    suggestions: suggestions.length ? suggestions : GENERIC,
    adviceKind: data.advice?.personalized ? "personalized" : "general",
    topSearch: String(data.summary || "").trim() || `${title} in ${location}`.trim(),
    rankedAt: new Date().toISOString(),
    profileVersion: "atlas",
    revision: first ? 1 : 0,
    peopleAbove: { strongest, justAhead },
    jobs: (data.jobs || []).map((row, i) => asJob(row, `${handle}-job-${i}`)).filter((row): row is MatchedJob => Boolean(row)),
  };
  return { ...found, topThree: completeTopThree(found) };
}

async function atlasJson(path: string, linkedin: string, signal?: AbortSignal): Promise<{ ok: boolean; status: number; msg: string; data: unknown }> {
  const res = await fetch(`${atlasBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ linkedin }),
    signal,
  });
  let body: { msg?: string; data?: unknown } = {};
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  return { ok: res.ok, status: res.status, msg: String(body.msg || ""), data: body.data };
}

export async function lookupAtlasRanking(
  url: string,
  handle: string,
  options: {
    onProgress?: (progress: LookupProgress) => void;
    signal?: AbortSignal;
  } = {},
): Promise<RankLookupResult> {
  options.onProgress?.({ step: "profile" });
  const progress = (async () => {
    await wait(2_000, options.signal);
    options.onProgress?.({ step: "query" });
    await wait(6_000, options.signal);
    options.onProgress?.({ step: "rank" });
  })();

  let pack: { ok: boolean; status: number; msg: string; data: unknown };
  try {
    pack = await atlasJson("/peer-rank/rank", url, options.signal);
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new Error("The lookup did not finish. Try the URL again.");
  } finally {
    progress.catch(() => undefined);
  }

  if (pack.status === 400) {
    return { status: "invalid", inputUrl: url, message: pack.msg || "Use a public LinkedIn profile URL." };
  }
  if (pack.status === 404) {
    return { status: "not_found", inputUrl: url, handle, suggestions: GENERIC };
  }
  if (!pack.ok || !pack.data || typeof pack.data !== "object") {
    throw new Error(pack.msg || "The lookup did not finish. Try the URL again.");
  }
  const data = pack.data as AtlasRankData;
  if (!Number.isFinite(Number(data.rank)) || !Number.isFinite(Number(data.total))) {
    throw new Error("The lookup did not finish. Try the URL again.");
  }
  return rankFromAtlas(url, handle, data);
}

export async function removeAtlasProfile(linkedin: string, signal?: AbortSignal): Promise<void> {
  const pack = await atlasJson("/peer-rank/remove-profile", linkedin, signal);
  if (!pack.ok && pack.status !== 400) {
    throw new Error(pack.msg || "Remove failed.");
  }
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
