import { cardLayout, rankingCardSvg } from './ranking-card';
import { cardThemeName } from './card-theme';
import { STORY_TEXTURE, STORY_GRAIN, STORY_SILK, rankingStoryLogo } from './card-material';
import { podiumFrame } from './podium-frame';
import type { RankLookupFound } from './types';
const assets = new Map<string, Promise<string>>();
function inlineAsset(path: string) {
  if (!assets.has(path)) assets.set(path, fetch(path).then(response => {
    if (!response.ok) throw new Error('Image asset unavailable');
    return response.blob();
  }).then(blob => new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob);
  })).catch(error => { assets.delete(path); throw error; }));
  return assets.get(path)!;
}
export async function createShareCardPng(result: RankLookupFound, width = 640): Promise<Blob> {
  const frame = podiumFrame(result.ranking.kind === 'exact' ? result.ranking.rank : undefined);
  const [avatar, foil, grain, silk, logo, geist, sora, avatarFrame] = await Promise.all([
    result.profile.avatar ? inlineAsset(result.profile.avatar) : undefined,
    inlineAsset(STORY_TEXTURE), inlineAsset(STORY_GRAIN), inlineAsset(STORY_SILK),
    inlineAsset(rankingStoryLogo(cardThemeName(result.ranking))),
    inlineAsset('/assets/fonts/geist-sans.woff2'), inlineAsset('/assets/fonts/sora.woff2'),
    frame ? inlineAsset(frame.src) : undefined,
  ]);
  const fontCss = `@font-face{font-family:Geist;src:url(${geist});font-weight:100 900}@font-face{font-family:Sora;src:url(${sora});font-weight:100 900}`;
  const svg = rankingCardSvg(result, width, { avatar, foil, grain, silk, logo, fontCss, podiumFrame: avatarFrame });
  const { height } = cardLayout(result, width);
  const source = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Could not render the card')); image.src = source; });
    const canvas = document.createElement('canvas'); canvas.width = Math.round(width) * 2; canvas.height = height * 2;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Image export is unavailable');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image export failed')), 'image/png'));
  } finally { URL.revokeObjectURL(source); }
}
