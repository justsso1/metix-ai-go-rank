import type { RankDisplay, RankLookupFound, SearchQuery } from './types';

export const PEOPLE_PER_PAGE = 25;
const number = (value: number) => new Intl.NumberFormat('en-US').format(value);
const exactRank = (ranking: RankDisplay): ranking is Extract<RankDisplay, { kind: 'exact' }> =>
  ranking.kind === 'exact' && Number.isInteger(ranking.rank) && Number.isInteger(ranking.poolSize)
  && ranking.rank >= 1 && ranking.rank <= ranking.poolSize;
const sameQuery = (a: SearchQuery, b: SearchQuery) =>
  (['jobTitle', 'location', 'seniorityBand', 'companyType'] as const).every(key => a[key] === b[key]);

export function pluralRole(title: string): string {
  const [role, ...scope] = title.trim().split(/\s+of\s+/i);
  const plural = /(?:s|staff|people|personnel)$/i.test(role) ? role
    : /[^aeiou]y$/i.test(role) ? role.slice(0, -1) + 'ies'
    : /(?:x|ch|sh)$/i.test(role) ? role + 'es' : role + 's';
  return [plural, ...scope].join(' of ');
}

export function rankingCardStats(result: RankLookupFound) {
  const { ranking, recruiterReplyScore } = result;
  return {
    ahead: exactRank(ranking) ? ranking.rank - 1 : null,
    behind: exactRank(ranking) ? ranking.poolSize - ranking.rank : null,
    page: exactRank(ranking) ? Math.ceil(ranking.rank / PEOPLE_PER_PAGE) : null,
    replyScore: typeof recruiterReplyScore === 'number' && Number.isFinite(recruiterReplyScore)
      && recruiterReplyScore >= 0 && recruiterReplyScore <= 5 ? recruiterReplyScore : null,
  };
}

/** Carry the previous published result with the new snapshot, including on share links. */
export function withPreviousRanking(result: RankLookupFound, previous: RankLookupFound): RankLookupFound {
  return { ...result, previousRanking: {
    profileHandle: previous.profile.handle, query: previous.query, ranking: previous.ranking,
  } };
}

export function cardStory(result: RankLookupFound) {
  const { ranking, previousRanking: previous } = result;
  const stats = rankingCardStats(result);
  if (exactRank(ranking) && previous && previous.profileHandle === result.profile.handle
    && exactRank(previous.ranking) && sameQuery(previous.query, result.query)
    && ranking.rank < previous.ranking.rank) {
    const oldPage = Math.ceil(previous.ranking.rank / PEOPLE_PER_PAGE);
    const passed = previous.ranking.rank - ranking.rank;
    return {
      kind: 'improved' as const,
      primaryAction: ranking.rank * 2 <= ranking.poolSize ? 'share' as const : 'improve' as const,
      headline: oldPage !== stats.page
        ? `Page ${number(oldPage)} → page ${number(stats.page!)}. Profile updated.`
        : `Profile updated. You moved up ${number(passed)} ${passed === 1 ? 'place' : 'places'}.`,
      highlight: oldPage !== stats.page ? `page ${number(stats.page!)}` : `${number(passed)} ${passed === 1 ? 'place' : 'places'}`,
      comparison: { rank: previous.ranking.rank, poolSize: previous.ranking.poolSize, page: oldPage, passed },
    };
  }
  if (!exactRank(ranking)) return { kind: 'unavailable' as const, primaryAction: 'improve' as const,
    headline: 'Your place in this recruiter search.', highlight: '', comparison: null };
  if (ranking.rank * 100 <= ranking.poolSize * 5) return {
    kind: 'top' as const, primaryAction: 'share' as const,
    headline: `Recruiters find you before ${number(stats.behind!)} other ${stats.behind === 1 ? 'person' : 'people'}.`,
    highlight: number(stats.behind!), comparison: null,
  };
  const peers = result.query.jobTitle.trim() ? pluralRole(result.query.jobTitle) : 'people';
  const location = result.query.location.trim() ? ` in ${result.query.location.trim()}` : '';
  if (ranking.rank * 2 <= ranking.poolSize) {
    const percent = Math.floor(stats.behind! * 100 / (ranking.poolSize - 1));
    return {
      kind: 'middle' as const, primaryAction: 'share' as const,
      headline: `You're ahead of ${percent}% of ${peers}${location}.`,
      highlight: `${percent}%`, comparison: null,
    };
  }
  const firstSeen = number(Math.min(PEOPLE_PER_PAGE * 2, ranking.poolSize));
  return {
    kind: 'lower' as const, primaryAction: 'improve' as const,
    headline: `${number(ranking.poolSize)} ${peers}${location}. Recruiters see the first ${firstSeen}.`,
    highlight: `first ${firstSeen}`, comparison: null,
  };
}
