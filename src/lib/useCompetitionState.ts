import { useEffect, useState } from "react";
import type { CompetitionState } from "../../server/src/types/domain";

export function useCompetitionState(roundUrl: string) {
  const [state, setState] = useState<CompetitionState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
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
        setState(payload);
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
      setState(JSON.parse((event as MessageEvent).data));
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
