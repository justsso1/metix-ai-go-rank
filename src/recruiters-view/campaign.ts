import { ROUTES, showTaskPath } from './site.ts';
import { completeTopThree } from './leaderboard.ts';
import { withPreviousRanking } from './card-story.ts';
import { makePeopleAbove, upgradeMockSnapshot } from './mock.ts';
import type { MatchedJob, RankDisplay, RankLookupFound, SearchQuery } from './types';

export const JOBS_TOP_PERCENT = 1;
export const RANK_INTERVAL_MS = 5 * 60 * 60 * 1000;
export const CONTACT_KEY = 'metix-rv-contact-v1';
export const campaignKey = (handle: string) => `metix-rv-campaign-v1:${handle}`;

export function topPercent(ranking: RankDisplay): number | null {
  if (ranking.kind !== 'exact' || !Number.isInteger(ranking.rank) || !Number.isInteger(ranking.poolSize)
    || ranking.rank < 1 || ranking.poolSize < ranking.rank) return null;
  return Math.ceil(ranking.rank * 100 / ranking.poolSize);
}

export function qualifiesForJobs(ranking: RankDisplay): boolean {
  return topPercent(ranking) !== null && ranking.kind === 'exact'
    && ranking.rank * 100 <= ranking.poolSize * JOBS_TOP_PERCENT;
}

function integerYoePiece(text: string): string {
  const plus = text.match(/^(\d+(?:\.\d+)?)\+\s*yr$/i);
  if (plus) return `${Math.round(Number(plus[1]))}+ yr`;
  const range = text.match(/^(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*yr$/i);
  if (!range) return text;
  const a = Math.round(Number(range[1]));
  const b = Math.round(Number(range[2]));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return text;
  return a === b ? `${a} yr` : `${a}–${b} yr`;
}

export function scopeLabel(query: SearchQuery): string {
  const skip = new Set(['any industry', 'any yoe']);
  const seen: string[] = [];
  const out: string[] = [];
  for (const raw of [query.jobTitle, query.location, query.companyType, query.seniorityBand]) {
    for (const piece of String(raw || '').split(' · ')) {
      const text = integerYoePiece(piece.trim());
      const key = text.toLowerCase();
      if (!text || skip.has(key)) continue;
      if (seen.some((s) => key === s || key.startsWith(`${s} `) || s.startsWith(`${key} `))) continue;
      seen.push(key);
      out.push(text);
    }
  }
  return out.join(' · ');
}

export function formatRankingTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(new Date(iso)) + ' UTC';
}

export function nextRankingTime(now: number): string {
  return new Date((Math.floor(now / RANK_INTERVAL_MS) + 1) * RANK_INTERVAL_MS).toISOString();
}

export type CampaignState = {
  result: RankLookupFound;
  previous?: RankLookupFound;
  status: 'current' | 'unchanged' | 'waiting' | 'updated';
  detectedAt?: string;
  nextRankingAt: string;
  rankUpdates: boolean;
};

export function initialCampaign(result: RankLookupFound, now = Date.now()): CampaignState {
  return { result, status: 'current', nextRankingAt: nextRankingTime(now), rankUpdates: false };
}

/** Profile detection deliberately leaves the published ranking untouched. */
export function recordProfileCheck(state: CampaignState, changed: boolean, now: number): CampaignState {
  if (state.status === 'waiting') return state;
  now = Math.max(now, Date.parse(state.result.rankedAt));
  return changed
    ? { ...state, status: 'waiting', detectedAt: new Date(now).toISOString(), nextRankingAt: nextRankingTime(now) }
    : { ...state, status: 'unchanged' };
}

export function refreshMockRanking(result: RankLookupFound, at: string): RankLookupFound {
  if (result.ranking.kind !== 'exact') return withPreviousRanking({ ...result, rankedAt: at, revision: result.revision + 1 }, result);
  // Fixtures exercise improvement, decline, and no movement. Not an algorithm.
  const delta = result.profile.handle === 'maya-chen-se' ? -35 : result.profile.handle === 'jordan-hale-pm' ? 6 : 0;
  const rank = Math.max(1, Math.min(result.ranking.poolSize, result.ranking.rank + delta));
  const updated: RankLookupFound = {
    ...result, ranking: { ...result.ranking, rank }, rankedAt: at,
    revision: result.revision + 1, profileVersion: `profile-v${result.revision + 2}`,
    peopleAbove: { ...peopleForScope(result, result.query, rank), strongest: result.topThree.filter(person => person.rank < rank) },
  };
  return withPreviousRanking({ ...updated, topThree: completeTopThree(updated) }, result);
}

/** Called after the service re-reads the profile at the next calculation. */
export function finishRanking(state: CampaignState, now: number): CampaignState {
  if (state.status !== 'waiting' || now < Date.parse(state.nextRankingAt)) return state;
  return { ...state, previous: state.result, result: refreshMockRanking(state.result, new Date(now).toISOString()),
    status: 'updated', nextRankingAt: nextRankingTime(now) };
}

function peopleForScope(result: RankLookupFound, query: SearchQuery, rank: number) {
  return makePeopleAbove(result.profile.handle, rank, {
    jobFamily: result.profile.jobFamily, title: query.jobTitle, metro: query.location,
    location: query.location, skills: result.profile.skills, company: result.profile.company,
  });
}

export function resultShareUrl(result: RankLookupFound, origin: string): string {
  if (result.taskId) {
    return new URL(showTaskPath(result.taskId), origin).toString();
  }
  const url = new URL(ROUTES.entry, origin);
  url.searchParams.set('u', result.profile.handle);
  url.searchParams.set('revision', String(result.revision));
  url.searchParams.set('at', result.rankedAt);
  return url.toString();
}

export function applySharedMockState(base: RankLookupFound, params: URLSearchParams): RankLookupFound {
  let result = base;
  const revision = Math.min(20, Math.max(0, Number(params.get('revision')) || 0));
  const rawDate = params.get('at');
  const at = rawDate && Number.isFinite(Date.parse(rawDate)) ? new Date(rawDate).toISOString() : base.rankedAt;
  for (let index = 0; index < Math.floor(revision); index++) result = refreshMockRanking(result, at);
  return { ...result, rankedAt: at };
}

export function showsJobMatches(result: RankLookupFound): boolean {
  if (result.profileVersion === "live") return Boolean(result.jobs?.length);
  return Boolean(result.jobs?.length) || qualifiesForJobs(result.ranking);
}

export type { MatchedJob };
export function matchedJobs(result: RankLookupFound): MatchedJob[] {
  if (result.profileVersion === "live" || result.jobs?.length) return result.jobs ?? [];
  const companies = ['Helio', 'Cascade', 'Packet', 'Vellum', 'Northshore', 'Fieldnote', 'Atelier', 'Nimbus', 'Ledgerly', 'Orion'];
  return companies.map((company, index) => ({
    id: `${result.profile.handle}-job-${index}`, title: result.query.jobTitle, company,
    location: result.query.location, workStyle: index % 3 === 0 ? 'Remote friendly' : 'Hybrid',
    skills: [result.profile.skills[index % result.profile.skills.length], result.profile.skills[(index + 1) % result.profile.skills.length]],
    reason: index % 2 === 0 ? `Your ${result.profile.skills[index % result.profile.skills.length]} experience aligns with this team's core work.`
      : `The role matches your ${result.profile.yearsExperience} years of experience and ${result.profile.jobFamily.toLowerCase()} background.`,
  }));
}

export function readCampaign(result: RankLookupFound): CampaignState {
  try {
    const saved = JSON.parse(localStorage.getItem(campaignKey(result.profile.handle)) || 'null');
    if (saved?.result?.profile?.handle === result.profile.handle && typeof saved.result.topSearch === 'string'
      && saved.result.query && scopeLabel(saved.result.query) === scopeLabel(result.query)
      && ['current', 'unchanged', 'waiting', 'updated'].includes(saved.status)
      && Number.isFinite(Date.parse(saved.nextRankingAt)) && Number.isFinite(Date.parse(saved.result.rankedAt))) {
      // Upgrade existing previews without discarding pending checks or email choices.
      saved.result.topThree ??= completeTopThree(saved.result);
      if (saved.previous) saved.previous.topThree ??= completeTopThree(saved.previous);
      saved.result = upgradeMockSnapshot(saved.result);
      if (saved.previous) saved.previous = upgradeMockSnapshot(saved.previous);
      if (!saved.result.previousRanking && saved.previous) saved.result = withPreviousRanking(saved.result, saved.previous);
      return saved;
    }
  } catch { /* Local storage can be unavailable; the preview still works. */ }
  return initialCampaign(result);
}
