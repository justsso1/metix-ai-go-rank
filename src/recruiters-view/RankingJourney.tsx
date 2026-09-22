import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { cardFlight } from './card-flight';
import { leaderboardRankWidth, rememberRanking } from './leaderboard';
import { scopeLabel } from './campaign';
import { advancePrelude, assessmentProgress, clamp, DIMENSIONS, ease, EXPAND_DURATION, gridPose, mix, out, PAINT_ORDER, PICKED, poseMix, PRELUDE_END, preludePose, preludeSpeed, rankedEntry, readyListPose, revealLayers, revealTiming, scoreValue, scrollState, selectionSheen, type Pose } from './ranking-motion';
import type { RankLookupFound, RankedPerson } from './types';
import PodiumBadge from './PodiumBadge';
import LeaderboardOmission from './LeaderboardOmission';

type Destination = { width: number; height: number; mobile: boolean; board: Pose; first: Pose; pitch: number; gap: number; card: Pose; own: Pose; rows: Record<number, Pose> };
export type JourneyClock = { prelude: number; reveal: number };
const poseStyle = (p: Pose): CSSProperties => ({ width: p.w, height: p.h, transform: `translate3d(${p.x}px,${p.y}px,0) rotate(${p.angle ?? 0}rad)` });
const box = (element: Element, root: DOMRect): Pose => { const r = element.getBoundingClientRect(); return { x: r.left - root.left, y: r.top - root.top, w: r.width, h: r.height }; };

/** One persistent set of DOM cards, from anonymous resumes to the docked list.
 * The final page is measured underneath; the last frame uses its exact geometry.
 * No lookup data, percentage-complete estimate or personal score is invented here.
 */
export default function RankingJourney({ result, onComplete, onCancel, playback }: { result: RankLookupFound | null; onComplete: () => void; onCancel: () => void; playback?: JourneyClock & { reducedMotion: boolean } }) {
  const root = useRef<HTMLDivElement>(null), systemReduced = useReducedMotion();
  const reduced = playback ? playback.reducedMotion : systemReduced;
  const [liveClock, setClock] = useState<JourneyClock>({ prelude: 0, reveal: 0 });
  const clock = playback ?? liveClock;
  const controlled = playback !== undefined;
  const [destination, setDestination] = useState<Destination | null>(null);
  const [viewport, setViewport] = useState({ width: 1200, mobile: false });
  const data = useRef(result), geometry = useRef(destination), done = useRef(onComplete);
  const frame = useRef(0), responseSpeed = useRef<number | null>(null), interrupted = useRef(false), mobileAligned = useRef(false);
  data.current = result; geometry.current = destination; done.current = onComplete;

  useEffect(() => {
    const element = root.current, host = element?.parentElement;
    if (!element || !host) return;
    let measureFrame = 0, disposed = false;
    const measure = () => {
      const base = element.getBoundingClientRect(), mobile = window.innerWidth < 960;
      setViewport(old => old.width === base.width && old.mobile === mobile ? old : { width: base.width, mobile });
      const stage = host.querySelector('.rv-result-stage'), board = host.querySelector('.rv-leaderboard'), card = host.querySelector('.rv-card-sensor');
      if (!stage || !board || !card) return;
      const rows: Record<number, Pose> = {};
      host.querySelectorAll<HTMLElement>('.rv-journey-destination .rv-board-entry[data-rank]').forEach(node => { if (node.offsetWidth) rows[Number(node.dataset.rank)] = box(node, base); });
      const first = rows[1]; if (!first) return;
      const pitch = rows[2] ? rows[2].y - first.y : first.h + 8;
      const lower = Object.entries(rows).filter(([rank]) => Number(rank) > 3).sort(([a], [b]) => +a - +b)[0]?.[1];
      const ownRank = data.current?.ranking.kind === 'exact' ? data.current.ranking.rank : 0;
      const next = { width: base.width, height: box(stage, base).y + box(stage, base).h, mobile, board: box(board, base), first, pitch,
        gap: lower ? Math.max(0, lower.y - first.y - pitch * 3) : 0, card: box(card, base), own: rows[ownRank] ?? rows[0] ?? { ...first, y: first.y + pitch * 3 }, rows };
      setDestination(old => JSON.stringify(old) === JSON.stringify(next) ? old : next);
    };
    const schedule = () => { if (disposed) return; cancelAnimationFrame(measureFrame); measureFrame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule); observer.observe(host);
    host.querySelectorAll('.rv-result-stage, .rv-card-sensor, .rv-leaderboard').forEach(node => observer.observe(node));
    schedule(); window.addEventListener('resize', schedule);
    void document.fonts.ready.then(schedule);
    return () => { disposed = true; observer.disconnect(); cancelAnimationFrame(measureFrame); window.removeEventListener('resize', schedule); };
  }, [result?.profile.handle]);

  useEffect(() => {
    if (controlled) return;
    let previous = performance.now(), current: JourneyClock = { prelude: 0, reveal: 0 }, stopped = false;
    const tick = (now: number) => {
      const delta = document.hidden ? 0 : Math.min((now - previous) / 1000, .06); previous = now;
      if (data.current && geometry.current && reduced) { rememberRanking(data.current); done.current(); return; }
      if (data.current && responseSpeed.current === null) responseSpeed.current = preludeSpeed(current.prelude);
      if (!reduced) {
        if (current.prelude < PRELUDE_END) current = { ...current, prelude: advancePrelude(current.prelude, delta, responseSpeed.current ?? 1) };
        else if (data.current && geometry.current) current = { ...current, reveal: current.reveal + delta };
      }
      setClock(current);
      if (data.current && current.reveal >= revealTiming(data.current).end) { rememberRanking(data.current); done.current(); return; }
      if (!stopped) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    const stopScroll = () => { interrupted.current = true; };
    const key = (event: KeyboardEvent) => { if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) stopScroll(); };
    window.addEventListener('wheel', stopScroll, { passive: true }); window.addEventListener('touchstart', stopScroll, { passive: true }); window.addEventListener('keydown', key);
    return () => { stopped = true; cancelAnimationFrame(frame.current); window.removeEventListener('wheel', stopScroll); window.removeEventListener('touchstart', stopScroll); window.removeEventListener('keydown', key); };
  }, [reduced, controlled]);

  const timing = result ? revealTiming(result) : null, time = clock.prelude, reveal = clock.reveal;
  const showingResult = !!result && time >= PRELUDE_END && !!destination;
  const scroll = result ? scrollState(result, reveal) : { offset: 0, omission: 0, firstRank: 4, done: false };
  const dock = showingResult ? ease(reveal / 1.08) : 0;
  const selected = timing ? ease((reveal - timing.selectStart) / .4) : 0;
  const grow = timing ? out((reveal - timing.expandStart) / EXPAND_DURATION) : 0;
  const selectionTime = timing && !reduced ? reveal - timing.selectStart : -1;
  const layers = revealLayers(timing ? reveal - timing.expandStart : -1);
  useEffect(() => {
    if (controlled || !destination?.mobile || !timing || mobileAligned.current || reveal < timing.expandStart || interrupted.current || reduced) return;
    mobileAligned.current = true;
    const element = root.current; if (!element) return;
    const navBottom = document.getElementById('nav')?.getBoundingClientRect().bottom ?? 72;
    const from = window.scrollY, to = Math.max(0, from + element.getBoundingClientRect().top + destination.card.y - navBottom - 20), start = performance.now();
    let id = 0;
    const align = (now: number) => { if (interrupted.current) return; const progress = clamp((now - start) / 700); window.scrollTo({ top: mix(from, to, out(progress)), behavior: 'instant' }); if (progress < 1) id = requestAnimationFrame(align); };
    id = requestAnimationFrame(align); return () => cancelAnimationFrame(id);
  }, [reveal >= (timing?.expandStart ?? Infinity), destination?.mobile, reduced, controlled]);

  const mobile = viewport.mobile, unit = Math.min(viewport.width - (mobile ? 24 : 80), 1120) / (mobile ? 600 : 1000);
  const origin = (viewport.width - unit * (mobile ? 600 : 1000)) / 2;
  const project = (p: Pose): Pose => ({ x: p.x * unit + origin, y: p.y * unit + (mobile ? 120 : 22), w: p.w * unit, h: p.h * unit, angle: p.angle });
  const targetRow = (rank: number): Pose => destination ? (rank <= 3 && destination.rows[rank] || { ...destination.first, y: destination.first.y + (rank - 1) * destination.pitch }) : project(readyListPose(6 - rank, mobile));
  const lowerBase = targetRow(4), clipped = showingResult && reveal >= 1.12;
  const lowerY = lowerBase.y + (destination?.gap ?? 20) * scroll.omission;
  const currentRank = timing?.rank ?? 0;
  const finalLowerCount = currentRank > 3 ? Math.min(3, currentRank - 3) : 0;
  const collapse = showingResult ? ease((reveal - (timing?.selectStart ?? 0)) / .35) : 0;
  const lowerCount = mix(3, finalLowerCount, collapse);
  const lowerHeight = Math.max(0, lowerCount * (destination?.pitch ?? 76) - 8) + (currentRank > 3 ? Math.max(0, (destination?.own.h ?? lowerBase.h) - lowerBase.h) * selected : 0);
  const ownPose = result?.ranking.kind === 'band' && destination ? destination.own : currentRank <= 3 ? targetRow(currentRank || 3) : { ...lowerBase, y: lowerY + (currentRank - 4 - scroll.offset) * (destination?.pitch ?? 76), h: destination?.own.h ?? lowerBase.h };
  useLayoutEffect(() => {
    const host = root.current?.parentElement;
    if (!host) return;
    const values = {
      ...(result && destination && timing ? cardFlight(ownPose, destination.card, reveal - timing.expandStart, mobile, !!reduced) : {}),
      '--journey-destination-visibility': layers.destinationVisible ? 'visible' : 'hidden',
      '--journey-actions': String(layers.actions), '--journey-actions-y': `${4 * (1 - layers.actions)}px`,
      '--journey-opportunities': String(layers.opportunities), '--journey-opportunities-y': `${4 * (1 - layers.opportunities)}px`,
    };
    Object.entries(values).forEach(([name, value]) => host.style.setProperty(name, value));
    return () => Object.keys(values).forEach(name => host.style.removeProperty(name));
  });
  const rowEntry = (rank: number) => result ? rankedEntry(result, rank) : undefined;
  const caption = !showingResult ? time < 6 ? 'Finding profiles that match the search' : time < 12 ? 'Comparing role, skills and experience' : time < 18 ? 'Ordering profiles by relevance' : 'Waiting for your ranking' : reveal < 1.25 ? 'Your results are ready' : reveal < (timing?.selectStart ?? 0) ? 'Finding your place in the ranking' : grow === 0 ? 'Your place in the ranking' : 'Your ranking, ready to share';
  const lateRows = clipped && result ? Array.from({ length: 5 }, (_, index) => scroll.firstRank - 1 + index).filter(rank => rank > 6 && rank <= Math.min(result.ranking.poolSize, Math.max(6, currentRank))) : [];
  const naturalHeight = mobile ? 560 : 670;
  return <div ref={root} className="rv-journey" data-phase={showingResult ? grow ? 'detail' : selected ? 'selected' : clipped ? 'finding' : 'docking' : time < 6 ? 'search' : time < 12 ? 'assess' : time < 18 ? 'sort' : 'waiting'}
    data-omission={scroll.omission.toFixed(3)} data-first-rank={scroll.firstRank} data-prelude-time={time.toFixed(2)} data-reveal-time={reveal.toFixed(2)} aria-hidden={layers.overlayOpacity === 0 || undefined} style={{ '--rv-board-rank-width': result ? `${leaderboardRankWidth(result)}px` : '30px', minHeight: Math.max(naturalHeight, destination?.height ?? 0), opacity: layers.overlayOpacity, visibility: layers.overlayOpacity === 0 ? 'hidden' : undefined } as CSSProperties}>
    <header className="rv-journey-status" style={{ opacity: 1 - ease(reveal / .5), pointerEvents: showingResult ? 'none' : undefined }}>
      <p className="rv-rank-kicker">RECRUITER'S VIEW</p><h1>{caption}</h1>
    </header>
    <div className="rv-journey-live rv-sr-only" role="status" aria-live="polite">{caption}</div>
    {!result && <button type="button" className="rv-journey-cancel" data-track="cancel_search" data-track-location="lookup" onClick={onCancel}>Cancel search</button>}
    <div className="rv-journey-scene" aria-hidden="true">
      {!reduced && time < 5.5 && Array.from({ length: 24 }, (_, index) => !PICKED.includes(index) && <div key={index} className="rv-journey-document is-pool" style={{ ...poseStyle(project(gridPose(index, mobile))), opacity: (.45 - ease((time - 2.45) / 1.8) * .4) * (1 - ease((time - 4.35) / 1)), translate: `0 ${ease((time - 2.3) / 2.5) * 18}px` }}><ResumeInterior id={index % 6} time={0} width={gridPose(index, mobile).w * unit} height={gridPose(index, mobile).h * unit} morph={0} unit={unit} /></div>)}
      {destination && <div className="rv-journey-board-back" style={{ ...poseStyle({ ...destination.board, h: mix(Math.max(destination.board.h, destination.first.y - destination.board.y + destination.pitch * 5 + destination.first.h + 24), destination.board.h, collapse) }), opacity: ease((reveal - .45) / .6) }}><h3>The leaderboard</h3><p>{result ? scopeLabel(result.query) : ''}</p></div>}
      {PAINT_ORDER.filter(id => id >= 3).map(id => {
        const pose = poseMix(project(preludePose(id, reduced ? 7 : time, mobile)), targetRow(6 - id), dock);
        return <JourneyCard key={id} id={id} pose={pose} time={reduced ? 7 : time} unit={unit} dock={dock} person={showingResult ? rowEntry(6 - id) : undefined} rank={showingResult ? 6 - id : undefined} selected={6 - id === currentRank ? selected : 0} sheenTime={6 - id === currentRank ? selectionTime : -1} />;
      })}
      <div className={`rv-journey-scroll-window ${clipped ? 'is-clipped' : ''}`} style={clipped ? { left: lowerBase.x - 2, top: lowerY - 2, width: lowerBase.w + 4, height: lowerHeight + 4 } : undefined}>
        <div className="rv-journey-scroll-track" style={clipped ? { transform: `translateY(${-scroll.offset * (destination?.pitch ?? 76)}px)` } : undefined}>
          {PAINT_ORDER.filter(id => id < 3).map(id => {
            const rank = 6 - id;
            const pose = clipped ? { ...lowerBase, x: 2, y: 2 + (rank - 4) * (destination?.pitch ?? 76), h: rank === currentRank ? mix(lowerBase.h, destination?.own.h ?? lowerBase.h, selected) : lowerBase.h } : poseMix(project(preludePose(id, reduced ? 7 : time, mobile)), targetRow(rank), dock);
            return <JourneyCard key={id} id={id} pose={pose} time={reduced ? 7 : time} unit={unit} dock={dock} person={showingResult ? rowEntry(rank) : undefined} rank={showingResult ? rank : undefined} selected={rank === currentRank ? selected : 0} sheenTime={rank === currentRank ? selectionTime : -1} />;
          })}
          {lateRows.map(rank => <JourneyCard key={`rank-${rank}`} id={(6 - rank % 6) % 6} pose={{ ...lowerBase, x: 2, y: 2 + (rank - 4) * (destination?.pitch ?? 76), h: rank === currentRank ? mix(lowerBase.h, destination?.own.h ?? lowerBase.h, selected) : lowerBase.h }} time={18} unit={unit} dock={1} person={rowEntry(rank)} rank={rank} selected={rank === currentRank ? selected : 0} sheenTime={rank === currentRank ? selectionTime : -1} />)}
        </div>
      </div>
      {destination && scroll.omission > 0 && <div className="rv-journey-omission" style={{ left: lowerBase.x, top: lowerBase.y - (destination.pitch - destination.first.h), width: lowerBase.w, height: destination.gap + destination.pitch - destination.first.h, opacity: scroll.omission }}><LeaderboardOmission /></div>}
      {result?.ranking.kind === 'band' && destination && selected > 0 && <JourneyCard id={0} pose={destination.own} time={18} unit={unit} dock={1} person={{ ...result.profile, id: 'own', rank: 0 }} label={result.ranking.label} selected={selected} sheenTime={selectionTime} opacity={selected} />}
    </div>
  </div>;
}

function JourneyCard({ id, pose, time, unit, dock, person, rank, label, selected, sheenTime = -1, opacity = 1 }: { id: number; pose: Pose; time: number; unit: number; dock: number; person?: RankedPerson; rank?: number; label?: string; selected: number; sheenTime?: number; opacity?: number }) {
  const morph = ease((time - 12) / 1.2), identity = ease(dock / .7);
  const highlight = ease((time - 1 - id * .16) / .55) * (1 - ease((time - 3.1) / 2.1));
  const sheen = selectionSheen(sheenTime);
  const border = [57, 51, 67];
  const borderColor = `rgba(${border.map((c, i) => Math.round(mix([119, 100, 132][i], c, dock))).join(',')},${mix(.4, 1, dock)})`;
  return <div className={`rv-journey-document ${rank && rank <= 3 ? `is-podium-${rank}` : ''} ${selected > 0 ? 'is-selected' : ''}`} data-resume={id} data-rank={rank}
    style={{ ...poseStyle(pose), borderColor: `color-mix(in srgb, var(--rv-selection-edge) ${selected * 100}%, ${borderColor})`, opacity, zIndex: PAINT_ORDER.indexOf(id) + 2, '--journey-highlight': highlight, '--journey-dock': dock, '--journey-selection': selected, '--journey-selection-percent': `${selected * 100}%` } as CSSProperties}>
    <div className="rv-journey-row-surface" style={{ opacity: dock }} />
    <div className="rv-journey-resume-contents" style={{ opacity: 1 - identity }}><ResumeInterior id={id} time={time} width={pose.w} height={pose.h} unit={unit} morph={morph} />
      {time >= 6 && time < 10.5 && <div className="rv-journey-scan" style={{ top: `${clamp((time - 6.35 - Math.floor(id / 2) * .16) / 3.35) * 115 - 10}%`, opacity: (1 - ease((time - 9.7 - Math.floor(id / 2) * .16) / .3)) * (1 - morph) }} />}
    </div>
    {rank !== undefined || label ? <div className={`rv-journey-person ${label ? 'is-band' : ''}`} style={{ opacity: identity }}>
      <span className="rv-journey-rank">{label ?? `#${rank}`}</span><span className="rv-journey-avatar">{person?.avatar ? <img src={person.avatar} alt="" /> : person ? person.fullName[0] : ''}<PodiumBadge rank={person ? rank : undefined} /></span>
      <div className="rv-journey-person-copy">{person ? <><b>{person.fullName}</b><p>{person.title} · {person.company}</p></> : <><i /><i /></>}</div>
    </div> : null}
    <div className="rv-journey-selection-sheen" style={{ '--selection-sheen-x': `${sheen.x}%`, '--selection-sheen-opacity': sheen.opacity, '--selection-illumination': sheen.illumination } as CSSProperties} />
  </div>;
}

function ResumeInterior({ id, time, width: w, height: h, morph, unit }: { id: number; time: number; width: number; height: number; morph: number; unit: number }) {
  const widths = [.67, .49, .62, .4, .58], left = mix(w * .13, 58 * unit, morph), bw = mix(w * .73, w - 82 * unit, morph);
  const avatarSize = mix(w * .13, 20 * unit, morph), avatarX = mix(w * .13, 15 * unit, morph), avatarY = mix(w * .13, h / 2 - avatarSize / 2, morph);
  return <>
    <span className="rv-journey-resume-avatar" style={{ left: avatarX, top: avatarY, width: avatarSize, height: avatarSize }} />
    <i className="rv-journey-resume-name" style={{ left: w * .33, top: w * .13, width: w * .43, height: Math.max(2, w * .035), opacity: 1 - morph }} />
    <i className="rv-journey-resume-sub" style={{ left: w * .33, top: w * .21, width: w * .28, height: Math.max(2, w * .025), opacity: 1 - morph }} />
    {[0, 1, 2, 3, 4].map(line => {
      const progress = line < 3 ? assessmentProgress(time, line) : ease((time - 5.3 - (line - 3) * .1) / 1);
      const bodyY = line < 3 ? mix(h * (.4 + line * .105), h * (.4 + line * .175) + 13 * unit, progress) : mix(h * (.4 + line * .105), h * .75 + 13 * unit, progress);
      const label = line < 3 ? ease((progress - .58) / .4) * (1 - morph) : 0, value = line < 3 ? scoreValue(id, line, time) : 0;
      const joinedWidth = bw / 3 - 3 * unit;
      return <div key={line} className="rv-journey-body-line" data-body-line={line} style={{ left: left + morph * Math.min(line, 2) * (joinedWidth + 3 * unit), top: mix(bodyY, h / 2 - 3 * unit, morph), width: mix(mix(w * widths[(line + id) % 5], bw, progress), joinedWidth, morph), height: mix(Math.max(3 * unit, w * .023), 5 * unit, progress), opacity: line >= 3 ? 1 - progress : 1 }}>
        {line < 3 && <><span className="rv-journey-dimension" style={{ opacity: label, fontSize: 12 * unit }}>{DIMENSIONS[line]}</span><span className="rv-journey-score" style={{ opacity: label, fontSize: 12 * unit }}>{Math.round(value)}</span><i className="rv-journey-score-fill" style={{ width: `${value}%`, opacity: progress }} /></>}
      </div>;
    })}
  </>;
}
