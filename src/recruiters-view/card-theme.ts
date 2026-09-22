import type { RankDisplay } from './types';

export const CARD_THEMES = {
  standard: { name: 'Opal silver', base: '#f5f8fa', ink: '#505963', edge: '#bdcbd7', glow: ['#dceff4', '#e5def0', '#ffffff'], tiltX: 1.5, tiltY: 2, lift: 2 },
  gold: { name: 'Champagne gold', base: '#fffdf5', ink: '#89621c', edge: '#d2b97a', glow: ['#f4d0e9', '#d7f4e9', '#f2dda6'], tiltX: 4, tiltY: 6, lift: 4 },
  silver: { name: 'Ice silver', base: '#f8fcff', ink: '#52667e', edge: '#b6c9db', glow: ['#d3eafb', '#e5ddfa', '#edf5f9'], tiltX: 4, tiltY: 6, lift: 4 },
  bronze: { name: 'Rose copper', base: '#fff8f3', ink: '#a3634c', edge: '#d7a18c', glow: ['#f5c9c3', '#f3dfba', '#dfd4ef'], tiltX: 4, tiltY: 6, lift: 4 },
} as const;
export type CardThemeName = keyof typeof CARD_THEMES;
// The supplied elyx-card.html embeds this foil texture and uses these stops.
export const FOIL_TEXTURE = '/recruiters-view/material/elyx-foil.webp';
export const FOIL_STOPS = [0, .16, .25, .32, .43, .51, .57, .69, .83, 1] as const;
export const FOIL_PALETTES = {
  gold: ['#a669c0', '#ff8989', '#ffdb89', '#ffffdc', '#ffffff', '#eafff5', '#b9ffed', '#d9b6e9', '#8770d6', '#6683ff'],
  silver: ['#929bcf', '#a9c7f5', '#c5e6f8', '#e2f5ff', '#ffffff', '#f0f9ff', '#c5eee8', '#cdc6ec', '#819ce0', '#4fb6f5'],
  bronze: ['#bb7cc5', '#ef879e', '#f8c28c', '#ffe9cb', '#fff5eb', '#fcebe4', '#eedbc6', '#e8aecb', '#b480ce', '#c992d6'],
} as const;

export function foilColors(theme: CardThemeName): string {
  if (theme === 'standard') return '#ffffff';
  const palette = FOIL_PALETTES[theme];
  const bands = palette.map((color, index) => `${color} calc(${FOIL_STOPS[index] * 100}% + var(--rainbow-shift))`).join(', ');
  const corner = theme === 'gold' ? '#ffdb89' : theme === 'silver' ? '#d2eeff' : '#ffd0a0';
  const far = theme === 'gold' ? '#00b7ff99' : theme === 'silver' ? '#97b5ff88' : '#e292c477';
  const near = theme === 'gold' ? '#00ff9355' : theme === 'silver' ? '#93f0e655' : '#ffc49b66';
  return `radial-gradient(ellipse 65% 38% at 0% 0%, ${corner}, transparent), radial-gradient(ellipse 70% 60% at 100% 100%, ${far}, transparent), radial-gradient(ellipse 70% 60% at 100% 85%, ${near}, transparent), linear-gradient(var(--rainbow-angle), ${bands})`;
}

export function cardThemeName(ranking: RankDisplay): CardThemeName {
  if (ranking.kind !== 'exact' || !Number.isInteger(ranking.rank) || !Number.isInteger(ranking.poolSize)
    || ranking.rank < 1 || ranking.rank > ranking.poolSize) return 'standard';
  // Material reflects the exact percentile; avatar podium frames still use absolute rank.
  if (ranking.rank * 10 <= ranking.poolSize) return 'gold';
  if (ranking.rank * 5 <= ranking.poolSize) return 'silver';
  if (ranking.rank * 10 <= ranking.poolSize * 3) return 'bronze';
  return 'standard';
}
