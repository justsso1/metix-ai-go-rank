import { type CSSProperties, type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LayoutGroup, motion, type MotionStyle, useMotionTemplate, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { CARD_THEMES, cardThemeName } from './card-theme';
import { formatRankingTime, showsJobMatches, scopeLabel, topPercent } from './campaign';
import { campaignAddress } from './routes';
import { HOW_CALCULATED } from './mock';
import { hasSeenRanking, leaderboardRankWidth, leaderboardRows, ownRankedPerson, rankingIdentity, rememberRanking } from './leaderboard';
import { cardLayout, rankingCardSvg } from './ranking-card';
import { STORY_COLORS, STORY_FOILS, STORY_NUMBER_FINISH, rankingStoryFoilColors } from './card-material';
import { cardStory } from './card-story';
import ShareActions from './ShareActions';
import PodiumBadge from './PodiumBadge';
import type { RankLookupFound, RankedPerson } from './types';
import LeaderboardOmission from './LeaderboardOmission';

type Phase = 'list' | 'focus' | 'expand' | 'landed' | 'settled' | 'update';
const layoutTransition = { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] };

function initialPhase(result: RankLookupFound, requested: boolean): Phase {
  return requested && typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    && !hasSeenRanking(result) ? 'list' : 'settled';
}

export default function ResultStage({ result, reveal, ready, updated = false, onImprove, onExplore, presenting = false }: {
  result: RankLookupFound; reveal: boolean; ready: boolean; updated?: boolean; onImprove: () => void; onExplore?: () => void; presenting?: boolean;
}) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(() => initialPhase(result, reveal) === 'list' ? 'list' : updated && !hasSeenRanking(result) ? 'update' : 'settled');
  const stage = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const last = useRef<{ key: string; scope: string } | null>(null);
  const timers = useRef<number[]>([]);
  const scrollFrame = useRef(0);
  const interrupted = useRef(false);
  const identity = rankingIdentity(result);
  const scope = scopeLabel(result.query);
  const opening = phase === 'list' || phase === 'focus';
  const expanding = phase === 'expand' || phase === 'landed';
  const expanded = !opening;
  const canImprove = result.ranking.kind === 'exact' && result.ranking.rank > 3 && topPercent(result.ranking) !== null;
  const improvePrimary = cardStory(result).primaryAction === 'improve';
  const theme = cardThemeName(result.ranking);
  const rows = leaderboardRows(result);
  if (result.ranking.kind === 'band') rows.push({ person: ownRankedPerson(result), isYou: true });

  useEffect(() => {
    if (!ready) return;
    const previous = last.current;
    last.current = { key: identity, scope };
    rememberRanking(result);
    if (reduced) { setPhase('settled'); return; }
    if (!previous && opening) {
      timers.current = [
        window.setTimeout(() => setPhase('focus'), 200),
        window.setTimeout(() => setPhase('expand'), 450),
        window.setTimeout(() => setPhase('landed'), 1050),
        window.setTimeout(() => setPhase('settled'), 1800),
      ];
    } else if (!previous && phase === 'update') {
      timers.current = [window.setTimeout(() => setPhase('settled'), 650)];
    } else if (previous && previous.key !== identity) {
      setPhase(previous.scope === scope ? 'update' : 'settled');
      timers.current = [window.setTimeout(() => setPhase('settled'), 650)];
    }
    return () => timers.current.forEach(clearTimeout);
  }, [identity, ready, reduced]);

  useEffect(() => {
    const stop = () => { interrupted.current = true; cancelAnimationFrame(scrollFrame.current); };
    const keyStop = (event: KeyboardEvent) => { if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) stop(); };
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('touchstart', stop, { passive: true });
    window.addEventListener('pointerdown', stop, { passive: true });
    window.addEventListener('keydown', keyStop);
    const breakpoint = window.matchMedia('(min-width: 960px)');
    const resize = () => { timers.current.forEach(clearTimeout); stop(); setPhase('settled'); };
    breakpoint.addEventListener('change', resize);
    return () => {
      stop(); breakpoint.removeEventListener('change', resize);
      window.removeEventListener('wheel', stop); window.removeEventListener('touchstart', stop);
      window.removeEventListener('pointerdown', stop); window.removeEventListener('keydown', keyStop);
    };
  }, []);

  useEffect(() => {
    if (reduced || interrupted.current) return;
    const desktop = window.matchMedia('(min-width: 960px)').matches;
    const target = desktop ? stage.current : card.current;
    if ((desktop && phase !== 'list') || (!desktop && phase !== 'expand' && phase !== 'update') || !target) return;
    const rect = target.getBoundingClientRect();
    if (desktop && rect.top < window.innerHeight * 0.35) return;
    const from = window.scrollY;
    const inset = desktop ? 100 : (document.getElementById('nav')?.getBoundingClientRect().bottom ?? 72) + 20;
    const to = Math.max(0, from + rect.top - inset);
    const start = performance.now();
    const step = (time: number) => {
      if (interrupted.current) return;
      const progress = Math.min(1, (time - start) / 420);
      window.scrollTo({ top: from + (to - from) * (1 - Math.pow(1 - progress, 3)), behavior: 'instant' });
      if (progress < 1) scrollFrame.current = requestAnimationFrame(step);
    };
    scrollFrame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(scrollFrame.current);
  }, [phase, reduced]);

  return <LayoutGroup key={scope} id={`rv-${result.profile.handle}`}>
    <div ref={stage} className="rv-result-stage" data-phase={phase} data-current-rank={result.ranking.kind === 'exact' ? result.ranking.rank : result.ranking.label}
      style={{ '--board-rows': rows.length, '--card-row-end': rows.length + 2, '--rv-board-rank-width': `${leaderboardRankWidth(result)}px` } as CSSProperties}>
      <div className="rv-board-backdrop" aria-hidden="true" />
      <article className="rv-leaderboard" aria-labelledby={`rv-board-heading-${result.profile.handle}`}>
        <header className="rv-board-heading"><h3 id={`rv-board-heading-${result.profile.handle}`}>The leaderboard</h3><p>{scope}</p></header>
        <ol className="rv-board-rows" aria-label="Ranking leaderboard">
          {rows.map(({ person, isYou }, index) => {
            const gap = index > 0 && person.rank > rows[index - 1].person.rank + 1;
            const rowStyle = { '--row': index + 2, '--row-delay': `${index * 0.025}s` } as CSSProperties;
            return <motion.li layout="position" transition={reduced ? { duration: 0 } : layoutTransition} className={`rv-board-slot ${isYou ? 'is-you-slot' : ''} ${gap ? 'has-gap' : ''}`} key={isYou ? 'you' : person.id} style={rowStyle}>
              {isYou ? <>
                <div className={`rv-self-slot ${expanded ? 'is-expanded' : ''}`}>
                  {gap && <div className="rv-board-gap"><LeaderboardOmission /></div>}
                  {opening ? <motion.div data-rank={person.rank} layoutId="ranking-card" transition={layoutTransition} className={`rv-board-entry is-you is-${theme} rv-source-self ${phase === 'focus' ? 'is-focused' : ''}`} style={{ borderRadius: 14 }}>
                    <Identity person={person} shared /><motion.span layoutId="rank" layout="position" className="rv-board-rank">{result.ranking.kind === 'exact' ? `#${person.rank}` : result.ranking.label}</motion.span>
                  </motion.div> : <div data-rank={person.rank} className={`rv-board-entry is-you is-${theme} rv-self-compact ${phase === 'expand' ? 'is-placeholder' : ''}`} aria-hidden={phase === 'expand' || undefined}>
                    <Identity person={person} /><span className="rv-board-rank">{result.ranking.kind === 'exact' ? `#${person.rank}` : result.ranking.label}</span>
                    {canImprove && <button type="button" className={`rv-improve-button${improvePrimary ? ' is-primary' : ''}${improvePrimary && phase === 'settled' && !presenting ? ' is-ready' : ''}`} onClick={onImprove} disabled={phase === 'expand'}>Improve ranking <ArrowRight size={improvePrimary ? 15 : 13} aria-hidden="true" /></button>}
                  </div>}
                </div>
              </> : <div className={`rv-other-slot ${gap ? 'has-gap' : ''}`}>
                {gap && <div className="rv-board-gap"><LeaderboardOmission /></div>}
                <div data-rank={person.rank} className={`rv-board-entry is-${cardThemeName({ kind: 'exact', rank: person.rank, poolSize: result.ranking.poolSize })}`}>
                  <span className="rv-board-rank">#{person.rank}</span><Identity person={person} />
                </div>
              </div>}
            </motion.li>;
          })}
        </ol>
        <footer className="rv-board-footer">
          <p className="rv-rank-updated">Ranking updated <time dateTime={result.rankedAt}>{formatRankingTime(result.rankedAt)}</time></p>
          <details className="rv-calc"><summary>How is this calculated?</summary><p>{HOW_CALCULATED}</p></details>
        </footer>
      </article>
      {expanded && <motion.div ref={card} className={`rv-detail-shell ${expanding ? 'is-revealing' : ''} ${phase === 'update' ? 'is-updating' : ''}`} layoutId="ranking-card" transition={reduced ? { duration: 0 } : layoutTransition} style={{ borderRadius: 20 }}>
        <RankingCard result={result} interactive={phase === 'settled' && !presenting} shared={expanding} reveal={expanding} share prepareImage={!presenting} />
        {showsJobMatches(result) && <div className="rv-opportunity-entry">
          <h2>Where could your experience take you?</h2>
          <a className="rv-opportunity-link" href={campaignAddress(result, 'opportunities')} onClick={event => { if (onExplore && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onExplore(); } }}>Explore opportunities <ArrowRight size={14} /></a>
        </div>}
      </motion.div>}
    </div>
  </LayoutGroup>;
}

function Identity({ person, shared = false, full = false }: { person: RankedPerson; shared?: boolean; full?: boolean }) {
  return <div className={`rv-identity ${full ? 'is-full' : ''}`}>
    <motion.div layoutId={shared ? 'avatar' : undefined} layout="position" className="rv-identity-avatar" aria-hidden="true">
      {person.avatar ? <img src={person.avatar} alt="" /> : person.fullName.slice(0, 1)}
      <PodiumBadge rank={person.rank} />
    </motion.div>
    <div className="rv-identity-copy"><motion.b layoutId={shared ? 'name' : undefined} layout="position">{person.fullName}</motion.b><p>{full ? person.headline : `${person.title} · ${person.company}`}</p></div>
  </div>;
}

export function RankingCard({ result, interactive = false, shared = false, reveal = false, share = false, prepareImage = true }: {
  result: RankLookupFound; interactive?: boolean; shared?: boolean; reveal?: boolean; share?: boolean; prepareImage?: boolean;
}) {
  const sensor = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const themeName = cardThemeName(result.ranking);
  const theme = CARD_THEMES[themeName];
  const material = STORY_FOILS[themeName], finish = STORY_NUMBER_FINISH[themeName];
  const ink = STORY_COLORS.accents[themeName];
  const pointer = useCardPointer(sensor, interactive && !reduced, themeName !== 'standard');
  const rotateX = useTransform(pointer.y, [-1, 1], [theme.tiltX, -theme.tiltX]);
  const rotateY = useTransform(pointer.x, [-1, 1], [-theme.tiltY, theme.tiltY]);
  const lift = useTransform(pointer.strength, [0, 1], [0, -theme.lift]);
  const foilX = useMotionTemplate`${useTransform(pointer.x, [-1, 1], [0, 100])}%`;
  const foilY = useMotionTemplate`${useTransform(pointer.y, [-1, 1], [0, 100])}%`;
  const bandX = useMotionTemplate`${useTransform(pointer.x, [-1, 1], [75, 25])}%`;
  const bandY = useMotionTemplate`${useTransform(pointer.y, [-1, 1], [75, 25])}%`;
  const rainbowAngle = useTransform(() => 45 + (rotateY.get() - rotateX.get()) * .8);
  const rainbowShift = useTransform(() => (rotateY.get() + rotateX.get()) * 1.4);
  const angle = useMotionTemplate`${rainbowAngle}deg`;
  const shift = useMotionTemplate`${rainbowShift}%`;
  const [width, setWidth] = useState(640);
  // Resolve the responsive artwork before paint and before a route transition
  // captures its destination. A passive effect can expose the 640px fallback.
  useLayoutEffect(() => {
    const node = sensor.current; if (!node) return;
    const resize = () => setWidth(Math.max(280, Math.round(node.clientWidth)));
    resize(); const observer = new ResizeObserver(resize); observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const geometry = useMemo(() => cardLayout(result, width), [result, width]);
  const artwork = useMemo(() => rankingCardSvg(result, width), [result, width]);
  useNumberReflection(sensor, interactive && !reduced && themeName === 'standard', result, width);
  return <div className="rv-card-with-actions">
    <div ref={sensor} className="rv-card-sensor" style={{ aspectRatio: `${geometry.width} / ${geometry.height}` } as CSSProperties}>
      <div className="rv-card-flight">
      <motion.article className={`rv-full-card rv-theme-${themeName} ${shared ? 'rv-reveal-identity' : ''}`} data-theme={themeName} data-card-story={geometry.story.kind} data-card-width={width} style={{ '--card-text-ink': STORY_COLORS.text, '--reveal-light': material.reflection, '--material-base': theme.base, '--material-edge': material.edge, '--material-ink': ink, '--number-highlight': finish.highlight, '--number-light': finish.light, '--number-dark': finish.dark,
        '--card-colors': rankingStoryFoilColors(themeName), '--rainbow-angle': angle, '--rainbow-shift': shift,
        '--foil-x': foilX, '--foil-y': foilY, '--foil-band-x': bandX, '--foil-band-y': bandY, '--foil-active': pointer.strength,
        viewTransitionName: 'ranking-card', rotateX, rotateY, y: lift, transformPerspective: 1100 } as MotionStyle}>
        <div className="rv-card-artwork" dangerouslySetInnerHTML={{ __html: artwork }} />
        {shared && <div className="rv-card-continuity" aria-hidden="true">
          <motion.div layoutId="avatar" layout="position" className="rv-identity-avatar" style={{ position: 'absolute', left: geometry.pad, top: geometry.identityY, width: 48, height: 48 }}>{result.profile.avatar ? <img src={result.profile.avatar} alt="" /> : result.profile.fullName[0]}<PodiumBadge rank={result.ranking.kind === 'exact' ? result.ranking.rank : undefined} /></motion.div>
          <motion.b layoutId="name" layout="position" style={{ position: 'absolute', left: geometry.pad + 61, top: geometry.nameY - geometry.nameSize, fontSize: geometry.nameSize, lineHeight: '24px', fontWeight: 600, maxWidth: geometry.inner - 61 }}>{result.profile.fullName}</motion.b>
          <motion.strong layoutId="rank" layout="position" style={{ position: 'absolute', left: geometry.rankX, top: geometry.rankY - geometry.rankSize, font: `620 ${geometry.rankSize}px/1 Sora, sans-serif`, letterSpacing: geometry.rankSpacing, color: ink }}><span className="rv-glass-rank">{geometry.hasHash && <span style={{ fontSize: geometry.hashSize, fontWeight: 350, letterSpacing: 0, marginRight: 8 }}>#</span>}{geometry.rankDigits}</span></motion.strong>
        </div>}
        <div className="rv-card-flight-light" aria-hidden="true"><i /></div>
        <i className="rv-corner-glint" aria-hidden="true" />
        {themeName === 'standard' ? <div className="rv-card-material" aria-hidden="true"><div className="rv-material-glare" /></div> : <div className="rv-card-material" aria-hidden="true">
          <div className="rv-material-iridescence" /><div className="rv-material-glare" />
          <div className={`rv-material-sweep ${reveal ? 'is-playing' : ''}`}><i /><i /></div>
        </div>}
      </motion.article>
      </div>
    </div>
    {share && <ShareActions result={result} width={width} prepareImage={prepareImage} />}
  </div>;

}

/** Keep the imported pointer light on our shared SVG, without changing rank geometry. */
function useNumberReflection(sensor: RefObject<HTMLElement | null>, enabled: boolean, result: RankLookupFound, width: number) {
  const light = useSpring(0, { stiffness: 220, damping: 30 });
  useEffect(() => {
    const surface = sensor.current;
    if (!surface) return;
    // The artwork is replaced when its responsive SVG is rendered again.
    // Delegate to the stable sensor and resolve the current SVG for each frame.
    const paint = (value: number) => surface.querySelector('.rv-art-number-reflection')?.setAttribute('opacity', String(value));
    light.jump(0);
    paint(0);
    if (!enabled) return;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reset = () => light.set(0);
    const unsubscribe = light.on('change', paint);
    const move = (event: PointerEvent) => {
      if (!fine.matches || event.pointerType === 'touch') { reset(); return; }
      const rank = event.target instanceof Element ? event.target.closest<SVGGElement>('.rv-art-rank-number') : null;
      const gradient = surface.querySelector<SVGRadialGradientElement>('.rv-art-number-light');
      if (!rank || !gradient) { reset(); return; }
      const matrix = rank.getScreenCTM();
      if (!matrix) return;
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      gradient.setAttribute('gradientTransform', `translate(${point.x} ${point.y}) scale(1 .8125)`);
      light.set(1);
    };
    surface.addEventListener('pointermove', move);
    surface.addEventListener('pointerleave', reset);
    fine.addEventListener('change', reset);
    window.addEventListener('blur', reset);
    window.addEventListener('scroll', reset, { passive: true });
    return () => {
      unsubscribe(); light.jump(0); paint(0);
      surface.removeEventListener('pointermove', move); surface.removeEventListener('pointerleave', reset);
      fine.removeEventListener('change', reset);
      window.removeEventListener('blur', reset); window.removeEventListener('scroll', reset);
    };
  }, [sensor, enabled, result, width, light]);
}

function useCardPointer(sensor: RefObject<HTMLElement | null>, enabled: boolean, podium: boolean) {
  const spring = { stiffness: podium ? 180 : 220, damping: podium ? 22 : 26, mass: 0.8 };
  const x = useSpring(0, spring);
  const y = useSpring(0, spring);
  const strength = useSpring(0, spring);
  const reset = () => { x.set(0); y.set(0); strength.set(0); };
  useEffect(() => {
    const fine = window.matchMedia('(min-width: 960px) and (hover: hover) and (pointer: fine)');
    if (!enabled) { reset(); return; }
    let frame = 0;
    const move = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      if (!fine.matches) { reset(); return; }
      frame = requestAnimationFrame(() => {
        const container = sensor.current;
        if (!container || event.pointerType === 'touch') { reset(); return; }
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('.rv-share-actions, .rv-board-entry, .rv-board-heading, .rv-below, dialog, button, a, summary')
          || (target?.closest('.rv-leaderboard') && !container.contains(target))) { reset(); return; }
        // Measure the stationary sensor, never the transformed surface.
        const rect = container.getBoundingClientRect();
        const distance = Math.max(rect.left - event.clientX, event.clientX - rect.right, rect.top - event.clientY, event.clientY - rect.bottom, 0);
        const proximity = Math.max(0, 1 - distance / 120);
        x.set(Math.max(-1, Math.min(1, (event.clientX - rect.left - rect.width / 2) / (rect.width / 2))) * proximity);
        y.set(Math.max(-1, Math.min(1, (event.clientY - rect.top - rect.height / 2) / (rect.height / 2))) * proximity);
        strength.set(proximity);
      });
    };
    window.addEventListener('pointermove', move, { passive: true });
    fine.addEventListener('change', reset);
    document.addEventListener('pointerleave', reset);
    window.addEventListener('blur', reset);
    window.addEventListener('scroll', reset, { passive: true });
    return () => { cancelAnimationFrame(frame); fine.removeEventListener('change', reset); window.removeEventListener('pointermove', move); document.removeEventListener('pointerleave', reset); window.removeEventListener('blur', reset); window.removeEventListener('scroll', reset); reset(); };
  }, [enabled, podium]);
  return { x, y, strength, reset };
}
