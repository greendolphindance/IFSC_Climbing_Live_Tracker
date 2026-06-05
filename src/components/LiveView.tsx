import { useEffect, useMemo, useRef, useState } from "react";
import type { AthleteRoundResult, CompetitionEvent, CompetitionState } from "../../server/src/types/domain";
import { athleteById, flag } from "../lib/format";

interface Props {
  state: CompetitionState;
  mode: "routes" | "athletes" | "feed";
}

export function LiveView({ state, mode }: Props) {
  const summaryEvents = state.events
    .filter((event) => event.type !== "SNAPSHOT_RECEIVED");

  if (mode === "feed") {
    return (
      <main className="feed-layout">
        <EventFeed events={summaryEvents} athletes={state.snapshot.athletes} />
      </main>
    );
  }

  if (mode === "athletes") {
    return (
      <main className="live-layout athlete-layout">
        <section className="main-column">
          <RankingPanel state={state} boxed splitGroups compactWidth />
        </section>
        <aside className="side-column">
          <RouteSummaryPanel state={state} />
          <div className="desktop-event-feed athlete-side-feed">
            <EventFeed events={summaryEvents} athletes={state.snapshot.athletes} />
          </div>
        </aside>
      </main>
    );
  }

  return (
    <main className="live-layout routes-layout">
      <section className="main-column">
        <RoutePanel state={state} />
        <div className="desktop-event-feed route-feed">
          <EventFeed events={summaryEvents} athletes={state.snapshot.athletes} />
        </div>
      </section>
      <aside className="side-column">
        <RankingPanel state={state} />
      </aside>
    </main>
  );
}

function RoutePanel({ state, compact = false }: { state: CompetitionState; compact?: boolean }) {
  const routeGroups = groupedRoutes(state);
  const isMobile = useIsMobile();
  const [selectedGroup, setSelectedGroup] = useState(() => readStoredValue("ifsc-route-view-group", routeGroups[0]?.name ?? "Routes"));
  useEffect(() => {
    const names = routeGroups.map((group) => group.name);
    if (!names.includes(selectedGroup)) setSelectedGroup(names[0] ?? "Routes");
  }, [routeGroups, selectedGroup]);
  useEffect(() => {
    window.localStorage.setItem("ifsc-route-view-group", selectedGroup);
  }, [selectedGroup]);
  return (
    <section className="panel focus-panel">
      <div className="section-title route-heading">
        <span>{compact ? "Routes" : "Route View"}</span>
        {isMobile && routeGroups.length > 1 && (
          <button type="button" className={`switch-toggle heading-switch ${selectedGroup === routeGroups[1]?.name ? "on" : ""}`} onClick={() => setSelectedGroup(selectedGroup === routeGroups[0].name ? routeGroups[1].name : routeGroups[0].name)}>
            <span />
            <strong>{selectedGroup}</strong>
          </button>
        )}
      </div>
      <div className="climber-list grouped">
        {routeGroups.map((group) => (
          <section className={`climber-group ${selectedGroup === group.name ? "selected-mobile-group" : ""}`} key={group.name}>
            {routeGroups.length > 1 && <div className="group-title">{group.name}</div>}
            <div className="route-row">
              {group.routes.map((route) => (
                <RouteTile key={`${group.name}-${route.boulderNo}`} state={state} route={route} showNext={!compact} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function RouteTile({ state, route, showNext }: { state: CompetitionState; route: RouteSlot; showNext: boolean }) {
  const live = route.live;
  const result = live ? athleteById(state.snapshot.athletes, live.athleteId) : undefined;
  const next = showNext ? nextForRoute(state, route.group, route.boulderNo) : undefined;
  return (
    <article className={`route-tile ${live ? "active-route" : ""}`}>
      <div className="route-header">
        <div className="route-id">{routeLabel(state, route.group, route.boulderNo)}</div>
        <div className="athlete-name">{result ? displayName(result.athlete.name) : "Open"}</div>
      </div>
      {result && live ? (
        <>
          <div className="route-body">
            <MiniBoulders boulders={result.boulders} currentBoulder={live.currentBoulder} currentAttempt={live.currentAttempt} />
            <div className="score-block">
              <span>{live.score.toFixed(1)}</span>
              <strong>#{live.groupRank ?? live.rank}</strong>
            </div>
          </div>
          {showNext && <div className="next-line">Next: {next ? `${flag(next.countryCode)} ${displayName(next.name)}` : "-"}</div>}
        </>
      ) : (
        <div className="empty-route">No climber</div>
      )}
    </article>
  );
}

function RouteSummaryPanel({ state }: { state: CompetitionState }) {
  const routeGroups = groupedRoutes(state);
  return (
    <section className="panel">
      <div className="section-title">Routes</div>
      <div className="route-summary-panel">
        {routeGroups.map((group) => (
          <section className="ranking-group" key={group.name}>
            {routeGroups.length > 1 && <div className="ranking-group-title">{group.name}</div>}
            <div className="ranking-list">
              {group.routes.map((route) => (
                <RouteSummaryRow state={state} route={route} key={`${group.name}-${route.boulderNo}`} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function RouteSummaryRow({ state, route }: { state: CompetitionState; route: RouteSlot }) {
  const live = route.live;
  const result = live ? athleteById(state.snapshot.athletes, live.athleteId) : undefined;
  return (
    <div className={`ranking-row route-summary-row ${live ? "active-ranking" : ""}`}>
      <strong>{routeLabel(state, route.group, route.boulderNo)}</strong>
      <span className="ranking-name">{result ? displayName(result.athlete.name) : "Open"}</span>
      {result && live ? (
        <>
          <RankingBoulders boulders={result.boulders} currentBoulder={live.currentBoulder} currentAttempt={live.currentAttempt} />
          <span className="ranking-score">{live.score.toFixed(1)}</span>
        </>
      ) : (
        <>
          <span className="ranking-empty-cells">-</span>
          <span className="ranking-score muted-score">-</span>
        </>
      )}
    </div>
  );
}

function RankingPanel({ state, boxed = false, splitGroups = false, compactWidth = false }: { state: CompetitionState; boxed?: boolean; splitGroups?: boolean; compactWidth?: boolean }) {
  const isMobile = useIsMobile();
  const rankingGroups = groupedRankings(state, splitGroups && !isMobile);
  const grouped = rankingGroups.filter((group) => !group.continuation);
  const groupStorageKey = splitGroups ? "ifsc-athlete-ranking-group" : "ifsc-route-ranking-group";
  const [selectedGroup, setSelectedGroup] = useState(() => readStoredValue(groupStorageKey, grouped[0]?.name ?? "All"));
  const [compactRows, setCompactRows] = useState(() => readStoredBool("ifsc-athlete-ranking-compact", false));
  const shouldSelectGroup = grouped.length > 1 && (!splitGroups || isMobile);
  const visibleGroups = shouldSelectGroup ? rankingGroups.filter((group) => group.name === selectedGroup) : rankingGroups;
  const visibleResultCount = visibleGroups.reduce((total, group) => total + group.results.length, 0);
  const activeIds = useMemo(() => new Set(state.currentClimbers.map((climber) => climber.athleteId)), [state.currentClimbers]);
  const split = splitGroups && rankingGroups.length > 1 && !shouldSelectGroup;
  useEffect(() => {
    const names = grouped.map((group) => group.name);
    if (!names.includes(selectedGroup)) setSelectedGroup(names[0] ?? "All");
  }, [grouped, selectedGroup]);
  useEffect(() => {
    window.localStorage.setItem(groupStorageKey, selectedGroup);
  }, [groupStorageKey, selectedGroup]);
  useEffect(() => {
    window.localStorage.setItem("ifsc-athlete-ranking-compact", compactRows ? "1" : "0");
  }, [compactRows]);
  return (
    <section className={`panel ranking-shell ${splitGroups ? "athlete-ranking-shell" : "route-ranking-shell"} ${!splitGroups && visibleResultCount >= 30 ? "long-ranking-shell" : ""}`}>
      <div className="section-title ranking-heading">
        <span>Live Ranking</span>
        {splitGroups && !shouldSelectGroup && (
          <button type="button" className={`compact-toggle switch-toggle desktop-heading-switch ${compactRows ? "on" : ""}`} onClick={() => setCompactRows((value) => !value)}>
            <span />
            <strong><b className="full-label">{compactRows ? "Compact" : "Expand"}</b><b className="short-label">{compactRows ? "Cpt." : "Exp."}</b></strong>
          </button>
        )}
        {splitGroups && shouldSelectGroup && (
          <div className="mobile-heading-controls">
            {grouped.length === 2 && (
              <button type="button" className={`switch-toggle heading-switch ${selectedGroup === grouped[1].name ? "on" : ""}`} onClick={() => setSelectedGroup(selectedGroup === grouped[0].name ? grouped[1].name : grouped[0].name)}>
                <span />
                <strong><b className="full-label">{selectedGroup}</b><b className="short-label">{shortGroupLabel(selectedGroup)}</b></strong>
              </button>
            )}
            <button type="button" className={`compact-toggle switch-toggle heading-switch ${compactRows ? "on" : ""}`} onClick={() => setCompactRows((value) => !value)}>
              <span />
              <strong><b className="full-label">{compactRows ? "Compact" : "Expand"}</b><b className="short-label">{compactRows ? "Cpt." : "Exp."}</b></strong>
            </button>
          </div>
        )}
      </div>
      {shouldSelectGroup && !splitGroups && (
        <div className="ranking-switch switch-row">
          <div className="desktop-group-buttons">
            {grouped.map((group) => (
              <button type="button" className={`pill-switch ${selectedGroup === group.name ? "active" : ""}`} onClick={() => setSelectedGroup(group.name)} key={group.name}>
                {group.name}
              </button>
            ))}
          </div>
          {grouped.length === 2 && (
            <button type="button" className={`switch-toggle mobile-group-toggle ${selectedGroup === grouped[1].name ? "on" : ""}`} onClick={() => setSelectedGroup(selectedGroup === grouped[0].name ? grouped[1].name : grouped[0].name)}>
              <span />
              <strong>{selectedGroup}</strong>
            </button>
          )}
          {splitGroups && (
            <button type="button" className={`compact-toggle switch-toggle ${compactRows ? "on" : ""}`} onClick={() => setCompactRows((value) => !value)}>
              <span />
              <strong><b className="full-label">{compactRows ? "Compact" : "Expand"}</b><b className="short-label">{compactRows ? "Cpt." : "Exp."}</b></strong>
            </button>
          )}
          {splitGroups && (
            <button type="button" className={`compact-toggle desktop-compact-toggle pill-switch ${compactRows ? "active" : ""}`} onClick={() => setCompactRows((value) => !value)}>
              {compactRows ? "Compact" : "Expand"}
            </button>
          )}
        </div>
      )}
      <div className={`ranking-panel ${boxed ? "boxed" : ""} ${split ? "split" : ""} ${compactWidth ? "compact-width" : ""} ${compactRows && splitGroups ? "compact-ranking" : ""}`}>
        {visibleGroups.map((group, index) => (
          <section className="ranking-group" key={`${group.name}-${index}`}>
            {split && group.name !== "Ranking" && <div className="ranking-group-title">{group.name}</div>}
            <div className="ranking-list">
              {group.results.map((result) => {
                const active = activeIds.has(result.athlete.id);
                const live = state.currentClimbers.find((climber) => climber.athleteId === result.athlete.id);
                return (
                  <div className={`ranking-row ${boxed ? "ranking-card" : ""} ${active ? "active-ranking" : ""}`} key={result.athlete.id}>
                    <strong>#{displayRank(result)}</strong>
                    <span className="ranking-name">{displayName(result.athlete.name)}</span>
                    <RankingBoulders boulders={result.boulders} currentBoulder={live?.currentBoulder} currentAttempt={live?.currentAttempt} />
                    <span className="ranking-score">{result.score.toFixed(1)}</span>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function EventFeed({ events, athletes }: { events: CompetitionEvent[]; athletes: AthleteRoundResult[] }) {
  const feedRef = useRef<HTMLDivElement>(null);
  return (
    <section className="panel">
      <div className="section-title event-feed-title">
        <span>Event Feed</span>
        <button type="button" className="feed-top-button" aria-label="Scroll event feed to newest event" onClick={() => feedRef.current?.scrollTo({ top: 0, behavior: "smooth" })}>↑</button>
      </div>
      <div className="event-list scrollable-feed" ref={feedRef}>
        {events.length === 0 ? <div className="empty compact-empty">No competition events in this session.</div> : events.map((event) => (
          <div className={`event-row ${eventTypeClass(event)}`} key={event.id}>
            <time>{new Date(event.timestamp).toLocaleTimeString()}</time>
            <span>{boldAthleteNames(event.message, athletes)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

interface RouteSlot {
  group?: string;
  boulderNo: number;
  live?: CompetitionState["currentClimbers"][number];
}

function groupedRoutes(state: CompetitionState) {
  const groups = groupNames(state);
  const maxBoulders = Math.max(4, ...state.snapshot.athletes.map((result) => result.boulders.length));
  return groups.map((group) => ({
    name: group ?? "Routes",
    routes: routeAssignmentsForGroup(state, group, maxBoulders)
  }));
}

function routeAssignmentsForGroup(state: CompetitionState, group: string | undefined, maxBoulders: number): RouteSlot[] {
  const routes: RouteSlot[] = Array.from({ length: maxBoulders }, (_, index) => ({ group, boulderNo: index + 1 }));
  const groupClimbers = state.currentClimbers
    .filter((climber) => (climber.startingGroup ?? undefined) === group)
    .sort((a, b) => athleteStartOrder(state, a.athleteId) - athleteStartOrder(state, b.athleteId));
  const occupied = new Set<number>();

  for (const climber of groupClimbers) {
    const preferred = clampRoute(climber.currentBoulder, maxBoulders);
    const boulderNo = preferred && !occupied.has(preferred) ? preferred : firstOpenRoute(occupied, maxBoulders, preferred);
    if (!boulderNo) continue;
    occupied.add(boulderNo);
    routes[boulderNo - 1].live = { ...climber, currentBoulder: boulderNo };
  }

  return routes;
}

function athleteStartOrder(state: CompetitionState, athleteId: string) {
  return state.snapshot.athletes.find((result) => result.athlete.id === athleteId)?.athlete.startOrder ?? 999;
}

function clampRoute(route: number | undefined, maxBoulders: number) {
  return route && route >= 1 && route <= maxBoulders ? route : undefined;
}

function firstOpenRoute(occupied: Set<number>, maxBoulders: number, preferred: number | undefined) {
  const start = preferred ?? 1;
  for (let route = start; route <= maxBoulders; route += 1) {
    if (!occupied.has(route)) return route;
  }
  for (let route = 1; route < start; route += 1) {
    if (!occupied.has(route)) return route;
  }
  return undefined;
}

function groupNames(state: CompetitionState) {
  const names = [...new Set(state.snapshot.athletes.map((result) => result.startingGroup).filter(Boolean))] as string[];
  return names.length > 0 ? names.sort() : [undefined];
}

interface RankingGroup {
  name: string;
  results: AthleteRoundResult[];
  continuation: boolean;
}

function groupedRankings(state: CompetitionState, allowSingleGroupSplit = false): RankingGroup[] {
  const ranked = state.snapshot.athletes
    .sort((a, b) => rankSortValue(a) - rankSortValue(b) || b.score - a.score || a.athlete.startOrder - b.athlete.startOrder);
  const names = [...new Set(ranked.map((result) => result.startingGroup).filter(Boolean))] as string[];
  if (names.length < 2) {
    const results = ranked;
    if (allowSingleGroupSplit && results.length > 16) {
      const midpoint = Math.ceil(results.length / 2);
      return [
        { name: "Ranking", results: results.slice(0, midpoint), continuation: false },
        { name: "Ranking", results: results.slice(midpoint), continuation: true }
      ];
    }
    return [{ name: "All", results, continuation: false }];
  }
  return names.sort().map((name) => ({
    name,
    results: ranked.filter((result) => result.startingGroup === name),
    continuation: false
  }));
}

function rankSortValue(result: AthleteRoundResult) {
  const officialRank = result.groupRank ?? result.rank;
  return officialRank >= 999 ? 10000 + result.athlete.startOrder : officialRank;
}

function routeLabel(state: CompetitionState, group?: string, boulder?: number) {
  const gender = state.snapshot.roundName.toLowerCase().includes("men") && !state.snapshot.roundName.toLowerCase().includes("women") ? "M" : "W";
  const groupLetter = group?.replace("Group ", "") ?? "";
  return `${gender}${groupLetter}${boulder ?? "?"}`;
}

function nextForRoute(state: CompetitionState, group?: string, boulder?: number) {
  const match = state.upNext.find((entry) => entry.startingGroup === group && entry.expectedBoulder === boulder) ?? state.upNext.find((entry) => entry.expectedBoulder === boulder);
  return match ? athleteById(state.snapshot.athletes, match.athleteId)?.athlete : undefined;
}

function MiniBoulders({ boulders, currentBoulder, currentAttempt }: { boulders: MiniBoulder[]; currentBoulder?: number; currentAttempt?: number }) {
  return (
    <div className="mini-boulders" style={{ gridTemplateColumns: `repeat(${boulders.length}, var(--mini-cell-width, 20px))` }}>
      {boulders.map((boulder) => (
        <MiniCell boulder={boulder} current={currentBoulder === boulder.boulderNo} currentAttempt={currentAttempt} key={boulder.boulderNo} />
      ))}
    </div>
  );
}

function RankingBoulders({ boulders, currentBoulder, currentAttempt }: { boulders: MiniBoulder[]; currentBoulder?: number; currentAttempt?: number }) {
  return (
    <div className="ranking-boulders">
      {boulders.map((boulder) => (
        <MiniCell boulder={boulder} current={currentBoulder === boulder.boulderNo} small key={boulder.boulderNo} />
      ))}
      {currentAttempt ? <div className="ranking-attempt-side blink">{currentAttempt}</div> : null}
    </div>
  );
}

interface MiniBoulder {
  boulderNo: number;
  hasZone: boolean;
  hasTop: boolean;
  attemptsToZone?: number;
  attemptsToTop?: number;
  rawStatus?: string;
}

function MiniCell({ boulder, current, currentAttempt, small = false }: { boulder: MiniBoulder; current?: boolean; currentAttempt?: number; small?: boolean }) {
  const className = `${small ? "ranking-cell" : "mini-cell"} ${boulder.hasTop ? "top" : boulder.hasZone ? "zone" : ""} ${isExpired(boulder.rawStatus) ? "expired" : ""} ${current ? "current" : ""}`;
  return (
    <div className={small ? "ranking-wrap" : "mini-wrap"}>
      <div className={className}>
        {boulder.hasTop ? (
          <>
            <span className="top-tries cell-half top-half">{boulder.attemptsToTop}</span>
            <span className="zone-tries cell-half zone-half">{boulder.attemptsToZone}</span>
          </>
        ) : boulder.hasZone ? (
          <span className="zone-only cell-half zone-half">{boulder.attemptsToZone}</span>
        ) : null}
      </div>
      {current && currentAttempt ? <div className={`${small ? "ranking-attempt" : "mini-attempt"} blink`}>{currentAttempt}</div> : null}
    </div>
  );
}

function eventTypeClass(event: CompetitionEvent) {
  if (event.type === "RANK_CHANGED") {
    const match = event.reason.match(/Rank (\d+) -> (\d+)/);
    const before = Number(match?.[1]);
    const after = Number(match?.[2]);
    if (Number.isFinite(before) && Number.isFinite(after)) return after < before ? "event-rank-up" : "event-rank-down";
    return "event-default";
  }
  if (event.type.includes("APPEAL")) return "event-appeal";
  if (event.type === "TOP_REACHED") return "event-top";
  if (event.type === "ZONE_REACHED") return "event-zone";
  if (event.type === "CLIMBER_STARTED" || event.type === "TIME_EXPIRED_ESTIMATED") return "event-start";
  return "event-default";
}

function isExpired(rawStatus?: string) {
  return /expired|timeout|time/i.test(rawStatus ?? "");
}

function displayName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

function displayRank(result: AthleteRoundResult) {
  const rank = result.groupRank ?? result.rank;
  return rank >= 999 ? result.athlete.startOrder : rank;
}

function shortGroupLabel(name: string) {
  return name.replace("Group", "Grp");
}

function boldAthleteNames(message: string, athletes: AthleteRoundResult[]) {
  const names = [...new Set(athletes.map((result) => result.athlete.name))]
    .filter((name) => name.length > 0 && message.includes(name))
    .sort((a, b) => b.length - a.length);
  if (names.length === 0) return message;
  const pattern = new RegExp(`(${names.map(escapeRegExp).join("|")})`, "g");
  return message.split(pattern).map((part, index) => names.includes(part) ? <strong key={`${part}-${index}`}>{part}</strong> : part);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isMobile;
}

function readStoredValue(key: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return window.localStorage.getItem(key) ?? fallback;
}

function readStoredBool(key: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback;
  const value = window.localStorage.getItem(key);
  return value === null ? fallback : value === "1";
}
