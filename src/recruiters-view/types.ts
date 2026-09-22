export type RankDisplay =
  | { kind: "exact"; rank: number; poolSize: number }
  | { kind: "band"; label: string; poolSize: number };

export type SearchQuery = {
  jobTitle: string;
  location: string;
  seniorityBand: string;
  companyType: string;
};

export type RankProfile = {
  handle: string;
  fullName: string;
  headline: string;
  title: string;
  company: string;
  location: string;
  metro: string;
  jobFamily: string;
  yearsExperience: number;
  skills: string[];
  avatar?: string;
};

export type RankedPerson = {
  id: string;
  rank: number;
  fullName: string;
  headline: string;
  title: string;
  company: string;
  location: string;
  skills: string[];
  yearsExperience: number;
  avatar?: string;
};

export type PeopleAboveGroups = {
  strongest: RankedPerson[];
  justAhead: RankedPerson[];
};

export type MatchedJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  workStyle: string;
  reason?: string;
  skills?: string[];
  url?: string;
};

export type RankLookupFound = {
  status: "found";
  inputUrl: string;
  profile: RankProfile;
  query: SearchQuery;
  ranking: RankDisplay;
  /** Independent algorithm-supplied reply score, on a 0–5 scale. Never inferred from rank. */
  recruiterReplyScore?: number | null;
  /** Previous published snapshot, captured after a completed profile recalculation. */
  previousRanking?: { profileHandle: string; query: SearchQuery; ranking: RankDisplay };
  keywords: string[];
  suggestions: string[];
  adviceKind: "personalized" | "general";
  /** Algorithm-owned query, not a count of observed recruiter activity. */
  topSearch: string;
  rankedAt: string;
  profileVersion: string;
  revision: number;
  peopleAbove: PeopleAboveGroups;
  topThree: RankedPerson[];
  /** Optional algorithm-supplied rows for the scrolling reveal. Missing rows use neutral placeholders. */
  rankingEntries?: RankedPerson[];
  jobs?: MatchedJob[];
};

export type RankLookupNotFound = {
  status: "not_found";
  inputUrl: string;
  handle: string;
  suggestions: string[];
};

export type RankLookupInvalid = {
  status: "invalid";
  inputUrl: string;
  message: string;
};

export type RankLookupResult = RankLookupFound | RankLookupNotFound | RankLookupInvalid;

export type LookupStep = "profile" | "query" | "rank";

export type LookupProgress = {
  step: LookupStep;
  query?: SearchQuery;
};

export type ExampleLookup = {
  id: string;
  url: string;
  label: string;
  title: string;
  location: string;
  outcome: "found" | "not_found";
};

export type LeaderboardRole = {
  title: string;
  location: string;
  poolSize: number;
};

export type LeaderboardCompany = {
  company: string;
  roleFamily: string;
  poolSize: number;
};

export type LeaderboardCity = {
  city: string;
  poolSize: number;
};

export type LeaderboardSnapshot = {
  checkedToday: number;
  competitiveRoles: LeaderboardRole[];
  visibleCompanies: LeaderboardCompany[];
  cities: LeaderboardCity[];
};
