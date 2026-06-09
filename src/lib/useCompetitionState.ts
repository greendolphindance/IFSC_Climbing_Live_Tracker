import { useEffect, useState } from "react";
import type { CompetitionEvent, CompetitionState } from "../../server/src/types/domain";

export function useCompetitionState(roundUrl: string) {
  const [state, setState] = useState<CompetitionState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const storageKey = eventStorageKey(roundUrl);
    setState(null);
    setError(null);

    async function loadState() {
      try {
        const endpoint = roundUrl ? `/api/state?roundUrl=${encodeURIComponent(roundUrl)}` : "/api/state";
        const response = await fetch(endpoint, { cache: "no-store" });
        const payload = await response.json();
        if (cancelled) return;
        if (payload.error) {
          setError(payload.error);
          return;
        }
        const stateWithHistory = mergePersistedEvents(payload as CompetitionState, storageKey);
        setState(stateWithHistory);
        setError(null);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to fetch state");
      }
    }

    void loadState();
    const polling = window.setInterval(loadState, 2_000);
    const localDev = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const events = localDev && !roundUrl ? new EventSource("/events") : undefined;
    events?.addEventListener("state", (event) => {
      setState(mergePersistedEvents(JSON.parse((event as MessageEvent).data) as CompetitionState, storageKey));
      setError(null);
    });
    events?.addEventListener("error", () => {
      if (!cancelled) setError("Live connection interrupted. Polling is still active.");
    });
    return () => {
      cancelled = true;
      window.clearInterval(polling);
      events?.close();
    };
  }, [roundUrl]);

  return { state, error };
}

function mergePersistedEvents(state: CompetitionState, key: string): CompetitionState {
  const stateEvents = state.events.filter((event) => event.type !== "SNAPSHOT_RECEIVED");
  if (isInactiveInitialEventSet(stateEvents)) {
    window.localStorage.setItem(key, JSON.stringify(stateEvents));
    return { ...state, events: [state.events.find((event) => event.type === "SNAPSHOT_RECEIVED"), ...stateEvents].filter(Boolean) as CompetitionEvent[] };
  }
  const persisted = readPersistedEvents(key);
  const seen = new Set<string>();
  const events = [...state.events, ...persisted].filter((event) => {
    const key = eventDedupeKey(event);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 500);
  window.localStorage.setItem(key, JSON.stringify(events));
  return { ...state, events };
}

function isInactiveInitialEventSet(events: CompetitionEvent[]) {
  return events.length === 1 && (events[0].message === "Competition not started" || events[0].message === "Competition finished");
}

function eventDedupeKey(event: CompetitionEvent) {
  if (event.message === "Competition not started" || event.message === "Competition finished") {
    return `round-status:${event.message}`;
  }
  return event.id;
}

function readPersistedEvents(key: string): CompetitionEvent[] {
  try {
    const value = window.localStorage.getItem(key);
    if (!value) return [];
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function eventStorageKey(roundUrl: string) {
  return `ifsc-event-feed:${roundUrl || "__default__"}`;
}
