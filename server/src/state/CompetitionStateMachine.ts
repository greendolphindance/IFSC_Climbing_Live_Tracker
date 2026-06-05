import type {
  Appeal,
  AthleteLiveState,
  AthleteRoundResult,
  AthleteState,
  BoulderResult,
  CompetitionEvent,
  CompetitionSnapshot,
  CompetitionState,
  Confidence,
  RankChange,
  UpNextEntry
} from "../types/domain.js";

const CLIMBING_WINDOW_SECONDS = 4 * 60;
const MAX_BOULDERS = 5;

export class CompetitionStateMachine {
  private previous?: CompetitionSnapshot;
  private events: CompetitionEvent[] = [];
  private rankChanges: RankChange[] = [];

  apply(snapshot: CompetitionSnapshot, source: CompetitionState["connection"]["source"], refreshMs: number): CompetitionState {
    const deltaEvents = this.previous
      ? this.diffSnapshots(this.previous, snapshot)
      : [this.snapshotReceived(snapshot), ...this.initialLiveEvents(snapshot), ...this.initialExpiredEvents(snapshot), ...this.initialAppealEvents(snapshot)];
    this.events = [...deltaEvents, ...this.events].slice(0, 500);
    this.rankChanges = [
      ...deltaEvents
        .filter((event) => event.type === "RANK_CHANGED" && event.athleteId)
        .map((event) => {
          const match = event.reason.match(/Rank (\d+) -> (\d+)/);
          return {
            id: `rank-${event.id}`,
            timestamp: event.timestamp,
            athleteId: event.athleteId!,
            from: Number(match?.[1] ?? 0),
            to: Number(match?.[2] ?? 0),
            reason: event.message
          };
        }),
      ...this.rankChanges
    ].slice(0, 100);

    const liveStates = this.buildLiveStates(snapshot, this.previous, deltaEvents);
    const currentClimbers = liveStates
      .filter((state) => state.states.includes("ON_WALL"))
      .sort((a, b) => (a.currentBoulder ?? 99) - (b.currentBoulder ?? 99));

    const upNext = this.deriveUpNext(snapshot, currentClimbers);
    this.previous = snapshot;

    return {
      snapshot,
      liveStates,
      currentClimbers,
      upNext,
      events: this.events,
      rankChanges: this.rankChanges,
      connection: {
        source,
        status: "connected",
        lastUpdate: snapshot.receivedAt
      },
      debug: {
        refreshMs,
        rawRef: snapshot.rawRef,
        notes: [
          "Official DOM highlight and green bars are ignored.",
          "Current climber is derived from source changes when no explicit live field exists.",
          "Fixture source is active until IFSC Network contract is captured."
        ]
      }
    };
  }

  private diffSnapshots(previous: CompetitionSnapshot, next: CompetitionSnapshot): CompetitionEvent[] {
    const events: CompetitionEvent[] = [this.snapshotReceived(next)];
    const previousByAthlete = new Map(previous.athletes.map((result) => [result.athlete.id, result]));
    const nextByAthlete = new Map(next.athletes.map((result) => [result.athlete.id, result]));

    events.push(...this.diffActiveGroups(previous, next));
    events.push(...this.diffExpiredGroups(previous, next));

    for (const [athleteId, current] of nextByAthlete) {
      const before = previousByAthlete.get(athleteId);
      if (!before) continue;
      events.push(...this.diffBoulders(before, current, next.receivedAt));
      if (before.rank !== current.rank) {
        events.push({
          id: this.eventId("rank", next.receivedAt, athleteId),
          timestamp: next.receivedAt,
          type: "RANK_CHANGED",
          athleteId,
          message: `${current.athlete.name} moved from Rank ${before.rank} -> Rank ${current.rank}`,
          priority: "high",
          reason: `Rank ${before.rank} -> ${current.rank}`,
          source: "official"
        });
      }
    }

    events.push(...this.diffAppeals(previous.appeals, next.appeals, next));
    return events.sort((a, b) => Number(priorityWeight(b.priority)) - Number(priorityWeight(a.priority)));
  }

  private diffBoulders(before: AthleteRoundResult, current: AthleteRoundResult, timestamp: string): CompetitionEvent[] {
    const events: CompetitionEvent[] = [];
    const beforeByBoulder = new Map(before.boulders.map((boulder) => [boulder.boulderNo, boulder]));
    for (const boulder of current.boulders) {
      const previous = beforeByBoulder.get(boulder.boulderNo);
      if (!previous) continue;

      if (!previous.hasZone && boulder.hasZone) {
        events.push(this.athleteEvent("ZONE_REACHED", current, boulder, timestamp, `${current.athlete.name} reached Zone on Boulder ${boulder.boulderNo}`, "official"));
      }
      if (!previous.hasTop && boulder.hasTop) {
        events.push(this.athleteEvent("TOP_REACHED", current, boulder, timestamp, `${current.athlete.name} topped Boulder ${boulder.boulderNo}`, "official"));
      }
      const beforeAttempts = attemptCount(previous);
      const currentAttempts = attemptCount(boulder);
      if (current.sourceStatus === "active" && currentAttempts > beforeAttempts && previous.hasZone === boulder.hasZone && previous.hasTop === boulder.hasTop) {
        events.push(this.athleteEvent("ATTEMPT_UPDATED", current, boulder, timestamp, `${current.athlete.name} attempt ${currentAttempts} on Boulder ${boulder.boulderNo}`, "derived"));
      }
    }
    return events;
  }

  private diffActiveGroups(previous: CompetitionSnapshot, next: CompetitionSnapshot): CompetitionEvent[] {
    const previousActive = activeResults(previous);
    const nextActive = activeResults(next);
    const previousKeys = new Set(previousActive.map((result) => activeKey(result)));
    const started = nextActive.filter((result) => !previousKeys.has(activeKey(result)));
    return this.startedGroupEvents(started, next.receivedAt);
  }

  private diffExpiredGroups(previous: CompetitionSnapshot, next: CompetitionSnapshot): CompetitionEvent[] {
    const previousByAthlete = new Map(previous.athletes.map((result) => [result.athlete.id, result]));
    const expiredGroups = new Set<string>();
    for (const result of next.athletes) {
      const before = previousByAthlete.get(result.athlete.id);
      if (!before) continue;
      const beforeByBoulder = new Map(before.boulders.map((boulder) => [boulder.boulderNo, boulder]));
      const newlyExpired = result.boulders.some((boulder) => !isExpiredStatus(beforeByBoulder.get(boulder.boulderNo)?.rawStatus) && isExpiredStatus(boulder.rawStatus));
      if (newlyExpired) expiredGroups.add(result.startingGroup ?? "All");
    }
    return this.roundEndedEvents(activeResults(next).filter((result) => expiredGroups.has(result.startingGroup ?? "All")), next.receivedAt);
  }

  private diffAppeals(previous: Appeal[], next: Appeal[], snapshot: CompetitionSnapshot): CompetitionEvent[] {
    const previousByAthlete = new Map(previous.map((appeal) => [appeal.athleteId, appeal]));
    return next.flatMap((appeal) => {
      const before = previousByAthlete.get(appeal.athleteId);
      if (before?.status === appeal.status) return [];
      const athlete = snapshot.athletes.find((result) => result.athlete.id === appeal.athleteId)?.athlete;
      const name = athlete?.name ?? appeal.athleteId;
      const type = appeal.status === "Accepted" ? "APPEAL_ACCEPTED" : appeal.status === "Rejected" ? "APPEAL_REJECTED" : "APPEAL_FILED";
      return [{
        id: this.eventId("appeal", snapshot.receivedAt, appeal.athleteId),
        timestamp: snapshot.receivedAt,
        type,
        athleteId: appeal.athleteId,
        boulderNo: appeal.boulderNo,
        message: `${name} appeal status: ${appeal.status}`,
        priority: appeal.status === "Accepted" || appeal.status === "Rejected" ? "alert" : "high",
        reason: appeal.sourceText,
        source: appeal.confidence.source
      } satisfies CompetitionEvent];
    });
  }

  private buildLiveStates(snapshot: CompetitionSnapshot, previous: CompetitionSnapshot | undefined, deltaEvents: CompetitionEvent[]): AthleteLiveState[] {
    const activeAthletes = new Set(snapshot.athletes.filter((result) => result.sourceStatus === "active").map((result) => result.athlete.id));
    const appealAthletes = new Set(snapshot.appeals.filter((appeal) => appeal.status === "Under Appeal" || appeal.status === "Pending").map((appeal) => appeal.athleteId));

    return snapshot.athletes.map((result) => {
      const changedBoulder = this.latestChangedBoulder(result, previous);
      const isFinished = result.boulders.every((boulder) => boulder.hasTop || boulder.hasZone || attemptCount(boulder) > 0) && result.boulders.length >= MAX_BOULDERS;
      const states: AthleteState[] = [];
      if (activeAthletes.has(result.athlete.id)) states.push("ON_WALL");
      else if (isFinished) states.push("FINISHED");
      else if (changedBoulder) states.push("ROTATING");
      else states.push("WAITING");
      if (appealAthletes.has(result.athlete.id)) states.push("UNDER_APPEAL");

      const currentBoulder = result.currentBoulder ?? changedBoulder?.boulderNo ?? this.nextUnfinishedBoulder(result.boulders);
      const currentBoulderResult = result.boulders.find((boulder) => boulder.boulderNo === currentBoulder);
      const confidence: Confidence = result.sourceStatus === "active"
        ? { value: 98, reason: "Official IFSC payload marks this athlete active.", source: "official" }
        : changedBoulder
        ? { value: 88, reason: "Recent official result delta identifies this athlete as rotating, not currently active.", source: "derived" }
        : { value: 65, reason: "No explicit live field; state is estimated from boulder progress and startlist.", source: "estimated" };

      return {
        athleteId: result.athlete.id,
        states,
        currentBoulder,
        currentAttempt: currentBoulderResult ? Math.max(1, attemptCount(currentBoulderResult)) : changedBoulder ? Math.max(1, attemptCount(changedBoulder)) : undefined,
        elapsedSeconds: activeAthletes.has(result.athlete.id) ? elapsedFrom(snapshot.sourceTimestamp, snapshot.receivedAt) : undefined,
        rank: result.rank,
        groupRank: result.groupRank,
        startingGroup: result.startingGroup,
        score: result.score,
        confidence
      };
    });
  }

  private latestChangedBoulder(result: AthleteRoundResult, previous: CompetitionSnapshot | undefined): BoulderResult | undefined {
    const before = previous?.athletes.find((item) => item.athlete.id === result.athlete.id);
    if (!before) return result.boulders.find((boulder) => attemptCount(boulder) > 0 && !boulder.hasTop);
    const beforeByBoulder = new Map(before.boulders.map((boulder) => [boulder.boulderNo, boulder]));
    return result.boulders.find((boulder) => {
      const old = beforeByBoulder.get(boulder.boulderNo);
      return old && (old.hasZone !== boulder.hasZone || old.hasTop !== boulder.hasTop || attemptCount(old) !== attemptCount(boulder));
    });
  }

  private nextUnfinishedBoulder(boulders: BoulderResult[]) {
    return boulders.find((boulder) => !boulder.hasTop)?.boulderNo;
  }

  private deriveUpNext(snapshot: CompetitionSnapshot, currentClimbers: AthleteLiveState[]): UpNextEntry[] {
    const currentIds = new Set(currentClimbers.map((climber) => climber.athleteId));
    const alreadyStartedIds = new Set(
      snapshot.athletes
        .filter((result) => result.sourceStatus !== "waiting" && (result.rank < 999 || result.score > 0 || result.boulders.some(hasProgress)))
        .map((result) => result.athlete.id)
    );

    return snapshot.startlist
      .filter((entry) => !currentIds.has(entry.athleteId) && !alreadyStartedIds.has(entry.athleteId))
      .sort((a, b) => a.order - b.order)
      .slice(0, 3)
      .map((entry) => {
        const result = snapshot.athletes.find((athlete) => athlete.athlete.id === entry.athleteId);
        return {
          athleteId: entry.athleteId,
          expectedBoulder: result ? result.nextBoulder ?? this.nextUnfinishedBoulder(result.boulders) ?? MAX_BOULDERS : 1,
          startingGroup: result?.startingGroup,
          station: "Waiting",
          confidence: { value: 72, reason: "Derived from startlist order and unfinished boulders.", source: "estimated" }
        };
      });
  }

  private snapshotReceived(snapshot: CompetitionSnapshot): CompetitionEvent {
    return {
      id: this.eventId("snapshot", snapshot.receivedAt, snapshot.categoryRoundId),
      timestamp: snapshot.receivedAt,
      type: "SNAPSHOT_RECEIVED",
      message: "Competition snapshot received",
      priority: "normal",
      reason: snapshot.rawRef,
      source: "official"
    };
  }

  private initialAppealEvents(snapshot: CompetitionSnapshot): CompetitionEvent[] {
    return snapshot.appeals.map((appeal) => {
      const athlete = snapshot.athletes.find((result) => result.athlete.id === appeal.athleteId)?.athlete;
      return {
        id: this.eventId("appeal-initial", snapshot.receivedAt, appeal.athleteId),
        timestamp: snapshot.receivedAt,
        type: appeal.status === "Accepted" ? "APPEAL_ACCEPTED" : appeal.status === "Rejected" ? "APPEAL_REJECTED" : "APPEAL_FILED",
        athleteId: appeal.athleteId,
        boulderNo: appeal.boulderNo,
        message: `${athlete?.name ?? appeal.athleteId} appeal status: ${appeal.status}`,
        priority: appeal.status === "Accepted" || appeal.status === "Rejected" ? "alert" : "high",
        reason: appeal.sourceText,
        source: appeal.confidence.source
      };
    });
  }

  private initialLiveEvents(snapshot: CompetitionSnapshot): CompetitionEvent[] {
    return this.startedGroupEvents(activeResults(snapshot), snapshot.receivedAt);
  }

  private initialExpiredEvents(snapshot: CompetitionSnapshot): CompetitionEvent[] {
    const groups = new Set(snapshot.athletes.filter((result) => result.boulders.some((boulder) => isExpiredStatus(boulder.rawStatus))).map((result) => result.startingGroup ?? "All"));
    return this.roundEndedEvents(activeResults(snapshot).filter((result) => groups.has(result.startingGroup ?? "All")), snapshot.receivedAt);
  }

  private startedGroupEvents(results: AthleteRoundResult[], timestamp: string): CompetitionEvent[] {
    const byGroup = new Map<string, AthleteRoundResult[]>();
    for (const result of results) {
      const group = result.startingGroup ?? "All";
      byGroup.set(group, [...(byGroup.get(group) ?? []), result]);
    }
    return [...byGroup.entries()].map(([group, groupResults]) => {
      const sorted = groupResults.sort((a, b) => (a.currentBoulder ?? 99) - (b.currentBoulder ?? 99) || a.athlete.startOrder - b.athlete.startOrder);
      return {
        id: this.eventId("started", timestamp, `${group}-${sorted.map((result) => result.athlete.id).join("-")}`),
        timestamp,
        type: "CLIMBER_STARTED",
        message: `${group} started: ${sorted.map((result) => `Route ${result.currentBoulder ?? "?"} ${result.athlete.name}`).join(", ")}`,
        priority: "normal",
        reason: "Active athletes grouped by route order.",
        source: "derived"
      } satisfies CompetitionEvent;
    });
  }

  private roundEndedEvents(results: AthleteRoundResult[], timestamp: string): CompetitionEvent[] {
    const byGroup = new Map<string, AthleteRoundResult[]>();
    for (const result of results) {
      const group = result.startingGroup ?? "All";
      byGroup.set(group, [...(byGroup.get(group) ?? []), result]);
    }
    return [...byGroup.entries()].map(([group, groupResults]) => {
      const sorted = groupResults.sort((a, b) => (a.currentBoulder ?? 99) - (b.currentBoulder ?? 99) || a.athlete.startOrder - b.athlete.startOrder);
      return {
        id: this.eventId("round-ended", timestamp, `${group}-${sorted.map((result) => result.athlete.id).join("-")}`),
        timestamp,
        type: "TIME_EXPIRED_ESTIMATED",
        message: `${group} round ended: ${sorted.map((result) => `Route ${result.currentBoulder ?? "?"} ${result.athlete.name} ${currentOutcome(result)}`).join(", ")}`,
        priority: "high",
        reason: "Current group time expired.",
        source: "estimated"
      } satisfies CompetitionEvent;
    });
  }

  private athleteEvent(type: CompetitionEvent["type"], result: AthleteRoundResult, boulder: BoulderResult, timestamp: string, message: string, source: CompetitionEvent["source"]): CompetitionEvent {
    return {
      id: this.eventId(type, timestamp, `${result.athlete.id}-${boulder.boulderNo}`),
      timestamp,
      type,
      athleteId: result.athlete.id,
      boulderNo: boulder.boulderNo,
      message,
      priority: type === "TOP_REACHED" || type === "TIME_EXPIRED_ESTIMATED" ? "high" : "normal",
      reason: boulder.rawStatus ?? "",
      source
    };
  }

  private eventId(type: string, timestamp: string, key: string) {
    return `${type}-${key}-${timestamp.replace(/[^0-9]/g, "")}`;
  }
}

function attemptCount(boulder: BoulderResult) {
  return Math.max(boulder.attemptsToTop ?? 0, boulder.attemptsToZone ?? 0);
}

function hasProgress(boulder: BoulderResult) {
  return boulder.hasTop || boulder.hasZone || attemptCount(boulder) > 0 || Boolean(boulder.rawStatus);
}

function activeResults(snapshot: CompetitionSnapshot) {
  return snapshot.athletes.filter((result) => result.sourceStatus === "active" && result.currentBoulder);
}

function activeKey(result: AthleteRoundResult) {
  return `${result.startingGroup ?? "All"}:${result.currentBoulder}:${result.athlete.id}`;
}

function isExpiredStatus(rawStatus?: string) {
  return /expired|timeout|time/i.test(rawStatus ?? "");
}

function currentOutcome(result: AthleteRoundResult) {
  const boulder = result.boulders.find((item) => item.boulderNo === result.currentBoulder);
  if (!boulder) return "No score";
  if (boulder.hasTop) return "Top";
  if (boulder.hasZone) return "Zone";
  return "No score";
}

function elapsedFrom(startIso: string, endIso: string) {
  const elapsed = Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 1000));
  return Math.min(CLIMBING_WINDOW_SECONDS, elapsed);
}

function priorityWeight(priority: CompetitionEvent["priority"]) {
  return priority === "alert" ? 3 : priority === "high" ? 2 : 1;
}
