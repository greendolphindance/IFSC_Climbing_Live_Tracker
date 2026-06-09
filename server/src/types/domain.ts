export type BaseAthleteState = "WAITING" | "ON_WALL" | "ROTATING" | "FINISHED";
export type OverlayAthleteState = "UNDER_APPEAL";
export type AthleteState = BaseAthleteState | OverlayAthleteState;

export type AppealStatus = "Under Appeal" | "Pending" | "Accepted" | "Rejected";

export type EventType =
  | "SNAPSHOT_RECEIVED"
  | "CLIMBER_STARTED"
  | "ROTATION_DETECTED"
  | "ATTEMPT_UPDATED"
  | "ZONE_REACHED"
  | "TOP_REACHED"
  | "RANK_CHANGED"
  | "APPEAL_FILED"
  | "APPEAL_ACCEPTED"
  | "APPEAL_REJECTED"
  | "TIME_EXPIRED_ESTIMATED";

export type EventPriority = "normal" | "high" | "alert";

export interface Confidence {
  value: number;
  reason: string;
  source: "official" | "derived" | "estimated";
}

export interface Athlete {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  bib?: number;
  startOrder: number;
}

export interface BoulderResult {
  boulderNo: number;
  attemptsToZone?: number;
  attemptsToTop?: number;
  hasZone: boolean;
  hasTop: boolean;
  rawStatus?: string;
}

export interface AthleteRoundResult {
  athlete: Athlete;
  rank: number;
  groupRank?: number;
  startingGroup?: string;
  currentBoulder?: number;
  nextBoulder?: number;
  score: number;
  leadScoreText?: string;
  boulders: BoulderResult[];
  sourceStatus?: string;
}

export type Discipline = "boulder" | "lead";
export type LeadRoundType = "Semi-final" | "Final";
export type LeadGender = "Women" | "Men";
export type LeadStatus = "waiting" | "climbing" | "fall" | "top" | "dns";

export interface LeadResult {
  athlete: Athlete;
  rank: number;
  hold: number;
  plus?: boolean;
  scoreText: string;
  status: LeadStatus;
  elapsedSeconds?: number;
  next?: boolean;
}

export interface LeadGenderRound {
  gender: LeadGender;
  athletes: LeadResult[];
}

export interface LeadRoundData {
  roundType: LeadRoundType;
  routeTop?: number;
  genders: LeadGenderRound[];
}

export interface AthleteLiveState {
  athleteId: string;
  states: AthleteState[];
  currentBoulder?: number;
  currentAttempt?: number;
  elapsedSeconds?: number;
  rank: number;
  groupRank?: number;
  startingGroup?: string;
  score: number;
  confidence: Confidence;
}

export interface Appeal {
  athleteId: string;
  status: AppealStatus;
  boulderNo?: number;
  filedAt?: string;
  resolvedAt?: string;
  sourceText: string;
  confidence: Confidence;
}

export interface RankingEntry {
  athleteId: string;
  rank: number;
  score: number;
}

export interface StartlistEntry {
  athleteId: string;
  order: number;
  routePositions?: {
    boulderNo: number;
    position: number;
  }[];
}

export interface CompetitionSnapshot {
  sourceTimestamp: string;
  receivedAt: string;
  eventId: string;
  categoryRoundId: string;
  eventName: string;
  roundName: string;
  roundStatus?: string;
  discipline?: Discipline;
  formatIdentifier?: string;
  lead?: LeadRoundData;
  athletes: AthleteRoundResult[];
  ranking: RankingEntry[];
  startlist: StartlistEntry[];
  appeals: Appeal[];
  rawRef: string;
}

export interface CompetitionEvent {
  id: string;
  timestamp: string;
  type: EventType;
  athleteId?: string;
  boulderNo?: number;
  message: string;
  priority: EventPriority;
  reason: string;
  source: "official" | "derived" | "estimated";
}

export interface RankChange {
  id: string;
  timestamp: string;
  athleteId: string;
  from: number;
  to: number;
  reason: string;
}

export interface UpNextEntry {
  athleteId: string;
  expectedBoulder: number;
  startingGroup?: string;
  station: "Waiting" | "Rotation";
  confidence: Confidence;
}

export interface CompetitionState {
  snapshot: CompetitionSnapshot;
  liveStates: AthleteLiveState[];
  currentClimbers: AthleteLiveState[];
  upNext: UpNextEntry[];
  events: CompetitionEvent[];
  rankChanges: RankChange[];
  connection: {
    source: "fixture" | "ifsc-network";
    status: "connected" | "degraded" | "offline";
    lastUpdate: string;
  };
  debug: {
    refreshMs: number;
    rawRef: string;
    notes: string[];
  };
}
