import type { CompetitionSnapshot } from "../types/domain.js";

const base = {
  eventId: "1480",
  categoryRoundId: "10385",
  eventName: "IFSC Boulder World Cup",
  roundName: "Men Boulder Final",
  rawRef: "fixture://round-10385",
  startlist: [
    { athleteId: "anraku", order: 1 },
    { athleteId: "lee", order: 2 },
    { athleteId: "schalck", order: 3 },
    { athleteId: "narasaki", order: 4 },
    { athleteId: "duffy", order: 5 },
    { athleteId: "baudrand", order: 6 }
  ]
};

const athletes = {
  anraku: { id: "anraku", name: "Sorato Anraku", country: "Japan", countryCode: "JP", bib: 11, startOrder: 1 },
  lee: { id: "lee", name: "Dohyun Lee", country: "Korea", countryCode: "KR", bib: 22, startOrder: 2 },
  schalck: { id: "schalck", name: "Mejdi Schalck", country: "France", countryCode: "FR", bib: 33, startOrder: 3 },
  narasaki: { id: "narasaki", name: "Tomoa Narasaki", country: "Japan", countryCode: "JP", bib: 44, startOrder: 4 },
  duffy: { id: "duffy", name: "Colin Duffy", country: "United States", countryCode: "US", bib: 55, startOrder: 5 },
  baudrand: { id: "baudrand", name: "Oscar Baudrand", country: "France", countryCode: "FR", bib: 66, startOrder: 6 }
};

const emptyBoulders = () =>
  [1, 2, 3, 4, 5].map((boulderNo) => ({ boulderNo, hasZone: false, hasTop: false, rawStatus: "" }));

export const fixtureSnapshots: CompetitionSnapshot[] = [
  {
    ...base,
    sourceTimestamp: "2026-06-03T06:22:03.000Z",
    receivedAt: "2026-06-03T06:22:03.200Z",
    athletes: [
      { athlete: athletes.anraku, rank: 3, score: 109.4, boulders: [
        { boulderNo: 1, hasZone: true, hasTop: true, attemptsToZone: 1, attemptsToTop: 2, rawStatus: "T2" },
        { boulderNo: 2, hasZone: true, hasTop: true, attemptsToZone: 1, attemptsToTop: 1, rawStatus: "T1" },
        { boulderNo: 3, hasZone: true, hasTop: false, attemptsToZone: 2, rawStatus: "Z2" },
        { boulderNo: 4, hasZone: false, hasTop: false, attemptsToZone: 0, rawStatus: "A1" },
        { boulderNo: 5, hasZone: false, hasTop: false, rawStatus: "" }
      ] },
      { athlete: athletes.lee, rank: 1, score: 113.5, boulders: [
        { boulderNo: 1, hasZone: true, hasTop: true, attemptsToZone: 1, attemptsToTop: 1, rawStatus: "T1" },
        { boulderNo: 2, hasZone: false, hasTop: false, attemptsToZone: 0, rawStatus: "A1" },
        ...emptyBoulders().slice(2)
      ] },
      { athlete: athletes.schalck, rank: 5, score: 96.8, boulders: emptyBoulders(), sourceStatus: "Under Appeal" },
      { athlete: athletes.narasaki, rank: 4, score: 101.2, boulders: emptyBoulders() },
      { athlete: athletes.duffy, rank: 2, score: 111.6, boulders: emptyBoulders() },
      { athlete: athletes.baudrand, rank: 6, score: 92.1, boulders: emptyBoulders() }
    ],
    ranking: [
      { athleteId: "lee", rank: 1, score: 113.5 },
      { athleteId: "duffy", rank: 2, score: 111.6 },
      { athleteId: "anraku", rank: 3, score: 109.4 },
      { athleteId: "narasaki", rank: 4, score: 101.2 },
      { athleteId: "schalck", rank: 5, score: 96.8 },
      { athleteId: "baudrand", rank: 6, score: 92.1 }
    ],
    appeals: [
      {
        athleteId: "schalck",
        status: "Under Appeal",
        boulderNo: 2,
        filedAt: "2026-06-03T06:21:15.000Z",
        sourceText: "Under Appeal",
        confidence: { value: 95, reason: "Appeal text present in source result status.", source: "official" }
      }
    ]
  },
  {
    ...base,
    sourceTimestamp: "2026-06-03T06:22:51.000Z",
    receivedAt: "2026-06-03T06:22:51.200Z",
    athletes: [
      { athlete: athletes.anraku, rank: 3, score: 119.4, boulders: [
        { boulderNo: 1, hasZone: true, hasTop: true, attemptsToZone: 1, attemptsToTop: 2, rawStatus: "T2" },
        { boulderNo: 2, hasZone: true, hasTop: true, attemptsToZone: 1, attemptsToTop: 1, rawStatus: "T1" },
        { boulderNo: 3, hasZone: true, hasTop: false, attemptsToZone: 2, rawStatus: "Z2" },
        { boulderNo: 4, hasZone: true, hasTop: false, attemptsToZone: 2, rawStatus: "Z2" },
        { boulderNo: 5, hasZone: false, hasTop: false, rawStatus: "" }
      ] },
      { athlete: athletes.lee, rank: 1, score: 113.5, boulders: [
        { boulderNo: 1, hasZone: true, hasTop: true, attemptsToZone: 1, attemptsToTop: 1, rawStatus: "T1" },
        { boulderNo: 2, hasZone: false, hasTop: false, attemptsToZone: 0, rawStatus: "A1" },
        ...emptyBoulders().slice(2)
      ] },
      { athlete: athletes.schalck, rank: 5, score: 96.8, boulders: emptyBoulders(), sourceStatus: "Under Appeal" },
      { athlete: athletes.narasaki, rank: 4, score: 101.2, boulders: emptyBoulders() },
      { athlete: athletes.duffy, rank: 2, score: 111.6, boulders: emptyBoulders() },
      { athlete: athletes.baudrand, rank: 6, score: 92.1, boulders: emptyBoulders() }
    ],
    ranking: [
      { athleteId: "lee", rank: 1, score: 113.5 },
      { athleteId: "duffy", rank: 2, score: 111.6 },
      { athleteId: "anraku", rank: 3, score: 119.4 },
      { athleteId: "narasaki", rank: 4, score: 101.2 },
      { athleteId: "schalck", rank: 5, score: 96.8 },
      { athleteId: "baudrand", rank: 6, score: 92.1 }
    ],
    appeals: [
      {
        athleteId: "schalck",
        status: "Under Appeal",
        boulderNo: 2,
        filedAt: "2026-06-03T06:21:15.000Z",
        sourceText: "Under Appeal",
        confidence: { value: 95, reason: "Appeal text present in source result status.", source: "official" }
      }
    ]
  },
  {
    ...base,
    sourceTimestamp: "2026-06-03T06:23:44.000Z",
    receivedAt: "2026-06-03T06:23:44.200Z",
    athletes: [
      { athlete: athletes.anraku, rank: 1, score: 124.4, boulders: [
        { boulderNo: 1, hasZone: true, hasTop: true, attemptsToZone: 1, attemptsToTop: 2, rawStatus: "T2" },
        { boulderNo: 2, hasZone: true, hasTop: true, attemptsToZone: 1, attemptsToTop: 1, rawStatus: "T1" },
        { boulderNo: 3, hasZone: true, hasTop: false, attemptsToZone: 2, rawStatus: "Z2" },
        { boulderNo: 4, hasZone: true, hasTop: true, attemptsToZone: 2, attemptsToTop: 3, rawStatus: "T3" },
        { boulderNo: 5, hasZone: false, hasTop: false, rawStatus: "" }
      ] },
      { athlete: athletes.lee, rank: 2, score: 113.5, boulders: [
        { boulderNo: 1, hasZone: true, hasTop: true, attemptsToZone: 1, attemptsToTop: 1, rawStatus: "T1" },
        { boulderNo: 2, hasZone: false, hasTop: false, attemptsToZone: 0, rawStatus: "A1" },
        ...emptyBoulders().slice(2)
      ] },
      { athlete: athletes.schalck, rank: 5, score: 96.8, boulders: emptyBoulders(), sourceStatus: "Accepted" },
      { athlete: athletes.narasaki, rank: 4, score: 101.2, boulders: emptyBoulders() },
      { athlete: athletes.duffy, rank: 3, score: 111.6, boulders: emptyBoulders() },
      { athlete: athletes.baudrand, rank: 6, score: 92.1, boulders: emptyBoulders() }
    ],
    ranking: [
      { athleteId: "anraku", rank: 1, score: 124.4 },
      { athleteId: "lee", rank: 2, score: 113.5 },
      { athleteId: "duffy", rank: 3, score: 111.6 },
      { athleteId: "narasaki", rank: 4, score: 101.2 },
      { athleteId: "schalck", rank: 5, score: 96.8 },
      { athleteId: "baudrand", rank: 6, score: 92.1 }
    ],
    appeals: [
      {
        athleteId: "schalck",
        status: "Accepted",
        boulderNo: 2,
        filedAt: "2026-06-03T06:21:15.000Z",
        resolvedAt: "2026-06-03T06:23:30.000Z",
        sourceText: "Appeal Accepted",
        confidence: { value: 95, reason: "Accepted appeal text present in source result status.", source: "official" }
      }
    ]
  }
];
