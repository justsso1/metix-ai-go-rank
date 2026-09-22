import { getMockShareResults } from './mock.ts';
import { withPreviousRanking } from './card-story.ts';
import { advancePrelude, clamp, EXPAND_DURATION, MATERIAL_SETTLE_DURATION, PRELUDE_END, preludeSpeed, revealTiming } from './ranking-motion.ts';
import type { RankLookupFound } from './types';

export const DEBUG_CHANNEL = 'recruiters-view-motion-v1';
const fixtures = getMockShareResults();
const maya = fixtures.find(result => result.profile.handle === 'maya-chen-se')!;
const seven: RankLookupFound = { ...maya, ranking: { kind: 'exact', rank: 7, poolSize: 1240 }, peopleAbove: {
  strongest: maya.topThree,
  justAhead: maya.peopleAbove.justAhead.slice(-2).map((person, index) => ({ ...person, rank: index + 5, id: `debug-near-${index}` })),
} };
function cardExample(rank: number, poolSize = 1240): RankLookupFound {
  return { ...maya, ranking: { kind: 'exact', rank, poolSize }, peopleAbove: {
    strongest: maya.topThree,
    justAhead: maya.peopleAbove.justAhead.slice(-2).map((person, index) => ({ ...person, rank: rank - 2 + index })),
  } };
}
export const DEBUG_SCENARIOS = [
  { id: '47', label: '#47 · Maya Chen', result: maya },
  ...[1, 2, 3, 5].map(rank => {
    const result = fixtures.find(item => item.ranking.kind === 'exact' && item.ranking.rank === rank)!;
    return { id: String(rank), label: `#${rank} · ${result.profile.fullName}`, result };
  }),
  { id: '7', label: '#7 · One omitted row', result: seven },
  { id: '86', label: '#86 · Jordan Hale', result: fixtures.find(result => result.profile.handle === 'jordan-hale-pm')! },
  { id: 'middle', label: '5–50% · Page 6', result: cardExample(143) },
  { id: 'lower', label: 'Bottom 50% · Page 396', result: cardExample(9883, 12431) },
  { id: 'improved', label: 'Profile updated · #984 → #412', result: withPreviousRanking(cardExample(412), cardExample(984)) },
];
export type DebugSettings = { scenario: string; time: number; responseAt: number | null; reducedMotion: boolean };
export const DEFAULT_DEBUG: DebugSettings = { scenario: '47', time: 0, responseAt: 20, reducedMotion: false };
export function debugResult(id: string) { return (DEBUG_SCENARIOS.find(item => item.id === id) ?? DEBUG_SCENARIOS[0]).result; }

/** Map a seekable wall clock to the same response-driven production clock.
 * Seeking is pure: replay never changes saved rankings or consumes mock requests. */
export function debugTimeline(time: number, responseAt: number | null, result: RankLookupFound, reducedMotion = false) {
  const elapsed = Math.max(0, time), timing = revealTiming(result);
  const responseTime = responseAt === null ? Infinity : Math.max(0, responseAt);
  const atResponse = Math.min(PRELUDE_END, responseTime);
  const speed = preludeSpeed(atResponse);
  const revealAt = responseTime + (PRELUDE_END - atResponse) / speed;
  const available = elapsed >= responseTime;
  const end = reducedMotion ? responseTime : revealAt + timing.end;
  const prelude = reducedMotion ? 0 : elapsed < responseTime ? Math.min(PRELUDE_END, elapsed) : advancePrelude(atResponse, elapsed - responseTime, speed);
  const reveal = reducedMotion ? available ? timing.end : 0 : clamp(elapsed - revealAt, 0, timing.end);
  const phase = reducedMotion ? available ? 'Complete' : 'Waiting' : elapsed >= end ? 'Complete' : reveal >= timing.expandStart + MATERIAL_SETTLE_DURATION ? 'Reveal actions' : reveal >= timing.expandStart + EXPAND_DURATION ? 'Settle card' : reveal > timing.expandStart ? 'Expand card' : reveal > timing.selectStart ? 'Highlight' : reveal > timing.scrollStart ? 'Find your rank' : elapsed >= revealAt ? 'Move leaderboard' : prelude >= 18 ? 'Waiting for response' : prelude >= 12 ? 'Build leaderboard' : prelude >= 6 ? 'Score profiles' : 'Shortlist profiles';
  const atPrelude = (value: number) => value <= atResponse ? value : responseTime + (value - atResponse) / speed;
  const chapters = reducedMotion ? [{ label: 'Start', time: 0 }] : [
    { label: 'Shortlist', time: 0 }, { label: 'Body → scores', time: atPrelude(5.3) },
    { label: 'Cards → rows', time: atPrelude(12) }, { label: 'Move right', time: revealAt },
    { label: 'Scroll', time: revealAt + timing.scrollStart }, { label: 'Highlight', time: revealAt + timing.selectStart },
    { label: 'Expand', time: revealAt + timing.expandStart },
    { label: 'Settle', time: revealAt + timing.expandStart + EXPAND_DURATION },
    { label: 'Actions', time: revealAt + timing.expandStart + MATERIAL_SETTLE_DURATION },
  ];
  chapters.push({ label: 'Complete', time: end });
  return { prelude, reveal, available, phase, end, chapters, complete: elapsed >= end };
}

export function validDebugSettings(value: unknown): value is DebugSettings {
  if (!value || typeof value !== 'object') return false;
  const s = value as DebugSettings;
  return DEBUG_SCENARIOS.some(item => item.id === s.scenario) && Number.isFinite(s.time) && s.time >= 0 && s.time <= 120
    && (s.responseAt === null || Number.isFinite(s.responseAt) && s.responseAt >= 0 && s.responseAt <= 90) && typeof s.reducedMotion === 'boolean';
}
