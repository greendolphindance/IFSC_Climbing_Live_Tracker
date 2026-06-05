import type { CompetitionState } from "../../server/src/types/domain";

export function DebugView({ state }: { state: CompetitionState }) {
  return (
    <main className="debug-grid">
      <section className="panel">
        <div className="section-title">Source</div>
        <dl className="debug-list">
          <dt>Source</dt><dd>{state.connection.source}</dd>
          <dt>Status</dt><dd>{state.connection.status}</dd>
          <dt>Last update</dt><dd>{state.connection.lastUpdate}</dd>
          <dt>Refresh</dt><dd>{state.debug.refreshMs} ms</dd>
          <dt>Raw ref</dt><dd>{state.debug.rawRef}</dd>
        </dl>
      </section>
      <section className="panel">
        <div className="section-title">Inference Notes</div>
        {state.debug.notes.map((note) => <p className="note" key={note}>{note}</p>)}
      </section>
      <section className="panel raw-panel">
        <div className="section-title">Normalized Snapshot</div>
        <pre>{JSON.stringify(state.snapshot, null, 2)}</pre>
      </section>
    </main>
  );
}
