import type { RankLookupFound, RankedPerson } from './types';

/** Keep rank labels clear of avatars, including four- and five-digit ranks. */
export function leaderboardRankWidth(result: RankLookupFound): number {
  return result.ranking.kind === 'band' ? 104 : 30 + Math.max(0, String(result.ranking.rank).length - 2) * 11;
}

export function ownRankedPerson(result: RankLookupFound): RankedPerson {
  return { ...result.profile, id: `self-${result.profile.handle}`, rank: result.ranking.kind === 'exact' ? result.ranking.rank : 0 };
}

/** Complete podium data is independent of the 'people above me' subset. */
export function completeTopThree(result: Omit<RankLookupFound, 'topThree'>): RankedPerson[] {
  const rank = result.ranking.kind === 'exact' ? result.ranking.rank : null;
  return [1, 2, 3].filter(position => position <= result.ranking.poolSize).map(position => {
    if (position === rank) return { ...result.profile, id: `self-${result.profile.handle}`, rank: position };
    const existing = result.peopleAbove.strongest.find(person => person.rank === position);
    if (existing) return existing;
    // Fixture fallback for ranks below a podium finisher; real APIs supply these rows.
    const names = ['Alex Romero', 'Nina Okonkwo', 'Kenji Mori'];
    return { id: `${result.profile.handle}-podium-${position}`, rank: position, fullName: names[position - 1],
      headline: `${result.query.jobTitle} at ${['Helio', 'Cascade', 'Northwind'][position - 1]}`,
      title: result.query.jobTitle, company: ['Helio', 'Cascade', 'Northwind'][position - 1],
      location: result.query.location, skills: result.profile.skills.slice(0, 2), yearsExperience: result.profile.yearsExperience,
      avatar: `/mira-mock/avatars/a${position + 3}.svg` };
  });
}

export function leaderboardRows(result: RankLookupFound): Array<{ person: RankedPerson; isYou: boolean }> {
  const own = ownRankedPerson(result);
  const people = new Map<number, RankedPerson>();
  for (const person of result.topThree) if (person.rank >= 1 && person.rank <= 3) people.set(person.rank, person);
  if (result.ranking.kind === 'exact') {
    for (const person of result.peopleAbove.justAhead) {
      if (person.rank > 3 && person.rank < own.rank && person.rank >= own.rank - 2) people.set(person.rank, person);
    }
    people.set(own.rank, own);
  }
  return [...people.values()].sort((a, b) => a.rank - b.rank).map(person => ({ person, isYou: person.rank === own.rank }));
}

export function rankingIdentity(result: RankLookupFound): string {
  return JSON.stringify([result.profile.handle, result.query, result.ranking, result.rankedAt, result.revision]);
}

const SEEN_KEY = 'metix-rv-revealed-v1';
export function hasSeenRanking(result: RankLookupFound): boolean {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]').includes(rankingIdentity(result)); } catch { return false; }
}
export function rememberRanking(result: RankLookupFound): void {
  try {
    const old = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
    const keys = Array.isArray(old) ? old.filter(key => typeof key === 'string') : [];
    localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...keys, rankingIdentity(result)])].slice(-100)));
  } catch { /* Animation persistence is optional. */ }
}
