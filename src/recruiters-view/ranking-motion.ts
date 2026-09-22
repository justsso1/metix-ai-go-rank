// Geometry adapted from the approved ranking-motion-c-refined.html.
// The clock is illustrative until the lookup resolves; it never supplies rank data.
import { ownRankedPerson } from './leaderboard.ts';
import type { RankLookupFound, RankedPerson } from './types';

export const PRELUDE_END = 18;
export const PICKED = [2, 6, 9, 13, 18, 22];
export const PAINT_ORDER = [0, 2, 4, 1, 3, 5];
export const DIMENSIONS = ['Role fit', 'Skills match', 'Relevant experience'];
export const SCORE_TARGETS = [[50, 60, 48], [60, 57, 70], [69, 76, 61], [78, 71, 74], [82, 85, 79], [91, 88, 94]];
const permutations = [[2, 5, 0, 4, 1, 3], [5, 2, 4, 0, 3, 1], [5, 4, 2, 3, 1, 0], [5, 4, 3, 2, 1, 0]];
export const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const ease = (t: number) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const out = (t: number) => 1 - (1 - clamp(t)) ** 3;
export type Pose = { x: number; y: number; w: number; h: number; angle?: number };
export function poseMix(a: Pose, b: Pose, p: number): Pose {
  return { x: mix(a.x, b.x, p), y: mix(a.y, b.y, p), w: mix(a.w, b.w, p), h: mix(a.h, b.h, p), angle: mix(a.angle ?? 0, b.angle ?? 0, p) };
}
export function gridPose(index: number, mobile: boolean): Pose {
  const cols = mobile ? 6 : 8, w = mobile ? 68 : 83, h = mobile ? 95 : 113, gx = mobile ? 19 : 20, gy = mobile ? 23 : 24;
  const col = index % cols, total = cols * w + (cols - 1) * gx, width = mobile ? 600 : 1000;
  return { x: (width - total) / 2 + col * (w + gx), y: (mobile ? 172 : 121) + Math.floor(index / cols) * (h + gy), w, h, angle: (col - (cols - 1) / 2) * .011 };
}
export function assessPose(id: number, mobile: boolean): Pose {
  const col = Math.floor(id / 2), back = id % 2 === 0, w = mobile ? 174 : 208, h = mobile ? 252 : 275, gap = mobile ? 16 : 48;
  return { x: (mobile ? 300 : 500) + (col - 1) * (w + gap) - w / 2 + (back ? 12 : 0), y: (mobile ? 259 : 155) - (back ? 12 : 0), w, h, angle: back ? .024 : 0 };
}
export function coarsePose(id: number, t: number, mobile: boolean): Pose {
  const progress = ease((t - 2.8 - id * .12) / 2.2), pose = poseMix(gridPose(PICKED[id], mobile), assessPose(id, mobile), progress);
  pose.y -= ease((t - 1 - id * .16) / .55) * 13 * (1 - progress);
  return pose;
}
export function readyListPose(id: number, mobile: boolean): Pose {
  const width = mobile ? 600 : 1000, w = width * (mobile ? .77 : .55), h = mobile ? 62 : 47;
  return { x: (width - w) / 2, y: (mobile ? 192 : 141) + (5 - id) * (h + 12), w, h, angle: 0 };
}
export function sortedPose(id: number, t: number, mobile: boolean): Pose {
  const u = clamp(t - 12, 0, 6), morph = ease(u / 1.2), elapsed = Math.max(0, u - 1.25);
  const seg = Math.min(2, Math.floor(elapsed / 1.4)), swap = ease((elapsed - seg * 1.4) / 1.06), from = permutations[seg], to = permutations[seg + 1];
  const row = mix(from.indexOf(id), to.indexOf(id), swap), target = readyListPose(id, mobile);
  target.y = (mobile ? 192 : 141) + row * (target.h + 12);
  if (Math.abs(from.indexOf(id) - to.indexOf(id)) > 1) target.x += Math.sin(swap * Math.PI) * (id % 2 ? 10 : -10);
  return poseMix(assessPose(id, mobile), target, morph);
}
export function preludePose(id: number, time: number, mobile: boolean) {
  return time < 6 ? coarsePose(id, time, mobile) : time < 12 ? assessPose(id, mobile) : sortedPose(id, time, mobile);
}
export function assessmentProgress(time: number, line = 0) { return ease((time - 5.3 - line * .14) / 1.2); }
export function scoreValue(id: number, dimension: number, time: number) {
  const start = 6 + .35 + Math.floor(id / 2) * .16 + (.47 + dimension * .135) * 3.35;
  return SCORE_TARGETS[id][dimension] * ease((time - start) / 1.15);
}
export function preludeSpeed(timeAtResponse: number) { return Math.max(1, (PRELUDE_END - timeAtResponse) / 2.4); }
export function advancePrelude(time: number, delta: number, speed = 1) { return Math.min(PRELUDE_END, time + Math.max(0, delta) * speed); }

/** Only positions and valid ranks are synthesized. Missing profile data stays blank. */
export function rankedEntry(result: RankLookupFound, rank: number): RankedPerson | undefined {
  const own = ownRankedPerson(result);
  if (result.ranking.kind === 'exact' && rank === own.rank) return own;
  return [...result.topThree, ...result.peopleAbove.justAhead, ...(result.rankingEntries ?? [])].find(person => person.rank === rank);
}
export const EXPAND_DURATION = 1.1;
export const MATERIAL_SETTLE_DURATION = 1.95;
export const LEADERBOARD_FINISH_DURATION = .26;
export const RESULT_ACTIONS_DURATION = .64;

/** Finish the leaderboard overlay, then reveal controls. The real card is independent. */
export function revealLayers(elapsed: number) {
  const settled = elapsed - MATERIAL_SETTLE_DURATION;
  return {
    destinationVisible: settled >= 0,
    overlayOpacity: 1 - ease(settled / LEADERBOARD_FINISH_DURATION),
    actions: ease((settled - .12) / .36),
    opportunities: ease((settled - .22) / .42),
  };
}

/** The same seekable clock drives the selection sweep, material light and tilt. */
export function selectionSheen(elapsed: number, reduced = false) {
  const p = clamp(elapsed / .76);
  return {
    x: mix(-110, 125, ease(p)),
    opacity: reduced ? 0 : .85 * ease(p / .16) * (1 - ease((p - .7) / .3)),
    illumination: reduced ? 0 : .6 * Math.sin(Math.PI * p) ** 2,
  };
}
export function cardPresentation(elapsed: number, mobile = false, reduced = false) {
  const rock = elapsed < 1.2 ? ease((elapsed - .72) / .48)
    : elapsed < 1.6 ? mix(1, -.2, ease((elapsed - 1.2) / .4))
    : mix(-.2, 0, ease((elapsed - 1.6) / .35));
  const strength = reduced ? 0 : mobile ? .65 : 1;
  return {
    rotateX: .9 * rock * strength,
    rotateY: -2.6 * rock * strength,
    lightX: mix(-110, 135, ease((elapsed - .65) / 1.3)),
    lightOpacity: reduced ? 0 : .48 * ease((elapsed - .58) / .4) * (1 - ease((elapsed - 1.55) / .4)),
  };
}
export function revealTiming(result: RankLookupFound) {
  const rank = result.ranking.kind === 'exact' ? result.ranking.rank : 0;
  const offset = Math.max(0, rank - 6);
  const scrollDuration = offset ? clamp(1.5 + Math.log10(rank) * 1.1, 2.8, 4.5) : 0;
  const scrollStart = 1.25, scrollEnd = scrollStart + scrollDuration;
  // A rank-7 result has exactly one omitted row; make room after it has exited.
  const selectStart = scrollEnd + (offset === 1 ? .38 : .18);
  const expandStart = selectStart + .8;
  return { rank, offset, scrollStart, scrollDuration, scrollEnd, selectStart, expandStart, end: expandStart + MATERIAL_SETTLE_DURATION + RESULT_ACTIONS_DURATION };
}
export function scrollState(result: RankLookupFound, time: number) {
  const timing = revealTiming(result), progress = timing.scrollDuration ? ease((time - timing.scrollStart) / timing.scrollDuration) : 0;
  const offset = timing.offset * progress;
  const omission = offset < 1 ? 0 : timing.offset === 1 ? ease((time - timing.scrollEnd) / .3) : ease((offset - 1) / Math.min(7, timing.offset - 1));
  return { offset, omission, firstRank: 4 + Math.floor(offset), done: time >= timing.scrollEnd };
}
export function omissionLabel(firstVisible: number) {
  return firstVisible <= 4 ? '' : '…';
}
