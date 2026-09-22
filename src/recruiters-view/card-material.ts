import { FOIL_STOPS, type CardThemeName } from './card-theme.ts';

// Visual tokens from codex/recruiters-glass-leaderboard-zhaoyuan.
// Candidate content and motion remain owned by the campaign.
// The PK branch's Opal silver (pewter) is the default outside the top 30%.
export const STORY_COLORS = {
  text: '#292332',
  secondary: '#4c4257',
  label: '#51465c',
  accents: { standard: '#505963', gold: '#674816', silver: '#465164', bronze: '#784632' } satisfies Record<CardThemeName, string>,
} as const;

export const STORY_NUMBER_FINISH = {
  standard: { highlight: '#b4bdc8', light: '#87929f', dark: '#39434e' },
  gold: { highlight: '#c2ab7b', light: '#96743d', dark: '#593d14' },
  silver: { highlight: '#b8c3d1', light: '#8593a5', dark: '#384456' },
  bronze: { highlight: '#c59e87', light: '#a5755e', dark: '#633826' },
} satisfies Record<CardThemeName, { highlight: string; light: string; dark: string }>;

export const STORY_GLASS_COLORS = {
  standard: ['#dff5fa', '#a7bacf', '#d8ccea'],
  gold: ['#ffe8bd', '#d8bf96', '#e6ddec'],
  silver: ['#e1f5ff', '#aebfda', '#d3cdea'],
  bronze: ['#f2cfad', '#c79681', '#e7bccb'],
} satisfies Record<CardThemeName, readonly [string, string, string]>;

export const STORY_FOILS = {
  standard: {
    edge: '#bdcbd7',
    palette: ['#b8c5d1', '#cbdce5', '#dfeaf0', '#f2f7fa', '#ffffff', '#edf5f5', '#d6e6e7', '#d4d8e7', '#ded7ec', '#eef0f7'],
    corner: '#f1fbff', near: '#d9f0ed66', far: '#c9bce15c', reflection: '#e8e2fa80',
  },
  gold: {
    edge: '#d8b365',
    palette: ['#ca8fa6', '#eca371', '#edba3d', '#ffe991', '#fffbe6', '#ffedb0', '#efe1b1', '#e3bad0', '#a087c6', '#8f9fd8'],
    corner: '#ffd16a', near: '#efc45577', far: '#9ab8e266', reflection: '#fff0b480',
  },
  silver: {
    edge: '#c4cfdd',
    palette: ['#abb2cb', '#c2c9e1', '#d9e0ef', '#f1f4fb', '#ffffff', '#eaf0f8', '#d2d9e9', '#ddd4f0', '#b9afe0', '#c8bde4'],
    corner: '#f5f8fc', near: '#eef5fc85', far: '#bbaeea63', reflection: '#f0efff96',
  },
  bronze: {
    edge: '#b58670',
    palette: ['#a37b9c', '#bb7d68', '#c68e6d', '#dcba9b', '#ead4c1', '#dfbea7', '#cba183', '#b88a94', '#9e77a0', '#b48fa7'],
    corner: '#cc9b72', near: '#b3795270', far: '#ac849b75', reflection: '#d5b79e40',
  },
} as const;

export function rankingStoryFoilColors(theme: CardThemeName) {
  const foil = STORY_FOILS[theme];
  const bands = foil.palette.map((color, i) => `${color} calc(${FOIL_STOPS[i] * 100}% + var(--rainbow-shift))`).join(', ');
  return `radial-gradient(ellipse 65% 38% at 0% 0%, ${foil.corner}, transparent), radial-gradient(ellipse 70% 60% at 100% 100%, ${foil.far}, transparent), radial-gradient(ellipse 70% 60% at 100% 85%, ${foil.near}, transparent), linear-gradient(var(--rainbow-angle), ${bands})`;
}

export function rankingStoryLogo(theme: CardThemeName) {
  return `/recruiters-view/brand/metix-logo-relief-${theme === 'standard' ? 'silver' : theme}.svg`;
}
export const STORY_TEXTURE = '/recruiters-view/material/metix-mark-engraved.svg';
export const STORY_GRAIN = '/recruiters-view/material/metix-satin-grain.svg';
export const STORY_SILK = '/recruiters-view/material/metix-silk-relief.svg';
