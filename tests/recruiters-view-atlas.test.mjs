import assert from "node:assert/strict";
import test from "node:test";
import { scopeLabel } from "../src/recruiters-view/campaign.ts";
import { atlasBase, atlasEnabled, rankFromAtlas } from "../src/recruiters-view/atlas.ts";

test("atlas stays off outside the Vite dev env", () => {
  assert.equal(atlasEnabled(), false);
});

test("atlasBase uses the same-origin proxy", () => {
  assert.equal(atlasBase(), "/atlas");
});

test("rankFromAtlas maps title, cards, advice and first snapshot", () => {
  const result = rankFromAtlas("https://www.linkedin.com/in/you", "you", {
    rank: 24,
    total: 244,
    reply_score: 4.6,
    title: "Founding AI Engineer",
    location: "Canada",
    summary: "Founding AI Engineer from AI startups",
    highlights: { skills: ["Python", "Kubernetes"] },
    cohort: { label: "1–5 yr Backend Engineer peers", geo: "Canada" },
    self: { rank: 24, name: "You", title: "Founding AI Engineer", company: "Metix", avatar: "https://img/a.png" },
    top: [{ rank: 1, name: "Ada", title: "Staff Engineer", company: "Acme" }],
    ahead: [{ rank: 23, name: "Lin", title: "Backend Engineer", company: "Orb" }],
    advice: {
      personalized: true,
      items: [{ title: "Add Kubernetes", description: "If you use it, put it on Skills." }],
    },
    first: { rank: 28, total: 244 },
    jobs: [{
      id: "j1",
      title: "Founding AI Engineer",
      company: "Acme",
      location: "Toronto",
      workplace: "hybrid",
      url: "https://jobs.example/1",
    }],
  });
  assert.equal(result.status, "found");
  assert.equal(result.profile.fullName, "You");
  assert.equal(result.profile.company, "Metix");
  assert.equal(result.profile.yearsExperience, 1);
  assert.deepEqual(result.ranking, { kind: "exact", rank: 24, poolSize: 244 });
  assert.equal(result.recruiterReplyScore, 4.6);
  assert.equal(result.previousRanking?.ranking.rank, 28);
  assert.equal(result.adviceKind, "personalized");
  assert.match(result.suggestions[0], /Add Kubernetes/);
  assert.equal(result.peopleAbove.justAhead[0].fullName, "Lin");
  assert.equal(result.topThree[0].fullName, "Ada");
  assert.equal(result.query.seniorityBand, "1–5 yr");
  assert.equal(scopeLabel(result.query), "Founding AI Engineer · Canada · 1–5 yr");
  assert.equal(result.jobs[0].workStyle, "Hybrid");
  assert.equal(result.jobs[0].url, "https://jobs.example/1");
});

test("scopeLabel drops any industry and a repeated country", () => {
  assert.equal(
    scopeLabel({
      jobTitle: "Founding AI Engineer",
      location: "CAN",
      companyType: "",
      seniorityBand: "Founding AI Engineer peers · CAN · 0.7–4.7 yr · any industry",
    }),
    "Founding AI Engineer · CAN · 1–5 yr",
  );
});
