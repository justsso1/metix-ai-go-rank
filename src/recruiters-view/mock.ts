import { completeTopThree } from './leaderboard.ts';
import { PEOPLE_PER_PAGE, pluralRole, rankingCardStats } from './card-story.ts';
import type {
  LeaderboardSnapshot,
  LookupProgress,
  PeopleAboveGroups,
  RankLookupResult,
  RankLookupFound,
  RankedPerson,
  RankProfile,
  SearchQuery,
} from "./types";

const AVATARS = [
  "/mira-mock/avatars/a1.svg",
  "/mira-mock/avatars/a2.svg",
  "/mira-mock/avatars/a3.svg",
  "/mira-mock/avatars/a4.svg",
  "/mira-mock/avatars/a5.svg",
  "/mira-mock/avatars/a6.svg",
  "/mira-mock/avatars/a8.svg",
  "/mira-mock/avatars/a9.svg",
  "/mira-mock/avatars/a10.svg",
] as const;

// Preview fixtures only. Reply propensity is independent of search position.
const REPLY_SCORE_EXAMPLES: Record<string, number> = {
  "maya-chen-se": 4.2,
  "jordan-hale-pm": 3.8,
  "priya-nair-ml": 4.6,
  "alex-romero-be": 4.4,
  "nina-okonkwo-be": 4.1,
  "kenji-mori-be": 4.3,
};

export const GENERIC_SUGGESTIONS = [
  "Name the tools and systems in your recent roles, not only the team name.",
  "Make the current title match how recruiters search the job family.",
  "Write a short summary that states the role, years, and domain in one line.",
];

export const HOW_CALCULATED =
  "Based on Metix's recruiter search index and the same ranking system used in Recruiter Search.";

const MAYA: RankProfile = {
  handle: "maya-chen-se",
  fullName: "Maya Chen",
  headline: "Senior Backend Engineer at Northwind",
  title: "Senior Backend Engineer",
  company: "Northwind",
  location: "Seattle, WA",
  metro: "Seattle",
  jobFamily: "Backend Engineer",
  yearsExperience: 5,
  skills: ["Go", "Kubernetes", "distributed systems", "PostgreSQL"],
  avatar: AVATARS[0],
};

const JORDAN: RankProfile = {
  handle: "jordan-hale-pm",
  fullName: "Jordan Hale",
  headline: "Product Manager, B2B workflow tools",
  title: "Product Manager",
  company: "Harborline",
  location: "New York, NY",
  metro: "New York",
  jobFamily: "Product Manager",
  yearsExperience: 6,
  skills: ["B2B SaaS", "roadmap", "SQL", "onboarding"],
  avatar: AVATARS[1],
};

const PRIYA: RankProfile = {
  handle: "priya-nair-ml",
  fullName: "Priya Nair",
  headline: "Staff Machine Learning Engineer",
  title: "Staff Machine Learning Engineer",
  company: "Lumenfield",
  location: "San Francisco, CA",
  metro: "San Francisco",
  jobFamily: "Machine Learning Engineer",
  yearsExperience: 9,
  skills: ["PyTorch", "LLM eval", "feature stores", "Python"],
  avatar: AVATARS[2],
};

const SEEDED: Record<string, RankLookupResult> = {
  "maya-chen-se": foundResult({
    inputUrl: "https://www.linkedin.com/in/maya-chen-se",
    profile: MAYA,
    query: {
      jobTitle: "Senior Backend Engineer",
      location: "Seattle",
      seniorityBand: "4-7 years",
      companyType: "B2B software companies",
    },
    rank: 47,
    poolSize: 1240,
    keywords: ["backend", "distributed systems", "Kubernetes", "Seattle"],
    above: {
      strongest: [
        person("r1", 1, "Alex Romero", "Staff Backend Engineer at Helio", "Staff Backend Engineer", "Helio", "Seattle, WA", ["Go", "Kubernetes", "gRPC"], 11, AVATARS[3]),
        person("r2", 2, "Nina Okonkwo", "Senior Backend Engineer at Cascade", "Senior Backend Engineer", "Cascade", "Seattle, WA", ["Rust", "distributed systems"], 8, AVATARS[4]),
        person("r3", 3, "Kenji Mori", "Staff Backend Engineer at Northwind", "Staff Backend Engineer", "Northwind", "Seattle, WA", ["Kafka", "Go"], 10, AVATARS[8]),
      ],
      justAhead: [
        person("r44", 44, "Samira Haddad", "Senior Backend Engineer at Northshore", "Senior Backend Engineer", "Northshore", "Seattle, WA", ["Kubernetes", "Kafka"], 8, AVATARS[6]),
        person("r45", 45, "Eli Vargas", "Backend Engineer at Packet", "Backend Engineer", "Packet", "Seattle, WA", ["Go", "AWS"], 6, AVATARS[7]),
        person("r46", 46, "Daniel Cho", "Backend Engineer at Vellum", "Backend Engineer", "Vellum", "Bellevue, WA", ["Go", "PostgreSQL"], 6, AVATARS[5]),
      ],
    },
  }),
  "jordan-hale-pm": foundResult({
    inputUrl: "https://www.linkedin.com/in/jordan-hale-pm",
    profile: JORDAN,
    query: {
      jobTitle: "Product Manager",
      location: "New York",
      seniorityBand: "4-7 years",
      companyType: "B2B software companies",
    },
    rank: 86,
    poolSize: 980,
    keywords: ["product", "B2B SaaS", "roadmap", "New York"],
    above: {
      strongest: [
        person("p1", 1, "Riley Ames", "Senior Product Manager, payments", "Senior Product Manager", "Ledgerly", "New York, NY", ["B2B SaaS", "payments"], 9, AVATARS[3]),
        person("p2", 2, "Chen Wei", "Product Manager, workflow", "Product Manager", "Atelier", "Brooklyn, NY", ["roadmap", "SQL"], 8, AVATARS[8]),
        person("p3", 3, "Ava Brooks", "PM, growth", "Product Manager", "Kite", "New York, NY", ["onboarding", "experimentation"], 7, AVATARS[4]),
      ],
      justAhead: [
        person("p83", 83, "Omar Diallo", "Product Manager at Northline", "Product Manager", "Northline", "Jersey City, NJ", ["B2B SaaS"], 6, AVATARS[5]),
        person("p84", 84, "Leila Santos", "Product Manager at Harbor", "Product Manager", "Harbor", "New York, NY", ["roadmap", "B2B SaaS"], 5, AVATARS[6]),
        person("p85", 85, "Jonah Berg", "Product Manager at Orion", "Product Manager", "Orion", "New York, NY", ["SQL", "experimentation"], 5, AVATARS[7]),
      ],
    },
  }),
  "priya-nair-ml": foundResult({
    inputUrl: "https://www.linkedin.com/in/priya-nair-ml",
    profile: PRIYA,
    query: {
      jobTitle: "Staff Machine Learning Engineer",
      location: "San Francisco",
      seniorityBand: "8-12 years",
      companyType: "AI companies",
    },
    rank: 5,
    poolSize: 640,
    keywords: ["machine learning", "PyTorch", "LLM eval", "San Francisco"],
    above: {
      strongest: [
        person("m1", 1, "Leila Santos", "Principal ML Engineer at Harbor", "Principal Machine Learning Engineer", "Harbor", "San Francisco, CA", ["feature stores", "Python"], 14, AVATARS[7]),
        person("m2", 2, "Jonah Berg", "Staff ML Engineer at Orion", "Staff Machine Learning Engineer", "Orion", "San Francisco, CA", ["PyTorch", "LLM eval"], 12, AVATARS[6]),
        person("m3", 3, "Kenji Mori", "Staff ML Engineer at Nimbus", "Staff Machine Learning Engineer", "Nimbus", "Palo Alto, CA", ["PyTorch", "ranking"], 10, AVATARS[8]),
      ],
      justAhead: [
        person("m4", 4, "Riley Ames", "Staff ML Engineer at Ledgerly", "Staff Machine Learning Engineer", "Ledgerly", "San Francisco, CA", ["PyTorch", "Python"], 9, AVATARS[3]),
      ],
    },
  }),
  "not-indexed": {
    status: "not_found",
    inputUrl: "https://www.linkedin.com/in/not-indexed",
    handle: "not-indexed",
    suggestions: GENERIC_SUGGESTIONS,
  },
};

// Complete podium fixtures let every finishing place be previewed and shared.
const mayaSeed = SEEDED["maya-chen-se"] as RankLookupFound;
for (const [index, handle] of ["alex-romero-be", "nina-okonkwo-be", "kenji-mori-be"].entries()) {
  const candidate = mayaSeed.topThree[index];
  const profile: RankProfile = { ...MAYA, ...candidate, handle, metro: "Seattle", jobFamily: "Backend Engineer" };
  const result = foundResult({ inputUrl: `https://www.linkedin.com/in/${handle}`, profile, query: mayaSeed.query,
    rank: index + 1, poolSize: 1240, keywords: mayaSeed.keywords,
    above: { strongest: mayaSeed.topThree.filter(person => person.rank < index + 1), justAhead: [] } });
  result.topThree = mayaSeed.topThree.map(person => person.rank === index + 1
    ? { ...person, id: `self-${handle}` } : person);
  SEEDED[handle] = result;
}

const JOB_TEMPLATES: Array<{
  jobFamily: string;
  title: string;
  metro: string;
  location: string;
  skills: string[];
  company: string;
}> = [
  { jobFamily: "Backend Engineer", title: "Senior Backend Engineer", metro: "Seattle", location: "Seattle, WA", skills: ["Go", "Kubernetes", "PostgreSQL"], company: "Northwind" },
  { jobFamily: "Frontend Engineer", title: "Senior Frontend Engineer", metro: "Austin", location: "Austin, TX", skills: ["React", "TypeScript", "design systems"], company: "Fieldnote" },
  { jobFamily: "Data Engineer", title: "Data Engineer", metro: "Chicago", location: "Chicago, IL", skills: ["dbt", "Spark", "SQL"], company: "Lakehouse" },
  { jobFamily: "Account Executive", title: "Enterprise Account Executive", metro: "Boston", location: "Boston, MA", skills: ["enterprise sales", "SaaS"], company: "Quota" },
  { jobFamily: "Designer", title: "Product Designer", metro: "Los Angeles", location: "Los Angeles, CA", skills: ["Figma", "product design"], company: "Atelier" },
];

const FIRST_NAMES = ["Riley", "Noah", "Amina", "Theo", "Sasha", "Imani", "Luca", "Hana"];
const LAST_NAMES = ["Park", "Nguyen", "Adeyemi", "Kline", "Rahman", "Vogel", "Ito", "Costa"];

export function parseLinkedInInput(raw: string): { ok: true; handle: string; url: string } | { ok: false; message: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, message: "Paste a LinkedIn profile URL." };
  }
  if (/github\.com/i.test(trimmed)) {
    return { ok: false, message: "This page only reads LinkedIn URLs." };
  }
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname) || url.username || url.password) throw new Error();
    const match = url.pathname.match(/^\/in\/([^/]+)\/?$/i);
    const handle = match ? decodeURIComponent(match[1]).toLowerCase() : "";
    if (!/^[\p{L}\p{N}_-]+$/u.test(handle) || handle.length > 100) throw new Error();
    return { ok: true, handle, url: `https://www.linkedin.com/in/${encodeURIComponent(handle)}` };
  } catch {
    return { ok: false, message: "Use a public LinkedIn profile URL, like linkedin.com/in/your-handle." };
  }
}

export function isPreviewHandle(handle: string): boolean {
  return Object.hasOwn(SEEDED, handle);
}

export async function lookupRanking(
  rawUrl: string,
  options: {
    onProgress?: (progress: LookupProgress) => void;
    signal?: AbortSignal;
  } = {},
): Promise<RankLookupResult> {
  const parsed = parseLinkedInInput(rawUrl);
  if (parsed.ok === false) {
    return { status: "invalid", inputUrl: rawUrl, message: parsed.message };
  }

  const { lookupPeerRank } = await import("./peer-rank-api.ts");
  return lookupPeerRank(parsed.url, parsed.handle, options);
}

/** Name-generation fixture for share-card tests. Campaign lookup does not use it. */
export function syntheticLookup(rawUrl: string): RankLookupResult {
  const parsed = parseLinkedInInput(rawUrl);
  if (parsed.ok === false) return { status: "invalid", inputUrl: rawUrl, message: parsed.message };
  const seeded = Object.hasOwn(SEEDED, parsed.handle) ? SEEDED[parsed.handle] : undefined;
  if (seeded?.status === "not_found") return { ...seeded, inputUrl: parsed.url, handle: parsed.handle };
  if (seeded?.status === "found") return { ...seeded, inputUrl: parsed.url };
  return synthesize(parsed.handle, parsed.url);
}

export function getLeaderboardSnapshot(now = Date.now()): LeaderboardSnapshot {
  const minutes = Math.floor((now % 86_400_000) / 60_000);
  return {
    checkedToday: 1480 + Math.floor(minutes / 4),
    competitiveRoles: [
      { title: "Senior Backend Engineer", location: "Seattle", poolSize: 1240 },
      { title: "Product Manager", location: "New York", poolSize: 980 },
      { title: "Staff Machine Learning Engineer", location: "San Francisco", poolSize: 640 },
      { title: "Account Executive", location: "Boston", poolSize: 870 },
    ],
    visibleCompanies: [
      { company: "Northwind", roleFamily: "Backend Engineer", poolSize: 310 },
      { company: "Harborline", roleFamily: "Product Manager", poolSize: 220 },
      { company: "Lumenfield", roleFamily: "Machine Learning Engineer", poolSize: 180 },
    ],
    cities: [
      { city: "San Francisco", poolSize: 2140 },
      { city: "New York", poolSize: 1980 },
      { city: "Seattle", poolSize: 1240 },
      { city: "Austin", poolSize: 760 },
    ],
  };
}

export { SITE_ORIGIN as SHARE_ORIGIN } from "./site.ts";

// Static hosting needs one HTML document per personalized social preview.
// Unseeded mock profiles keep the query-string link and the general page cover.
export function getMockShareResults(): Extract<RankLookupResult, { status: "found" }>[] {
  return Object.values(SEEDED).filter((result): result is Extract<RankLookupResult, { status: "found" }> => result.status === "found");
}

/** Migrate old preview snapshots only; explicit service scores (including null) stay intact. */
export function upgradeMockSnapshot(result: RankLookupFound): RankLookupFound {
  if (result.recruiterReplyScore !== undefined) return result;
  const seeded = Object.hasOwn(SEEDED, result.profile.handle) ? SEEDED[result.profile.handle] : undefined;
  if (seeded?.status !== 'found') return result;
  // Seed key order also keeps unchanged snapshots eligible for their published OG.
  return { ...seeded, ...result, recruiterReplyScore: seeded.recruiterReplyScore };
}

export function shareText(result: RankLookupFound): string {
  const cta = 'See where you stand →';
  const { ranking } = result;
  const { behind } = rankingCardStats(result);
  if (ranking.kind !== 'exact' || behind === null) return `I checked where I stand in recruiter search. ${cta}`;
  // Social copy follows the current percentile even after a profile improvement.
  if (ranking.rank * 100 <= ranking.poolSize * 5) {
    return `Recruiters find me before ${formatInt(behind)} other ${behind === 1 ? 'person' : 'people'}. Didn't know that was a stat until today. ${cta}`;
  }
  const role = result.profile.jobFamily.trim() || result.query.jobTitle.trim();
  const peers = role ? pluralRole(role.toLowerCase()) : 'people';
  const location = result.query.location.trim() ? ` in ${result.query.location.trim()}` : '';
  if (ranking.rank * 2 <= ranking.poolSize) {
    const percent = Math.floor(behind * 100 / (ranking.poolSize - 1));
    return `Apparently I'm ahead of ${percent}% of ${peers}${location} in recruiter search. ${cta}`;
  }
  const firstSeen = formatInt(Math.min(PEOPLE_PER_PAGE * 2, ranking.poolSize));
  return `${formatInt(ranking.poolSize)} ${peers}${location}. Recruiters see the first ${firstSeen}. That's the whole game. ${cta}`;
}

export function linkedinShareUrl(text: string, pageUrl: string): string {
  const share = new URL("https://www.linkedin.com/feed/");
  share.searchParams.set("shareActive", "true");
  share.searchParams.set("shareUrl", pageUrl);
  share.searchParams.set("text", text);
  return share.toString();
}

export function formatInt(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function foundResult(input: {
  inputUrl: string;
  profile: RankProfile;
  query: SearchQuery;
  rank: number;
  poolSize: number;
  keywords: string[];
  above: PeopleAboveGroups;
}): RankLookupFound {
  const result: Omit<RankLookupFound, "topThree"> = {
    status: "found",
    inputUrl: input.inputUrl,
    profile: input.profile,
    query: input.query,
    ranking: { kind: "exact", rank: input.rank, poolSize: input.poolSize },
    recruiterReplyScore: REPLY_SCORE_EXAMPLES[input.profile.handle] ?? null,
    keywords: input.keywords,
    suggestions: [
      `Add ${input.profile.skills.slice(0, 2).join(" and ")} to your headline if they reflect your current work.`,
      `Describe one ${input.profile.jobFamily.toLowerCase()} project with its scale, your contribution, and a measurable outcome.`,
      `Open your About section with your ${input.profile.yearsExperience} years of experience, specialization, and the problems you solve.`,
    ],
    adviceKind: "personalized",
    topSearch: topSearchFor(input.query, input.profile.skills),
    rankedAt: "2026-09-15T12:00:00.000Z",
    profileVersion: "profile-v1",
    revision: 0,
    peopleAbove: input.above,
  };
  return { ...result, topThree: completeTopThree(result) };
}

function person(
  id: string,
  rank: number,
  fullName: string,
  headline: string,
  title: string,
  company: string,
  location: string,
  skills: string[],
  yearsExperience: number,
  avatar?: string,
): RankedPerson {
  return { id, rank, fullName, headline, title, company, location, skills, yearsExperience, avatar };
}

function synthesize(handle: string, url: string): RankLookupResult {
  const hash = fnv(handle);
  const template = JOB_TEMPLATES[hash % JOB_TEMPLATES.length];
  const years = 3 + (hash % 10);
  const poolSize = 480 + (hash % 1800);
  const rank = Math.min(poolSize - 12, 80 + (hash % Math.max(40, Math.floor(poolSize * 0.35))));
  const first = FIRST_NAMES[hash % FIRST_NAMES.length];
  const last = LAST_NAMES[(hash >>> 4) % LAST_NAMES.length];
  const fullName = `${first} ${last}`;
  const query: SearchQuery = {
    jobTitle: template.title,
    location: template.metro,
    companyType: "Software companies",
    seniorityBand: years >= 8 ? "8-12 years" : years >= 4 ? "4-7 years" : "0-3 years",
  };
  const profile: RankProfile = {
    handle,
    fullName,
    headline: `${template.title} at ${template.company}`,
    title: template.title,
    company: template.company,
    location: template.location,
    metro: template.metro,
    jobFamily: template.jobFamily,
    yearsExperience: years,
    skills: template.skills,
    avatar: AVATARS[hash % AVATARS.length],
  };

  const ranking =
    years < 3
      ? { kind: "band" as const, label: "top 40%", poolSize }
      : { kind: "exact" as const, rank, poolSize };

  const peopleAbove =
    ranking.kind === "exact" ? makePeopleAbove(handle, ranking.rank, template) : { strongest: [], justAhead: [] };

  const result: Omit<RankLookupFound, "topThree"> = {
    status: "found",
    inputUrl: url,
    profile,
    query,
    ranking,
    keywords: [template.jobFamily.toLowerCase(), ...template.skills.slice(0, 2), template.metro],
    suggestions: GENERIC_SUGGESTIONS,
    adviceKind: "general",
    topSearch: topSearchFor(query, profile.skills),
    rankedAt: "2026-09-15T12:00:00.000Z",
    profileVersion: "profile-v1",
    revision: 0,
    peopleAbove,
  };
  return { ...result, topThree: completeTopThree(result) };
}

export function ranksAbove(rank: number): { strongest: number[]; justAhead: number[] } {
  if (!Number.isFinite(rank) || rank <= 1) {
    return { strongest: [], justAhead: [] };
  }
  const strongest = [1, 2, 3].filter((n) => n < rank);
  const justAhead = [rank - 3, rank - 2, rank - 1].filter(
    (n) => n >= 1 && n < rank && !strongest.includes(n),
  );
  return { strongest, justAhead };
}

export function makePeopleAbove(
  handle: string,
  rank: number,
  template: (typeof JOB_TEMPLATES)[number],
): PeopleAboveGroups {
  const groups = ranksAbove(rank);
  const build = (personRank: number, bucket: string) => {
    const seed = fnv(`${handle}-${bucket}-${personRank}`);
    const first = FIRST_NAMES[(seed + personRank) % FIRST_NAMES.length];
    const last = LAST_NAMES[(seed >>> 3) % LAST_NAMES.length];
    return person(
      `${handle}-${bucket}-${personRank}`,
      personRank,
      `${first} ${last}`,
      `${template.title} at ${template.company}`,
      template.title,
      template.company,
      template.location,
      template.skills.slice(0, 2),
      4 + (seed % 8),
      AVATARS[(seed + personRank) % AVATARS.length],
    );
  };
  return {
    strongest: groups.strongest.map((n) => build(n, "top")),
    justAhead: groups.justAhead.map((n) => build(n, "near")),
  };
}

function fnv(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function topSearchFor(query: SearchQuery, skills: string[]): string {
  return `${query.jobTitle}s in ${query.location} with ${skills.slice(0, 2).join(" and ")} experience`;
}
