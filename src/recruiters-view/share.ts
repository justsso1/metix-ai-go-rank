import { ROUTES } from './site.ts';
import { cardLayout } from './ranking-card.ts';
import { formatInt, hasMatchingShareSnapshot, shareImagePath, sharePageUrl } from './mock.ts';
import { scopeLabel, topPercent } from './campaign.ts';
import type { RankLookupFound } from './types';

export function shareMetadata(result?: RankLookupFound) {
  if (!result || !hasMatchingShareSnapshot(result)) return {
    title: 'Every recruiter search creates a ranking. Now you can see yours.',
    description: 'Paste your LinkedIn URL. See how you rank when recruiters search your role and city.',
    path: ROUTES.entry,
    image: shareImagePath(),
    imageWidth: 1200, imageHeight: 630,
    imageAlt: "Recruiter's View by Metix AI. See where you rank in a recruiter search.",
  };
  const ranking = result.ranking.kind === 'exact'
    ? `#${formatInt(result.ranking.rank)} of ${formatInt(result.ranking.poolSize)}`
    : `${result.ranking.label} of ${formatInt(result.ranking.poolSize)}`;
  const description = `When recruiters search ${scopeLabel(result.query)}, ${result.profile.fullName} ranks ${ranking}${topPercent(result.ranking) ? ` (Top ${topPercent(result.ranking)}%)` : ""}. Top search: ${result.topSearch}. See your ranking on Metix.`;
  return {
    title: `${result.profile.fullName} ranks ${ranking} · Recruiter's View`,
    description,
    path: new URL(sharePageUrl(result.profile.handle)).pathname,
    image: shareImagePath(result.profile.handle),
    imageWidth: 1280, imageHeight: cardLayout(result, 640).height * 2,
    imageAlt: `Example result. ${description}`,
  };
}
