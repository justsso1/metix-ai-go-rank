import { SITE_LABEL } from "./site.ts";
import { cardThemeName, FOIL_STOPS } from './card-theme.ts';
import { STORY_COLORS, STORY_FOILS, STORY_NUMBER_FINISH, STORY_TEXTURE, STORY_GRAIN, STORY_SILK, rankingStoryLogo } from './card-material.ts';
import { scopeLabel } from './campaign.ts';
import { cardStory, rankingCardStats } from './card-story.ts';
import { podiumFrame } from './podium-frame.ts';
import { keywordTextWidth } from './keyword-metrics.ts';
import type { RankLookupFound } from './types';
export { PEOPLE_PER_PAGE, rankingCardStats } from './card-story.ts';

export type CardAssets = { avatar?: string; foil?: string; grain?: string; silk?: string; logo?: string; fontCss?: string; podiumFrame?: string };
const esc = (s: string | number) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const number = (n: number) => new Intl.NumberFormat('en-US').format(n);
// Shared line breaking, coordinates and typography for the page, PNG and OG.
function length(text: string, size: number) {
  return [...text].reduce((sum, c) => sum + (/[ilI.,'’ :]/.test(c) ? .25 : /[MW@]/.test(c) ? .87 : /[A-Z]/.test(c) ? .64 : .52) * size, 0);
}
// Advance widths from the bundled Sora font. Rank digits are proportional.
const rankGlyphs: Record<string, number> = { '#': .692, '0': .743, '1': .420, '2': .618, '3': .614, '4': .642, '5': .623, '6': .659, '7': .574, '8': .637, '9': .659, ',': .25 };
function rankAdvance(text: string, size: number, spacing = -4) {
  return [...text].reduce((sum, char) => sum + (rankGlyphs[char] ?? .65) * size, 0) + Math.max(0, text.length - 1) * spacing;
}
function wrap(text: string, width: number, size: number, measure = length): string[] {
  const lines: string[] = []; let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && measure(`${line} ${word}`, size) > width) { lines.push(line); line = ''; }
    if (measure(word, size) > width) {
      for (const ch of word) { if (measure(line + ch, size) > width) { lines.push(line); line = ''; } line += ch; }
    } else line += `${line ? ' ' : ''}${word}`;
  }
  if (line) lines.push(line);
  return lines;
}
function storyLines(headline: string, highlight: string, width: number, size: number) {
  const start = highlight ? headline.lastIndexOf(highlight) : -1;
  const lines: { text: string; accent: boolean }[][] = [[]];
  let position = 0;
  for (const paragraph of headline.split('\n')) {
    if (lines[lines.length - 1].length) lines.push([]);
    const runs: { text: string; accent: boolean }[] = [];
    for (const word of paragraph.split(/\s+/)) {
      const index = headline.indexOf(word, position); position = index + word.length;
      const accent = start >= 0 && index < start + highlight.length && position > start;
      // Keep emphasized phrases such as “page 4” together at every width.
      if (accent && runs.at(-1)?.accent) runs[runs.length - 1].text += ` ${word}`;
      else runs.push({ text: word, accent });
    }
    for (const run of runs) {
      let line = lines[lines.length - 1];
      if (line.length && length([...line.map(item => item.text), run.text].join(' '), size) > width) {
        line = []; lines.push(line);
      }
      line.push(run);
    }
  }
  return lines;
}
export function cardLayout(result: RankLookupFound, width = 640) {
  width = Math.max(280, Math.round(width));
  const pad = width < 420 ? 22 : 32, inner = width - pad * 2;
  const nameSize = width < 420 ? 17 : 19;
  const name = wrap(result.profile.fullName, inner - 61, nameSize);
  const headline = wrap(result.profile.headline, inner - 61, 12);
  const scope = wrap(scopeLabel(result.query), inner - 80, 11);
  const headerBottom = 58 + scope.length * 16;
  const identityY = headerBottom + 18, nameY = identityY + 18;
  const headlineY = nameY + (name.length - 1) * 24 + 20;
  const story = cardStory(result);
  const storySize = width < 420 ? 23 : 28, storyLeading = storySize * 1.22;
  const storyY = Math.max(identityY + 48, headlineY + (headline.length - 1) * 18) + 34;
  const narrative = storyLines(story.headline, story.highlight, inner, storySize);
  let rankSize = width < 420 ? 80 : 104;
  const rank = result.ranking.kind === 'exact' ? `#${number(result.ranking.rank)}` : result.ranking.label;
  const hasHash = rank.startsWith('#');
  const rankDigits = hasHash ? rank.slice(1) : rank;
  const rankSpacing = -2;
  const rankMeasure = (size: number) => rankAdvance(rankDigits, size, rankSpacing) + (hasHash ? size * .42 * rankGlyphs['#'] + 8 : 0);
  const oldRank = story.comparison ? `#${number(story.comparison.rank)}` : '';
  let oldRankSize = width < 420 ? 25 : 36;
  while (rankAdvance(oldRank, oldRankSize, -1) > inner * .3 && oldRankSize > 16) oldRankSize--;
  const oldRankWidth = oldRank ? rankAdvance(oldRank, oldRankSize, -1) : 0;
  const rankX = pad + (oldRank ? oldRankWidth + 30 : 0);
  while (rankMeasure(rankSize) > inner - (rankX - pad) && rankSize > 28) rankSize -= 2;
  const hashSize = rankSize * .42;
  const rankDigitsX = rankX + (hasHash ? hashSize * rankGlyphs['#'] + 8 : 0);
  const rankY = storyY + (narrative.length - 1) * storyLeading + rankSize + 18;
  const rankWidth = rankMeasure(rankSize);
  const poolSize = 13, poolText = `of ${number(result.ranking.poolSize)} people`;
  const poolWidth = Math.max(length(poolText, poolSize), 100);
  const poolWrap = rankX + rankWidth + 30 + poolWidth > width - pad;
  const poolX = poolWrap ? pad + 14 : rankX + rankWidth + 30;
  const poolY = poolWrap ? rankY + 28 : rankY - 20;
  const contextY = rankY + (poolWrap ? 82 : 36);
  const stats = rankingCardStats(result);
  const metricsY = contextY + 60;
  const metricWidth = inner / 2, metricInset = width < 420 ? 12 : 18;
  const metrics = (story.comparison ? [
    { label: 'People you passed', value: number(story.comparison.passed), suffix: '', note: '' },
    { label: 'TOP SEARCH YOU APPEAR IN', value: `“${result.topSearch}”`, suffix: '', note: '' },
    { label: 'Your page', value: `Page ${number(stats.page!)}`, suffix: '', note: `Was page ${number(story.comparison.page)}` },
    { label: 'Recruiter reply score', value: stats.replyScore === null ? 'Not available' : stats.replyScore.toFixed(1), suffix: stats.replyScore === null ? '' : ' / 5', note: '' },
  ] : [
    { label: 'People ahead of you', value: stats.ahead === null ? 'Not available' : number(stats.ahead), suffix: '', note: '' },
    { label: 'People behind you', value: stats.behind === null ? 'Not available' : number(stats.behind), suffix: '', note: '' },
    { label: 'Your page', value: stats.page === null ? 'Not available' : `Page ${number(stats.page)}`, suffix: '', note: '' },
    { label: 'Recruiter reply score', value: stats.replyScore === null ? 'Not available' : stats.replyScore.toFixed(1), suffix: stats.replyScore === null ? '' : ' / 5', note: '' },
  ]).map(metric => ({ ...metric, labelLines: wrap(metric.label, metricWidth - metricInset * 2, 10),
    searchLines: metric.label === 'TOP SEARCH YOU APPEAR IN' ? wrap(metric.value, metricWidth - metricInset * 2, 13) : null }));
  const metricLabelLines = Math.max(...metrics.map(metric => metric.labelLines.length));
  const metricRowHeight = 74 + (metricLabelLines - 1) * 13;
  const firstMetricRowHeight = Math.max(metricRowHeight, ...metrics.slice(0, 2).map(metric => metric.searchLines ? 40 + (metricLabelLines - 1) * 13 + metric.searchLines.length * 19 : 0));
  const metricsHeight = firstMetricRowHeight + metricRowHeight;
  const searchLabelY = metricsY + metricsHeight + 27;
  const searchSize = width < 420 ? 14 : 16;
  const search = wrap(`“${result.topSearch}”`, inner, searchSize);
  let tagX = pad, tagY = story.comparison ? metricsY + metricsHeight + 20 : searchLabelY + 14 + search.length * 22 + 12;
  let tagRowHeight = 26;
  const tags = result.keywords.map(text => {
    const lines = wrap(text, inner - 20, 11, keywordTextWidth);
    const w = Math.min(inner, Math.ceil(Math.max(0, ...lines.map(line => keywordTextWidth(line, 11)))) + 20);
    const height = 26 + Math.max(0, lines.length - 1) * 15;
    if (tagX > pad && tagX + w > width - pad) { tagX = pad; tagY += tagRowHeight + 8; tagRowHeight = 26; }
    tagRowHeight = Math.max(tagRowHeight, height);
    const tag = { text, lines, x: tagX, y: tagY, width: w, height }; tagX += w + 7; return tag;
  });
  const footerY = tagY + tagRowHeight + 22;
  return { width, height: Math.ceil(footerY + 46), footerY, headerBottom, hasHash, hashSize, rankDigits, rankDigitsX, rankSpacing, poolX, poolY, pad, inner, nameSize, name, headline, identityY, nameY, headlineY, story, storyY, storySize, storyLeading, narrative, rankX, rankY, rankSize, rank, rankWidth, oldRank, oldRankSize, oldRankWidth, poolSize, poolText, poolWrap, contextY, scope, metricsY, metricWidth, metricInset, metricRowHeight, firstMetricRowHeight, metricsHeight, metricLabelLines, metrics, searchLabelY, searchSize, search, tags };
}

/** One artwork for the page, the reveal animation, PNG downloads and share previews. */
export function rankingCardSvg(result: RankLookupFound, width = 640, assets: CardAssets = {}) {
  const l = cardLayout(result, width), { pad, inner, height } = l;
  const frame = podiumFrame(result.ranking.kind === 'exact' ? result.ranking.rank : undefined);
  const type = cardThemeName(result.ranking), material = STORY_FOILS[type], finish = STORY_NUMBER_FINISH[type];
  const ink = STORY_COLORS.accents[type], muted = STORY_COLORS.secondary;
  const prefix = 'card-' + result.profile.handle.replace(/[^a-z0-9-]/gi, '') + '-' + l.width;
  const id = (s: string) => `${prefix}-${s}`;
  const url = (s: string) => `url(#${id(s)})`;
  const text = (str: string, x: number, y: number, size: number, color = STORY_COLORS.text as string, weight = 400, family = 'Geist, sans-serif', extra = '') => `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${color}" ${extra}>${esc(str)}</text>`;
  const multiline = (lines: string[], x: number, y: number, size: number, leading: number, color?: string, weight?: number) => lines.map((s, i) => text(s, x, y + i * leading, size, color, weight)).join('');
  const image = (source: string, x: number, y: number, w: number, h: number, extra = '') => `<image x="${x}" y="${y}" width="${w}" height="${h}" href="${esc(source)}" xlink:href="${esc(source)}" ${extra}/>`;
  const stats = rankingCardStats(result);
  // Compare with the other candidates; better ranks fill the rail toward the right.
  const aheadPercent = stats.behind === null || result.ranking.poolSize <= 1 ? null : stats.behind * 100 / (result.ranking.poolSize - 1);
  const progress = aheadPercent === null ? 0 : inner * aheadPercent / 100;
  const positionX = pad + progress, railY = l.contextY + 23;
  const captionOnRight = aheadPercent !== null && aheadPercent < 50;
  const markerLabelOnLeft = captionOnRight ? positionX - pad >= 40 : positionX + 40 > l.width - pad;
  const positionLabel = aheadPercent === null
    ? stats.behind === 0 ? 'No other people in this search.' : 'Your position in this search'
    : `You rank ahead of ${Math.floor(aheadPercent)}% of people.`;
  // Keep the caption close to the rail, on the open side of the marker and its label.
  const captionGap = captionOnRight !== markerLabelOnLeft ? 44 : 20;
  const captionWidth = aheadPercent === null ? inner : (captionOnRight ? l.width - pad - positionX : positionX - pad) - captionGap;
  const captionLines = wrap(positionLabel, captionWidth, 12);
  const positionCaption = captionLines.map((line, index) => text(line,
    captionOnRight ? l.width - pad : pad,
    railY - 11 - (captionLines.length - 1 - index) * 15,
    12,muted,450,'Geist, sans-serif',`text-anchor="${captionOnRight?'end':'start'}"`
  )).join('');
  const statsLabel = l.metrics.map(metric => `${metric.label}: ${metric.value}${metric.suffix}${metric.note ? `. ${metric.note}` : ''}`).join('. ');
  const rankText = (color: string, dx = 0, dy = 0) => `${l.hasHash ? text('#',l.rankX+dx,l.rankY+dy,l.hashSize,color,350,'Sora, sans-serif','class="rv-art-rank-hash"') : ''}${text(l.rankDigits,l.rankDigitsX+dx,l.rankY+dy,l.rankSize,color,620,'Sora, sans-serif',`class="rv-art-rank-digits" letter-spacing="${l.rankSpacing}"`)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${l.width}" height="${height}" viewBox="0 0 ${l.width} ${height}" text-rendering="geometricPrecision" role="img" aria-label="${esc(`${result.profile.fullName}. ${l.story.headline} ${l.oldRank ? `Previously ${l.oldRank}. ` : ''}${l.rank} of ${number(result.ranking.poolSize)}. ${scopeLabel(result.query)}. ${positionLabel} ${statsLabel}. Top search: ${result.topSearch}. Keywords: ${result.keywords.join(', ')}`)}">
  <defs>
    ${assets.fontCss ? `<style>${assets.fontCss}</style>` : ''}
    <clipPath id="${id('clip')}"><rect x="1" y="1" width="${l.width-2}" height="${height-2}" rx="20"/></clipPath>
    <clipPath id="${id('avatar')}"><circle cx="${pad+24}" cy="${l.identityY+24}" r="24"/></clipPath>
    <linearGradient id="${id('rainbow')}" x1="0" y1="1" x2="1" y2="0">${material.palette.map((c,i)=>`<stop offset="${FOIL_STOPS[i]}" stop-color="${c}"/>`).join('')}</linearGradient>
    <radialGradient id="${id('corner')}" cx="0" cy="0" r=".7"><stop stop-color="${material.corner}"/><stop offset="1" stop-color="${material.corner}" stop-opacity="0"/></radialGradient>
    ${type==='standard'?`
    <radialGradient id="${id('opal-near')}" cx="1" cy=".85" r=".7"><stop stop-color="${material.near}"/><stop offset="1" stop-color="${material.near}" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id('opal-far')}" cx="1" cy="1" r=".7"><stop stop-color="${material.far}"/><stop offset="1" stop-color="${material.far}" stop-opacity="0"/></radialGradient>
    <linearGradient id="${id('opal-reflection')}" x1="0" y1="0" x2="1" y2=".65"><stop offset=".14" stop-color="#fff" stop-opacity="0"/><stop offset=".27" stop-color="#fff" stop-opacity=".08"/><stop offset=".39" stop-color="#fff" stop-opacity=".5"/><stop offset=".46" stop-color="#fff" stop-opacity=".16"/><stop offset=".59" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="${id('opal-edge')}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff"/><stop offset=".3" stop-color="#ccebf3" stop-opacity=".75"/><stop offset=".52" stop-color="#fff" stop-opacity=".45"/><stop offset=".78" stop-color="#d9cbe9" stop-opacity=".7"/><stop offset="1" stop-color="#fff" stop-opacity=".87"/></linearGradient>
    <radialGradient class="rv-art-number-light" id="${id('number-light')}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="80"><stop stop-color="#fff" stop-opacity=".55"/><stop offset=".34" stop-color="#fff" stop-opacity=".16"/><stop offset=".75" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <filter id="${id('opal-relief')}" x="-5%" y="-5%" width="110%" height="110%"><feComponentTransfer><feFuncR type="linear" slope="1.428" intercept="-.095"/><feFuncG type="linear" slope="1.428" intercept="-.095"/><feFuncB type="linear" slope="1.428" intercept="-.095"/></feComponentTransfer><feDropShadow dx="-.8" dy="-1" stdDeviation=".5" flood-color="#fff" flood-opacity=".93"/><feDropShadow dx="1.4" dy="2.2" stdDeviation="1.4" flood-color="#526d8c" flood-opacity=".28"/></filter>
    `:''}
    <linearGradient id="${id('coat')}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff" stop-opacity=".18"/><stop offset=".3" stop-color="#fff" stop-opacity=".52"/><stop offset=".65" stop-color="#fff" stop-opacity=".15"/><stop offset="1" stop-color="#fff" stop-opacity=".32"/></linearGradient>
    <linearGradient id="${id('number')}" x1="0" y1="0" x2=".6" y2="1"><stop stop-color="${finish.highlight}"/><stop offset=".28" stop-color="${finish.light}"/><stop offset=".72" stop-color="${ink}"/><stop offset="1" stop-color="${finish.dark}"/></linearGradient>
    <linearGradient id="${id('glass')}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff" stop-opacity=".53"/><stop offset=".55" stop-color="#fff" stop-opacity=".26"/><stop offset="1" stop-color="#fff" stop-opacity=".4"/></linearGradient>
    <filter id="${id('raised')}" x="-15%" y="-20%" width="140%" height="160%"><feDropShadow dx="1.4" dy="4.5" stdDeviation="2" flood-color="#31203d" flood-opacity=".2"/></filter>
    <filter id="${id('glass-shadow')}" x="-10%" y="-20%" width="120%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#392d42" flood-opacity=".1"/></filter>
    <linearGradient id="${id('marker-finish')}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${finish.light}"/><stop offset="1" stop-color="${ink}"/></linearGradient>
    <filter id="${id('marker-shadow')}" x="-100%" y="-70%" width="300%" height="300%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="${ink}" flood-opacity=".28"/></filter>
    <pattern id="${id('grain')}" width="160" height="160" patternUnits="userSpaceOnUse">${image(assets.grain ?? STORY_GRAIN,0,0,160,160)}</pattern>
  </defs>
  <g clip-path="${url('clip')}">
    <g class="rv-art-material" aria-hidden="true">
      <rect width="100%" height="100%" fill="${url('rainbow')}"/>
      ${type==='standard'?`<rect width="100%" height="100%" fill="${url('opal-near')}"/><rect width="100%" height="100%" fill="${url('opal-far')}"/>`:''}
      <rect width="100%" height="100%" fill="${url('corner')}"/>
      ${image(assets.foil ?? STORY_TEXTURE,0,l.headerBottom-70,l.width,l.width*1.14,`opacity=".8"${type==='standard'?` filter="${url('opal-relief')}"`:''}`)}
      <rect width="100%" height="100%" fill="${url('coat')}"/>
      ${image(assets.silk ?? STORY_SILK,0,0,l.width,height,`preserveAspectRatio="none" opacity="${type==='standard'?'.46':'.9'}"`)}
      <rect width="100%" height="100%" fill="${url('grain')}" opacity="${type==='standard'?'.14':'.2'}" style="mix-blend-mode:soft-light"/>
      ${type==='standard'?`<rect width="100%" height="100%" fill="${url('opal-reflection')}"/>`:''}
      <rect width="100%" height="100%" fill="#ffffff" fill-opacity=".16"/>
    </g>
    ${text('YOUR RECRUITER VIEW',pad,36,9,STORY_COLORS.label,550,'Geist, sans-serif','letter-spacing="1.35"')}
    ${multiline(l.scope,pad,57,11,16,muted)}
    ${image(assets.logo ?? rankingStoryLogo(type),l.width-pad-62,22,62,62*224.07/313.68)}
    <path d="M${pad} ${l.headerBottom}h${inner}" stroke="${ink}" stroke-opacity=".11"/>
    <g class="rv-art-identity">
      <g class="rv-art-avatar"><circle cx="${pad+24}" cy="${l.identityY+24}" r="24" fill="#ece9f8"/>
      ${(assets.avatar ?? result.profile.avatar) ? image(assets.avatar ?? result.profile.avatar!,pad,l.identityY,48,48,`clip-path="${url('avatar')}"`) : text(result.profile.fullName[0],pad+15,l.identityY+32,24,ink)}
      ${frame ? image(assets.podiumFrame ?? frame.src,pad+48*frame.x,l.identityY+48*frame.y,48*frame.w,48*frame.h,'class="rv-art-avatar-frame"') : ''}
      </g><g class="rv-art-name">${multiline(l.name,pad+61,l.nameY,l.nameSize,24,STORY_COLORS.text,600)}</g>
      ${multiline(l.headline,pad+61,l.headlineY,12,18,muted)}
    </g>
    <g class="rv-art-story">${l.narrative.map((line, index) => `<text x="${pad}" y="${l.storyY+index*l.storyLeading}" font-family="Geist, sans-serif" font-size="${l.storySize}" font-weight="550" letter-spacing="-.6" xml:space="preserve">${line.map((run, i) => `<tspan fill="${run.accent ? ink : STORY_COLORS.text}" font-weight="${run.accent ? '650' : '550'}">${esc(`${i ? ' ' : ''}${run.text}`)}</tspan>`).join('')}</text>`).join('')}</g>
    <g class="rv-art-rank">
      ${l.oldRank ? `${text(l.oldRank,pad,l.rankY-3,l.oldRankSize,muted,500,'Sora, sans-serif','letter-spacing="-1"')}<path d="M${pad} ${l.rankY-3-l.oldRankSize*.35}h${l.oldRankWidth}" stroke="${muted}" stroke-width="2"/>${text('→',pad+l.oldRankWidth+6,l.rankY-7,22,muted)}` : ''}
      <g class="rv-art-rank-number">${type==='standard'?`<rect x="${l.rankX}" y="${l.rankY-l.rankSize}" width="${l.rankWidth}" height="${l.rankSize+8}" fill="transparent" pointer-events="all"/>`:''}<g opacity=".64" filter="${url('raised')}">${rankText(finish.dark,.5,1.2)}</g>${rankText('#ffffffb3',-.25,-.55)}${rankText(url('number'))}${type==='standard'?`<g class="rv-art-number-reflection" opacity="0" pointer-events="none" aria-hidden="true">${rankText(url('number-light'))}</g>`:''}</g>
      <path d="M${l.poolX-14} ${l.poolY-14}v36" stroke="${ink}" stroke-opacity=".14"/>
      ${text(l.poolText,l.poolX,l.poolY,l.poolSize,muted)}
      ${text('in this search',l.poolX,l.poolY+20,12,muted)}
    </g>
    <g class="rv-art-details">
      <g class="rv-art-position">
        ${aheadPercent===null ? positionCaption : positionCaption.replace(`${Math.floor(aheadPercent)}%`, `<tspan fill="${ink}" font-weight="750">${Math.floor(aheadPercent)}%</tspan>`)}
        <rect x="${pad}" y="${railY-1}" width="${inner}" height="2" rx="1" fill="${ink}" fill-opacity=".18"/>
        ${aheadPercent===null?'':`<rect class="rv-art-position-fill" x="${pad}" y="${railY-1}" width="${progress}" height="2" rx="1" fill="${ink}" fill-opacity=".72"/>`}
        <g aria-hidden="true">${Array.from({length:11},(_,i) => `<path d="M${pad+inner*i/10} ${railY+4}v${i%5===0?5:2.5}" stroke="${ink}" stroke-opacity="${i%5===0?'.3':'.17'}" stroke-linecap="round"/>`).join('')}</g>
        ${aheadPercent===null?'':`
          <g class="rv-art-position-marker" transform="translate(${positionX} ${railY-6.5})" filter="${url('marker-shadow')}" aria-hidden="true">
            <rect x="-4.5" y="-4.5" width="9" height="9" rx="2" transform="rotate(45)" fill="${url('marker-finish')}" stroke="#ffffffe0" stroke-width="1"/>
          </g>
          ${text('YOU',positionX+(markerLabelOnLeft?-13:13),railY-5,9,ink,650,'Geist, sans-serif',`text-anchor="${markerLabelOnLeft?'end':'start'}" letter-spacing=".65"`)}
        `}
        ${text('FOUND LAST',pad,l.contextY+45,9,STORY_COLORS.label,500,'Geist, sans-serif','letter-spacing=".6"')}
        ${text('FOUND FIRST',l.width-pad,l.contextY+45,9,STORY_COLORS.label,500,'Geist, sans-serif','text-anchor="end" letter-spacing=".6"')}
      </g>
      <g class="rv-art-metrics">
        <rect x="${pad}" y="${l.metricsY}" width="${inner}" height="${l.metricsHeight}" rx="14" fill="${url('glass')}" stroke="#ffffffa8" filter="${url('glass-shadow')}"/>
        <path d="M${pad} ${l.metricsY+l.firstMetricRowHeight}h${inner} M${pad+l.metricWidth} ${l.metricsY}v${l.metricsHeight}" fill="none" stroke="#584268" stroke-opacity=".08"/>
        ${l.metrics.map((metric, index) => {
          const x = pad + (index % 2 ? l.metricWidth : 0) + l.metricInset;
          const y = l.metricsY + (index >= 2 ? l.firstMetricRowHeight : 0);
          const valueY = y + 51 + (l.metricLabelLines - 1) * 13;
          let size = metric.value === 'Not available' ? 13 : metric.label === 'Your page' ? 18 : l.width < 420 ? 23 : 26;
          while (length(metric.value + metric.suffix, size) > l.metricWidth - l.metricInset * 2 && size > 13) size--;
          const value = text(metric.value,x,valueY,size,ink,500,'Sora, sans-serif');
          return `${multiline(metric.labelLines,x,y+21,10,13,STORY_COLORS.label,550)}
            ${metric.searchLines ? multiline(metric.searchLines,x,valueY-7,13,19) : metric.suffix ? value.replace('</text>', `<tspan dx="5" font-size="14" font-weight="400" fill="${muted}">${esc(metric.suffix.trim())}</tspan></text>`) : value}
            ${metric.note ? text(metric.note,x,valueY+16,10,muted) : ''}`;
        }).join('')}
      </g>
      ${l.story.comparison ? '' : `${text('TOP SEARCH YOU APPEAR IN',pad,l.searchLabelY,9,STORY_COLORS.label,550,'Geist, sans-serif','letter-spacing=".7"')}${multiline(l.search,pad,l.searchLabelY+24,l.searchSize,22)}`}
      ${l.tags.map(t=>`<g class="rv-art-keyword"><title>${esc(t.text)}</title><rect x="${t.x}" y="${t.y}" width="${t.width}" height="${t.height}" rx="6" fill="#ffffff" fill-opacity=".4" stroke="#ffffff" stroke-opacity=".4"/>${t.lines.map((line,index)=>text(line,t.x+t.width/2,t.y+17+index*15,11,STORY_COLORS.text,500,'Geist, sans-serif','text-anchor="middle" letter-spacing="0" style="font-kerning:none"')).join('')}</g>`).join('')}
      <path d="M${pad} ${l.footerY}h${inner}" stroke="${ink}" stroke-opacity=".12"/>
      ${text('See where you stand → ',pad,l.footerY+25,l.width<320?10:11,muted).replace('</text>', `<tspan fill="${STORY_COLORS.text}" font-weight="550">${SITE_LABEL}</tspan></text>`)}
    </g>
  </g>
  <rect x=".7" y=".7" width="${l.width-1.4}" height="${height-1.4}" rx="20" fill="none" stroke="${material.edge}" stroke-width="1.4"/>
  <rect x="2" y="2" width="${l.width-4}" height="${height-4}" rx="18" fill="none" stroke="${type==='standard'?url('opal-edge'):'#ffffff'}" stroke-opacity=".85"/>
  </svg>`;
}
