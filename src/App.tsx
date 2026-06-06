import { useEffect, useState, type FormEvent } from "react";
import { LiveView } from "./components/LiveView";
import { useCompetitionState } from "./lib/useCompetitionState";

type Tab = "routes" | "athletes" | "feed";

export function App() {
  const [tab, setTab] = useState<Tab>(() => readStoredTab());
  const [theme, setTheme] = useState<"theme-dark" | "theme-light">(() => readStoredThemeOverride() ?? systemTheme());
  const [roundUrl, setRoundUrl] = useState(() => readStoredRoundUrl());
  const [roundUrlInput, setRoundUrlInput] = useState(() => readStoredRoundUrl());
  const { state, error } = useCompetitionState(roundUrl);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) {
      if (!readStoredThemeOverride()) setTheme("theme-light");
      return;
    }
    if (!readStoredThemeOverride()) setTheme(query.matches ? "theme-dark" : "theme-light");
    const update = () => {
      const nextTheme = query.matches ? "theme-dark" : "theme-light";
      window.localStorage.removeItem("ifsc-theme");
      setTheme(nextTheme);
    };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("ifsc-live-tab", tab);
  }, [tab]);

  useEffect(() => {
    if (roundUrl) {
      window.localStorage.setItem("ifsc-round-url", roundUrl);
    } else {
      window.localStorage.removeItem("ifsc-round-url");
    }
  }, [roundUrl]);

  function loadRound(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRoundUrl(roundUrlInput.trim());
  }

  function resetRound() {
    window.localStorage.removeItem("ifsc-round-url");
    setRoundUrl("");
    setRoundUrlInput("");
  }

  function toggleTheme() {
    const nextTheme = theme === "theme-dark" ? "theme-light" : "theme-dark";
    window.localStorage.setItem("ifsc-theme", nextTheme);
    setTheme(nextTheme);
  }

  return (
    <div className={`app-shell ${theme}`}>
      <form className="link-panel" onSubmit={loadRound}>
        <button type="button" className={`theme-switch link-theme-switch ${theme === "theme-light" ? "on" : ""}`} onClick={toggleTheme} aria-label="Toggle color theme">
          <span />
          <strong>{theme === "theme-dark" ? "Night" : "Day"}</strong>
        </button>
        <label htmlFor="round-url">Find a competition page at <a href="https://ifsc.results.info" target="_blank" rel="noreferrer">https://ifsc.results.info</a></label>
        <div className="round-url-row">
          <input id="round-url" type="url" value={roundUrlInput} onChange={(event) => setRoundUrlInput(event.target.value)} placeholder="Paste IFSC round URL, e.g. https://ifsc.results.info/event/1480/cr/10385" />
          <button type="submit">Load</button>
        </div>
      </form>

      {state ? (
        <>
          <header className="topbar">
            <div>
              <div className="eyebrow">LIVE COMPETITION STATUS</div>
              <h1>{state.snapshot.eventName}</h1>
              <p>{state.snapshot.roundName} · Event {state.snapshot.eventId} / CR {state.snapshot.categoryRoundId}</p>
            </div>
            <div className="status-cluster">
              <span className={`status-dot ${state.connection.status}`} />
              <span>{state.connection.source}</span>
              <span>Updated {new Date(state.connection.lastUpdate).toLocaleTimeString()}</span>
              {error && <span className="connection-error">{error}</span>}
            </div>
          </header>

          <nav className="tabs">
            <button className={tab === "routes" ? "active" : ""} onClick={() => setTab("routes")}>Routes</button>
            <button className={tab === "athletes" ? "active" : ""} onClick={() => setTab("athletes")}>Athletes</button>
            <button className={`feed-tab ${tab === "feed" ? "active" : ""}`} onClick={() => setTab("feed")}>Event Feed</button>
          </nav>

          {tab === "routes" && <LiveView state={state} mode="routes" />}
          {tab === "athletes" && <LiveView state={state} mode="athletes" />}
          {tab === "feed" && <LiveView state={state} mode="feed" />}
        </>
      ) : (
        <section className={`panel ${error ? "error-panel" : "loading-panel"}`}>
          <div className="section-title">{error ? "Unable to Load Competition" : "Connecting to competition state..."}</div>
          {error && <p>{error}</p>}
          {error && (
            <div className="error-actions">
              <button type="button" onClick={resetRound}>Back to default round</button>
              <button type="button" onClick={() => setRoundUrl(roundUrlInput.trim())}>Retry</button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function systemTheme(): "theme-dark" | "theme-light" {
  if (typeof window === "undefined") return "theme-light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "theme-dark" : "theme-light";
}

function readStoredTab(): Tab {
  if (typeof window === "undefined") return "routes";
  const value = window.localStorage.getItem("ifsc-live-tab");
  return value === "routes" || value === "athletes" || value === "feed" ? value : "routes";
}

function readStoredThemeOverride(): "theme-dark" | "theme-light" | undefined {
  if (typeof window === "undefined") return undefined;
  const value = window.localStorage.getItem("ifsc-theme");
  return value === "theme-dark" || value === "theme-light" ? value : undefined;
}

function readStoredRoundUrl() {
  if (typeof window === "undefined") return "";
  if (new URLSearchParams(window.location.search).has("reset")) {
    window.localStorage.removeItem("ifsc-round-url");
    return "";
  }
  return window.localStorage.getItem("ifsc-round-url") ?? "";
}
