/**
 * Rebuild the committed mock OG images. Requires @napi-rs/canvas in the
 * generator's environment, not in the website bundle or Docker build.
 * Set OG_CANVAS_MODULES to an existing node_modules directory if needed.
 */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMockShareResults } from '../src/recruiters-view/mock.ts';
import { cardLayout, rankingCardSvg } from '../src/recruiters-view/ranking-card.ts';
import { cardThemeName } from '../src/recruiters-view/card-theme.ts';
import { podiumFrame } from '../src/recruiters-view/podium-frame.ts';
import { STORY_TEXTURE, STORY_GRAIN, STORY_SILK, rankingStoryLogo } from '../src/recruiters-view/card-material.ts';
import { drawEntryCover, SHARE_CARD_HEIGHT, SHARE_CARD_LOGO, SHARE_CARD_WIDTH } from '../src/recruiters-view/share-card.ts';

const require = createRequire(process.env.OG_CANVAS_MODULES
  ? resolve(process.env.OG_CANVAS_MODULES, 'og-generator.cjs') : import.meta.url);
const sharp = require('sharp');
const { createCanvas, GlobalFonts, loadImage, convertSVGTextToPath } = require('@napi-rs/canvas');
const root = fileURLToPath(new URL('../', import.meta.url));
const publicFile = (path) => resolve(root, 'public', path.replace(/^\//, ''));
for (const [file, family] of [['sora.woff2', 'Sora'], ['geist-sans.woff2', 'Geist']]) {
  if (!GlobalFonts.registerFromPath(publicFile(`assets/fonts/${file}`), family)) throw new Error(`Could not load ${family}`);
}
const logo = await loadImage(publicFile(SHARE_CARD_LOGO));
const inline = async (path) => {
  // libvips retains the imported SVG material's filters and referenced paths.
  const png = await sharp(await readFile(publicFile(path))).png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
};
const [foil, grain, silk] = await Promise.all([STORY_TEXTURE, STORY_GRAIN, STORY_SILK].map(inline));
const destination = publicFile('recruiters-view/og');
await mkdir(destination, { recursive: true });
const rendererHash = createHash('sha256').update(await readFile(resolve(root, 'src/recruiters-view/share-card.ts'))).digest('hex');
const themeHash = createHash('sha256').update(await readFile(resolve(root, 'src/recruiters-view/card-theme.ts'))).digest('hex');
const foilHash = createHash('sha256').update(await readFile(publicFile(STORY_TEXTURE))).digest('hex');
const templateHash = createHash('sha256').update(await readFile(resolve(root, 'src/recruiters-view/ranking-card.ts'))).digest('hex');
const storyHash = createHash('sha256').update(await readFile(resolve(root, 'src/recruiters-view/card-story.ts'))).digest('hex');
const materialHash = createHash('sha256').update(await readFile(resolve(root, 'src/recruiters-view/card-material.ts'))).digest('hex');
const materialAssets = [STORY_TEXTURE, STORY_GRAIN, STORY_SILK, ...['standard', 'gold', 'silver', 'bronze'].map(rankingStoryLogo), ...[1, 2, 3].map(rank => podiumFrame(rank).src)];
const assetHashes = Object.fromEntries(await Promise.all(materialAssets.map(async path => [path, createHash('sha256').update(await readFile(publicFile(path))).digest('hex')])));
const manifest = { rendererHash, templateHash, storyHash, themeHash, foilHash, materialHash, assetHashes, cards: {} };
for (const result of [undefined, ...getMockShareResults()]) {
  const key = result?.profile.handle ?? 'default';
  const size = result ? { width: 1280, height: cardLayout(result, 640).height * 2 } : { width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT };
  let png;
  if (result) {
    const avatar = result.profile.avatar ? await inline(result.profile.avatar) : undefined;
    const cardLogo = await inline(rankingStoryLogo(cardThemeName(result.ranking)));
    const frame = podiumFrame(result.ranking.kind === 'exact' ? result.ranking.rank : undefined);
    const avatarFrame = frame ? await inline(frame.src) : undefined;
    let svg = rankingCardSvg(result, 640, { avatar, foil, grain, silk, logo: cardLogo, podiumFrame: avatarFrame });
    // Skia outlines local fonts; libvips preserves the embedded avatar/foil images.
    // Both consume the on-page SVG, with no second layout or composition.
    svg = svg.replace(/<text\b[^>]*>[\s\S]*?<\/text>/g, text => {
      const outlined = convertSVGTextToPath(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="${size.height / 2}">${text}</svg>`).toString();
      let paths = outlined.replace(/^[\s\S]*?<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '');
      // Text outlining runs separately from the material definitions. Restore
      // gradient paint after outlining rather than accepting Skia's black fallback.
      const paint = text.match(/\bfill="(url\(#[^"]+\))"/)?.[1];
      if (paint) paths = `<g fill="${paint}">${paths.replace(/fill="[^"]*"/g, '')}</g>`;
      return paths;
    });
    png = await sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();
  } else {
    const canvas = createCanvas(size.width, size.height);
    drawEntryCover(canvas.getContext('2d'), logo);
    png = await canvas.encode('png');
  }
  await writeFile(resolve(destination, `${key}.png`), png);
  manifest.cards[key] = {
    result: result ?? null,
    ...size,
    sha256: createHash('sha256').update(png).digest('hex'),
  };
  console.log(`${key}.png: ${size.width} × ${size.height}, ${Math.round(png.length / 1024)} KB`);
}
await writeFile(resolve(root, 'src/recruiters-view/og-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
