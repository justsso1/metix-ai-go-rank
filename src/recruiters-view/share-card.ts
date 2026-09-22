import { SITE_LABEL } from "./site.ts";
/** General entry-page cover only. Personal cards use ranking-card.ts everywhere. */
export const SHARE_CARD_WIDTH = 1200;
export const SHARE_CARD_HEIGHT = 630;
export const SHARE_CARD_LOGO = '/assets/img/metix-logo.png';
export function drawEntryCover(ctx: CanvasRenderingContext2D, logo: CanvasImageSource) {
  ctx.fillStyle = '#f7f7f5'; ctx.fillRect(0, 0, 1200, 630);
  ctx.beginPath(); ctx.roundRect(20, 20, 1160, 590, 28); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.strokeStyle = '#dedbea'; ctx.stroke();
  ctx.drawImage(logo, 64, 59, 192, 36);
  const text = (value: string, y: number, size: number, color = '#161514') => { ctx.font = `500 ${size}px Sora`; ctx.fillStyle = color; ctx.fillText(value, 64, y); };
  text('Every recruiter search',221,47); text('creates a ranking.',283,47); text('Now you can see yours.',368,47,'#4b3fd4');
  ctx.font = '400 24px Geist'; ctx.fillStyle = '#75736f'; ctx.fillText('Paste your LinkedIn URL to find out.',64,429);
  ctx.font = '400 19px Geist'; ctx.fillStyle = '#161514'; ctx.fillText(SITE_LABEL,64,565);
}
