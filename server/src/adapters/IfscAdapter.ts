import { fixtureSnapshots } from "../fixtures/roundSnapshots.js";
import type { Appeal, Athlete, BoulderResult, CompetitionSnapshot, StartlistEntry } from "../types/domain.js";
import type { Browser, Page } from "playwright";

export interface RoundSource {
  nextSnapshot(): Promise<CompetitionSnapshot>;
  sourceName(): "fixture" | "ifsc-network";
  refreshMs(): number;
}

export class FixtureRoundSource implements RoundSource {
  private index = 0;

  async nextSnapshot(): Promise<CompetitionSnapshot> {
    const snapshot = fixtureSnapshots[this.index % fixtureSnapshots.length];
    this.index += 1;
    return {
      ...snapshot,
      receivedAt: new Date().toISOString()
    };
  }

  sourceName(): "fixture" {
    return "fixture";
  }

  refreshMs(): number {
    return 2_000;
  }
}

interface IfscRoutePosition {
  route_name: string;
  route_id: number;
  position: number;
}

interface IfscStartlistEntry {
  athlete_id: number;
  name: string;
  firstname?: string;
  lastname?: string;
  bib?: string;
  country: string;
  route_start_positions?: IfscRoutePosition[];
}

interface IfscAscent {
  route_id: number;
  route_name: string;
  top: boolean;
  top_tries?: number | null;
  zone: boolean;
  zone_tries?: number | null;
  points?: number | null;
  modified?: string | null;
  status?: string | null;
}

interface IfscRankingEntry {
  athlete_id: number;
  name: string;
  firstname?: string;
  lastname?: string;
  country: string;
  bib?: string;
  status?: string | null;
  rank?: number | string | null;
  score?: number | string | null;
  start_order?: number | string | null;
  group_rank?: number | string | null;
  starting_group?: string | null;
  ascents?: IfscAscent[];
  active?: boolean;
  under_appeal?: boolean;
}

interface IfscRoundPayload {
  id: number;
  event: string;
  event_id: number;
  status: string;
  status_as_of?: string;
  category: string;
  round: string;
  format_identifier?: string;
  ranking?: IfscRankingEntry[];
  startlist?: IfscStartlistEntry[];
}

export class IfscRestRoundSource implements RoundSource {
  private readonly endpoint: string;
  private readonly origin: string;
  private readonly roundUrl: string;
  private cookieHeader = process.env.IFSC_COOKIE ?? "";
  private csrfToken = "";

  constructor(roundUrl: string) {
    const parsed = parseRoundUrl(roundUrl);
    this.origin = parsed.origin;
    this.roundUrl = roundUrl;
    this.endpoint = `${parsed.origin}/api/v1/category_rounds/${parsed.categoryRoundId}/results`;
  }

  async nextSnapshot(): Promise<CompetitionSnapshot> {
    if (!this.cookieHeader) await this.initializeSession();
    let response = await fetch(this.endpoint, { headers: this.apiHeaders() });
    if (response.status === 401) {
      this.cookieHeader = "";
      this.csrfToken = "";
      await this.initializeSession();
      response = await fetch(this.endpoint, { headers: this.apiHeaders() });
    }
    if (!response.ok) throw new Error(`IFSC request failed ${response.status}: ${this.endpoint}`);
    const payload = unwrapIfscPayload(await response.json());
    return normalizeIfscPayload(payload, this.endpoint);
  }

  sourceName(): "ifsc-network" {
    return "ifsc-network";
  }

  refreshMs(): number {
    return 2_000;
  }

  private async initializeSession() {
    const page = await fetch(this.roundUrl, { headers: this.pageHeaders() });
    this.captureCookies(page);
    const html = await page.text().catch(() => "");
    this.csrfToken = extractCsrfToken(html);

    const entrypoint = await fetch(`${this.origin}/entrypoint`, { headers: this.apiHeaders() });
    this.captureCookies(entrypoint);

    const info = await fetch(`${this.origin}/api/v1/info`, { headers: this.apiHeaders() });
    this.captureCookies(info);
  }

  private pageHeaders(): Record<string, string> {
    return {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": browserUserAgent()
    };
  }

  private apiHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      accept: "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9",
      referer: this.roundUrl,
      "user-agent": browserUserAgent(),
      "x-requested-with": "XMLHttpRequest"
    };
    if (this.cookieHeader) headers.cookie = this.cookieHeader;
    if (this.csrfToken) headers["x-csrf-token"] = this.csrfToken;
    return headers;
  }

  private captureCookies(response: Response) {
    const cookies = getSetCookies(response.headers);
    if (cookies.length === 0) return;
    const jar = new Map(this.cookieHeader.split(";").map((cookie) => cookie.trim()).filter(Boolean).map((cookie) => {
      const [name, ...value] = cookie.split("=");
      return [name, value.join("=")] as const;
    }));
    for (const cookie of cookies) {
      const [pair] = cookie.split(";");
      const [name, ...value] = pair.split("=");
      if (name && value.length > 0) jar.set(name.trim(), value.join("=").trim());
    }
    this.cookieHeader = [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

export class IfscBrowserRoundSource implements RoundSource {
  private readonly endpoint: string;
  private readonly roundUrl: string;
  private browser?: Browser;
  private page?: Page;

  constructor(roundUrl: string) {
    const parsed = parseRoundUrl(roundUrl);
    this.roundUrl = roundUrl;
    this.endpoint = `${parsed.origin}/api/v1/category_rounds/${parsed.categoryRoundId}/results`;
  }

  async nextSnapshot(): Promise<CompetitionSnapshot> {
    const page = await this.ensurePage();
    const payload = await page.evaluate(async (url) => {
      const response = await fetch(url, {
        credentials: "include",
        headers: {
          accept: "application/json, text/plain, */*",
          "x-requested-with": "XMLHttpRequest"
        }
      });
      if (!response.ok) throw new Error(`Browser IFSC request failed ${response.status}: ${url}`);
      return response.json();
    }, this.endpoint) as IfscRoundPayload;
    return normalizeIfscPayload(unwrapIfscPayload(payload), this.endpoint);
  }

  sourceName(): "ifsc-network" {
    return "ifsc-network";
  }

  refreshMs(): number {
    return 2_000;
  }

  private async ensurePage() {
    if (this.page) return this.page;
    const { chromium } = await import("playwright");
    this.browser = await chromium.launch({ headless: true });
    const context = await this.browser.newContext({
      userAgent: browserUserAgent(),
      extraHTTPHeaders: {
        "accept-language": "en-US,en;q=0.9"
      }
    });
    const page = await context.newPage();
    this.page = page;
    await gotoWithRetry(page, this.roundUrl, 3);
    await page.waitForTimeout(1_500);
    return page;
  }
}

export class IfscAdapter {
  constructor(private readonly source: RoundSource = new FixtureRoundSource()) {}

  async fetchSnapshot(): Promise<CompetitionSnapshot> {
    return this.source.nextSnapshot();
  }

  sourceName() {
    return this.source.sourceName();
  }

  refreshMs() {
    return this.source.refreshMs();
  }
}

export function createRoundSourceFromEnv(): RoundSource {
  if (process.env.COMP_SOURCE === "demo-qualification") {
    return new DemoQualificationRoundSource();
  }
  if (process.env.COMP_SOURCE === "demo-semifinal") {
    return new DemoSingleGroupRoundSource("Semi-final", 24, [1, 3, 5, 7]);
  }
  if (process.env.COMP_SOURCE === "demo-final") {
    return new DemoSingleGroupRoundSource("Final", 8, [1, 5]);
  }
  if (process.env.COMP_SOURCE === "ifsc-browser") {
    return new IfscBrowserRoundSource(process.env.IFSC_ROUND_URL ?? "https://ifsc.results.info/event/1480/cr/10385");
  }
  if (process.env.COMP_SOURCE === "ifsc" || process.env.IFSC_ROUND_URL) {
    return new IfscRestRoundSource(process.env.IFSC_ROUND_URL ?? "https://ifsc.results.info/event/1480/cr/10385");
  }
  return new FixtureRoundSource();
}

export class DemoQualificationRoundSource implements RoundSource {
  private tick = 0;

  async nextSnapshot(): Promise<CompetitionSnapshot> {
    this.tick += 1;
    const now = new Date().toISOString();
    const appealAccepted = this.tick % 2 === 0;
    const activeNames = [
      ["qa01", "Oriane BERTONE", "FRA", "Group A", 1, 3, 2, true, false],
      ["qa02", "Mao NAKAMURA", "JPN", "Group A", 2, 4, 1, true, true],
      ["qa03", "Oceania MACKENZIE", "AUS", "Group A", 3, 5, 3, true, appealAccepted],
      ["qb01", "Erin MCNEICE", "GBR", "Group B", 1, 3, 1, true, false],
      ["qb02", "Ayala KEREM", "ISR", "Group B", 2, 4, 1, true, true],
      ["qb03", "Yuetong ZHANG", "CHN", "Group B", 3, 5, 2, true, false]
    ] as const;
    const nextNames = [
      ...demoQualificationEntries("qa", "Group A").filter((entry) => Number(entry[4]) > 3),
      ...demoQualificationEntries("qb", "Group B").filter((entry) => Number(entry[4]) > 3)
    ] as const;

    const activeResults = activeNames.map(([id, name, country, group, order, boulder, attempt, zone, top]) => {
      const boulders = demoBoulders(boulder, attempt, zone, top);
      if (id === "qa01") markExpired(boulders, 2);
      if (id === "qb01") markExpired(boulders, 1);
      return {
        athlete: demoAthlete(id, name, country, order),
        rank: 999,
        groupRank: 999,
        startingGroup: group,
        currentBoulder: boulder,
        score: scoreBoulders(boulders),
        boulders,
        sourceStatus: "active"
      };
    });
    const waitingResults = nextNames.map(([id, name, country, group, order, boulder]) => ({
      athlete: demoAthlete(id, name, country, order),
      rank: 999,
      groupRank: 999,
      startingGroup: group,
      nextBoulder: boulder,
      score: 0,
      boulders: emptyDemoBoulders(),
      sourceStatus: "waiting"
    }));
    assignDemoRanks([...activeResults, ...waitingResults]);

    return {
      sourceTimestamp: now,
      receivedAt: now,
      eventId: "demo",
      categoryRoundId: "demo-qualification",
      eventName: "Demo IFSC Boulder Qualification",
      roundName: "Women Qualification",
      formatIdentifier: "boulder_two_groups_ifsc_2026",
      athletes: [...activeResults, ...waitingResults],
      ranking: [...activeResults, ...waitingResults].map((result) => ({ athleteId: result.athlete.id, rank: result.rank, score: result.score })),
      startlist: [...activeResults, ...waitingResults].map((result, index) => ({ athleteId: result.athlete.id, order: index + 1 })),
      appeals: [{
        athleteId: "qa03",
        status: appealAccepted ? "Accepted" : "Under Appeal",
        boulderNo: 3,
        sourceText: appealAccepted ? "Appeal Accepted" : "Under Appeal",
        confidence: { value: 96, reason: "Demo appeal state.", source: "official" }
      }],
      rawRef: "demo://qualification-active"
    };
  }

  sourceName(): "fixture" {
    return "fixture";
  }

  refreshMs(): number {
    return 2_000;
  }
}

export class DemoSingleGroupRoundSource implements RoundSource {
  constructor(private readonly roundName: "Semi-final" | "Final", private readonly fieldSize: number, private readonly activeOrders: number[]) {}

  async nextSnapshot(): Promise<CompetitionSnapshot> {
    const now = new Date().toISOString();
    const names = [
      "Erin MCNEICE", "Oriane BERTONE", "Mao NAKAMURA", "Miho NONAKA", "Melody SEKIKAWA", "Oceania MACKENZIE", "Annie SANDERS", "Ayala KEREM",
      "Camilla MORONI", "Chaehyun SEO", "Futaba ITO", "Zelia AVEZOU", "Yuetong ZHANG", "Stella GIACANI", "Geila MACIA", "Lucile SAUREL",
      "Madison RICHARDSON", "Nekaia SANDERS", "Anon MATSUFUJI", "Jennifer BUCKLEY", "Chloe CAULIER", "Emma EDWARDS", "Melina COSTANZA", "Giorgia TESIO", "Selma ELHADJ"
    ].slice(0, this.fieldSize);
    const countries = ["GBR", "FRA", "JPN", "JPN", "JPN", "AUS", "USA", "ISR", "ITA", "KOR", "JPN", "FRA", "CHN", "ITA", "ESP", "FRA", "GBR", "USA", "JPN", "SLO", "FRA", "GBR", "ITA", "ITA", "FRA"];
    const activeSet = new Set(this.activeOrders);

    const results = names.map((name, index) => {
      const startOrder = index + 1;
      const isActive = activeSet.has(startOrder);
      const activeIndex = this.activeOrders.indexOf(startOrder);
      const nextBoulder = isActive ? activeIndex + 1 : undefined;
      const waitingNextBoulder = !isActive ? this.expectedWaitingBoulder(startOrder) : undefined;
      const boulders = isActive ? demoBouldersForCount(4, nextBoulder ?? 1, 1 + activeIndex, activeIndex % 2 === 0, false) : emptyDemoBoulders(4);
      if (isActive && activeIndex === this.activeOrders.length - 1) markExpired(boulders, nextBoulder ?? 1);
      return {
        athlete: demoAthlete(`sg${startOrder}`, name, countries[index], startOrder),
        rank: 999,
        score: isActive || startOrder < Math.min(...this.activeOrders) ? scoreBoulders(boulders) : 0,
        nextBoulder: nextBoulder ?? waitingNextBoulder,
        currentBoulder: nextBoulder,
        boulders,
        sourceStatus: isActive ? "active" : "waiting"
      };
    });
    assignDemoRanks(results);

    return {
      sourceTimestamp: now,
      receivedAt: now,
      eventId: "demo",
      categoryRoundId: `demo-${this.roundName.toLowerCase()}`,
      eventName: `Demo IFSC Boulder ${this.roundName}`,
      roundName: `Women ${this.roundName}`,
      formatIdentifier: this.roundName === "Final" ? "boulder_finals_ifsc_2026" : "boulder_one_group_ifsc_2026",
      athletes: results,
      ranking: results.map((result) => ({ athleteId: result.athlete.id, rank: result.rank, score: result.score })),
      startlist: results.map((result) => ({ athleteId: result.athlete.id, order: result.athlete.startOrder })),
      appeals: [],
      rawRef: `demo://${this.roundName.toLowerCase()}-active`
    };
  }

  sourceName(): "fixture" {
    return "fixture";
  }

  refreshMs(): number {
    return 2_000;
  }

  private expectedWaitingBoulder(startOrder: number) {
    if (this.roundName === "Semi-final") {
      const index = [9, 11, 13, 15].indexOf(startOrder);
      return index >= 0 ? index + 1 : undefined;
    }
    const index = [2, 6].indexOf(startOrder);
    return index >= 0 ? index + 1 : undefined;
  }
}

function demoAthlete(id: string, name: string, country: string, startOrder: number): Athlete {
  return { id, name, country, countryCode: iso3ToIso2(country), bib: startOrder, startOrder };
}

function demoQualificationEntries(prefix: "qa" | "qb", group: "Group A" | "Group B"): [string, string, string, "Group A" | "Group B", number, number][] {
  return Array.from({ length: 40 }, (_, index) => {
    const order = index + 1;
    return [
      `${prefix}${String(order).padStart(2, "0")}`,
      `${prefix === "qa" ? "A" : "B"} CLIMBER${String(order).padStart(2, "0")}`,
      demoCountry(index + (prefix === "qb" ? 40 : 0)),
      group,
      order,
      ((order - 1) % 5) + 1
    ];
  });
}

function demoName(index: number) {
  const names = [
    "Jennifer BUCKLEY", "Futaba ITO", "Chaehyun SEO", "Stella GIACANI", "Geila MACIA", "Zelia AVEZOU", "Anon MATSUFUJI", "Madison RICHARDSON",
    "Lucile SAUREL", "Nekaia SANDERS", "Melody SEKIKAWA", "Camilla MORONI", "Miho NONAKA", "Annie SANDERS", "Ayala KEREM", "Yuetong ZHANG",
    "Erin MCNEICE", "Oriane BERTONE", "Mao NAKAMURA", "Oceania MACKENZIE", "Chloe CAULIER", "Emma EDWARDS", "Melina COSTANZA", "Giorgia TESIO",
    "Selma ELHADJ", "Molly THOMPSON-SMITH", "Natalia GROSSMAN", "Brooke RABOUTOU", "Seo CHAEHYUN", "Laura ROGORA", "Janja GARNBRET", "Jessica PILZ",
    "Mia KRAMPL", "Margo HAYES", "Luo ZHILU", "Ai MORI", "Ievgeniia KAZBEKOVA", "Hannah MEUL", "Lena DRAPER", "Elnaz REKABI"
  ];
  return names[index % names.length];
}

function demoCountry(index: number) {
  const countries = ["SLO", "JPN", "KOR", "ITA", "ESP", "FRA", "JPN", "GBR", "FRA", "USA", "JPN", "ITA", "JPN", "USA", "ISR", "CHN", "GBR", "FRA", "JPN", "AUS"];
  return countries[index % countries.length];
}

function demoBoulders(current: number, attempt: number, zone: boolean, top: boolean): BoulderResult[] {
  return demoBouldersForCount(5, current, attempt, zone, top);
}

function demoBouldersForCount(count: number, current: number, attempt: number, zone: boolean, top: boolean): BoulderResult[] {
  return Array.from({ length: count }, (_, index) => index + 1).map((boulderNo) => ({
    boulderNo,
    attemptsToZone: boulderNo === current ? attempt : boulderNo < current ? 1 : undefined,
    attemptsToTop: boulderNo < current ? 1 : top ? attempt : undefined,
    hasZone: boulderNo < current || (boulderNo === current && zone),
    hasTop: boulderNo < current || (boulderNo === current && top),
    rawStatus: boulderNo === current ? `A${attempt}` : boulderNo < current ? "confirmed" : ""
  }));
}

function markExpired(boulders: BoulderResult[], boulderNo: number) {
  const boulder = boulders.find((item) => item.boulderNo === boulderNo);
  if (!boulder) return;
  boulder.hasZone = false;
  boulder.hasTop = false;
  boulder.attemptsToZone = undefined;
  boulder.attemptsToTop = undefined;
  boulder.rawStatus = "expired";
}

function scoreBoulders(boulders: BoulderResult[]) {
  return Number(boulders.reduce((total, boulder) => {
    if (boulder.hasTop) return total + 25 - 0.1 * Math.max(0, (boulder.attemptsToTop ?? 1) - 1);
    if (boulder.hasZone) return total + 10 - 0.1 * Math.max(0, (boulder.attemptsToZone ?? 1) - 1);
    return total;
  }, 0).toFixed(1));
}

function assignDemoRanks<T extends { score: number; rank: number; groupRank?: number; startingGroup?: string; athlete: Athlete }>(results: T[]) {
  const groups = [...new Set(results.map((result) => result.startingGroup ?? "All"))];
  for (const group of groups) {
    const sorted = results
      .filter((result) => (result.startingGroup ?? "All") === group)
      .sort((a, b) => b.score - a.score || a.athlete.startOrder - b.athlete.startOrder);
    sorted.forEach((result, index) => {
      result.rank = index + 1;
      if (result.startingGroup) result.groupRank = index + 1;
    });
  }
}

function emptyDemoBoulders(count = 5): BoulderResult[] {
  return Array.from({ length: count }, (_, index) => index + 1).map((boulderNo) => ({ boulderNo, hasZone: false, hasTop: false, rawStatus: "" }));
}

function parseRoundUrl(roundUrl: string) {
  const url = new URL(roundUrl);
  const match = url.pathname.match(/\/event\/(\d+)\/cr\/(\d+)/);
  if (!match) throw new Error(`Unsupported IFSC round URL: ${roundUrl}`);
  return { origin: url.origin, eventId: match[1], categoryRoundId: match[2] };
}

function browserUserAgent() {
  return "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
}

function getSetCookies(headers: Headers) {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  const values = withGetSetCookie.getSetCookie?.();
  if (values && values.length > 0) return values;
  const combined = headers.get("set-cookie");
  return combined ? splitSetCookie(combined) : [];
}

function splitSetCookie(value: string) {
  return value.split(/,(?=\s*[^;,\s]+=)/g).map((cookie) => cookie.trim()).filter(Boolean);
}

function extractCsrfToken(html: string) {
  return html.match(/<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? "";
}

async function gotoWithRetry(page: { goto: (url: string, options: { waitUntil: "domcontentloaded"; timeout: number }) => Promise<unknown>; waitForTimeout: (ms: number) => Promise<void> }, url: string, attempts: number) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(1_500 * attempt);
    }
  }
  throw lastError;
}

export function normalizeIfscPayload(payload: IfscRoundPayload, endpoint: string): CompetitionSnapshot {
  const receivedAt = new Date().toISOString();
  const ranking = payload.ranking ?? [];
  const startlist = payload.startlist ?? [];
  const startlistAthletes = new Map(startlist.map((entry) => [String(entry.athlete_id), toAthlete(entry, startOrderFromStartlist(entry))]));
  const rankingAthletes = ranking.map((entry) => toAthlete(entry, numberOrFallback(entry.start_order, startlistAthletes.get(String(entry.athlete_id))?.startOrder ?? 999)));
  const athleteIds = new Set([...ranking.map((entry) => String(entry.athlete_id)), ...startlist.map((entry) => String(entry.athlete_id))]);

  const rankingById = new Map(ranking.map((entry) => [String(entry.athlete_id), entry]));
  const athletes = [...athleteIds].map((id) => {
    const ranking = rankingById.get(id);
    const athlete = ranking ? toAthlete(ranking, numberOrFallback(ranking.start_order, startlistAthletes.get(id)?.startOrder ?? 999)) : startlistAthletes.get(id)!;
    const resultStatus = ranking ? rankingStatus(ranking) : undefined;
    const boulders = ranking?.ascents?.map(toBoulderResult).sort((a, b) => a.boulderNo - b.boulderNo) ?? emptyBouldersFromStartlist(startlist.find((entry) => String(entry.athlete_id) === id));
    return {
      athlete,
      rank: numberOrFallback(ranking?.rank, 999),
      groupRank: ranking?.group_rank === undefined || ranking?.group_rank === null ? undefined : numberOrFallback(ranking.group_rank, 999),
      startingGroup: ranking?.starting_group ?? undefined,
      currentBoulder: ranking?.active ? activeBoulderFromAscents(ranking.ascents) : undefined,
      score: numberOrFallback(ranking?.score, 0),
      boulders: isDnsStatus(resultStatus) ? boulders.map((boulder) => ({ ...boulder, rawStatus: boulder.rawStatus || "DNS" })) : boulders,
      sourceStatus: ranking?.active ? "active" : ranking?.under_appeal ? "under_appeal" : resultStatus
    };
  });

  return {
    sourceTimestamp: toIso(payload.status_as_of) ?? receivedAt,
    receivedAt,
    eventId: String(payload.event_id),
    categoryRoundId: String(payload.id),
    eventName: payload.event ?? "IFSC Boulder Competition",
    roundName: `${payload.category ?? "Category"} ${payload.round ?? "Round"}`,
    formatIdentifier: payload.format_identifier,
    athletes,
    ranking: ranking.map((entry) => ({
      athleteId: String(entry.athlete_id),
      rank: numberOrFallback(entry.rank, 999),
      score: numberOrFallback(entry.score, 0)
    })),
    startlist: buildStartlist(startlist, rankingAthletes),
    appeals: buildAppeals(ranking),
    rawRef: endpoint
  };
}

function unwrapIfscPayload(payload: unknown): IfscRoundPayload {
  if (isRoundPayload(payload)) return payload;
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["data", "category_round", "categoryRound", "result", "round"]) {
      if (isRoundPayload(record[key])) return record[key];
    }
  }
  throw new Error("Unsupported IFSC payload shape. The round may use a different results endpoint.");
}

function isRoundPayload(value: unknown): value is IfscRoundPayload {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<IfscRoundPayload>;
  return Array.isArray(record.ranking) || Array.isArray(record.startlist);
}

function numberOrFallback(value: number | string | null | undefined, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toAthlete(entry: IfscRankingEntry | IfscStartlistEntry, startOrder: number): Athlete {
  return {
    id: String(entry.athlete_id),
    name: displayName(entry),
    country: entry.country,
    countryCode: iso3ToIso2(entry.country),
    bib: entry.bib ? Number(entry.bib) : undefined,
    startOrder
  };
}

function displayName(entry: IfscRankingEntry | IfscStartlistEntry) {
  if (entry.firstname && entry.lastname) return `${entry.firstname} ${entry.lastname}`;
  return entry.name;
}

function toBoulderResult(ascent: IfscAscent): BoulderResult {
  const status = ascent.status ?? "";
  return {
    boulderNo: routeNoFromAscent(ascent),
    attemptsToZone: ascent.zone_tries ?? undefined,
    attemptsToTop: ascent.top_tries ?? undefined,
    hasZone: Boolean(ascent.zone),
    hasTop: Boolean(ascent.top),
    rawStatus: status || (ascent.top ? `T${ascent.top_tries ?? ""}` : ascent.zone ? `Z${ascent.zone_tries ?? ""}` : "")
  };
}

function rankingStatus(entry: IfscRankingEntry) {
  const candidates = [entry.status, entry.rank, entry.score].map((value) => String(value ?? ""));
  return candidates.find((value) => isDnsStatus(value)) ?? entry.status ?? undefined;
}

function isDnsStatus(value?: string) {
  return /\bDNS\b|did not start/i.test(value ?? "");
}

function activeBoulderFromAscents(ascents?: IfscAscent[]) {
  const activeAscents = (ascents ?? []).filter((ascent) => ascent.status !== "confirmed");
  const latestModified = activeAscents
    .map((ascent) => ({ ascent, timestamp: ascent.modified ? Date.parse(ascent.modified) : Number.NaN }))
    .filter((entry) => Number.isFinite(entry.timestamp))
    .sort((a, b) => b.timestamp - a.timestamp)[0]?.ascent;
  const active = latestModified ?? activeAscents[0];
  if (!active) return undefined;
  return routeNoFromAscent(active);
}

function routeNoFromAscent(ascent: IfscAscent) {
  const routeNo = Number(ascent.route_name);
  if (Number.isFinite(routeNo)) return routeNo;
  const embedded = String(ascent.route_name ?? "").match(/\d+/)?.[0];
  if (embedded) return Number(embedded);
  return ascent.route_id;
}

function emptyBouldersFromStartlist(entry?: IfscStartlistEntry): BoulderResult[] {
  const routes = entry?.route_start_positions?.map((route) => Number(route.route_name)).filter(Number.isFinite) ?? [1, 2, 3, 4, 5];
  return routes.map((boulderNo) => ({ boulderNo, hasZone: false, hasTop: false, rawStatus: "" }));
}

function buildStartlist(startlist: IfscStartlistEntry[], rankingAthletes: Athlete[]): StartlistEntry[] {
  if (startlist.length > 0) {
    return startlist
      .map((entry) => ({ athleteId: String(entry.athlete_id), order: startOrderFromStartlist(entry) }))
      .sort((a, b) => a.order - b.order || Number(a.athleteId) - Number(b.athleteId));
  }
  return rankingAthletes.map((athlete) => ({ athleteId: athlete.id, order: athlete.startOrder }));
}

function startOrderFromStartlist(entry: IfscStartlistEntry) {
  const positions = entry.route_start_positions?.map((position) => position.position) ?? [];
  return Math.min(...positions, 999);
}

function buildAppeals(ranking: IfscRankingEntry[]): Appeal[] {
  return ranking.flatMap((entry) => {
    const appealAscents = (entry.ascents ?? []).filter((ascent) => /appeal|accepted|rejected/i.test(ascent.status ?? ""));
    if (!entry.under_appeal && appealAscents.length === 0) return [];
    const ascent = appealAscents[0];
    const sourceText = ascent?.status ?? (entry.under_appeal ? "Under Appeal" : "Appeal");
    return [{
      athleteId: String(entry.athlete_id),
      status: appealStatusFromText(sourceText),
      boulderNo: ascent ? Number(ascent.route_name) : undefined,
      sourceText,
      confidence: {
        value: ascent ? 96 : 90,
        reason: ascent ? "Appeal status found on official ascent status." : "Official athlete under_appeal flag is true.",
        source: "official"
      }
    } satisfies Appeal];
  });
}

function appealStatusFromText(text: string): Appeal["status"] {
  if (/accepted/i.test(text)) return "Accepted";
  if (/rejected/i.test(text)) return "Rejected";
  if (/pending/i.test(text)) return "Pending";
  return "Under Appeal";
}

function toIso(value?: string | null) {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function iso3ToIso2(code: string) {
  const map: Record<string, string> = {
    AUS: "AU", AUT: "AT", BEL: "BE", BRA: "BR", CAN: "CA", CHN: "CN", CZE: "CZ", ESP: "ES", FRA: "FR", GBR: "GB",
    GER: "DE", HUN: "HU", ISR: "IL", ITA: "IT", JPN: "JP", KOR: "KR", NED: "NL", POL: "PL", SLO: "SI", SUI: "CH",
    UKR: "UA", USA: "US"
  };
  return map[code] ?? code.slice(0, 2);
}
