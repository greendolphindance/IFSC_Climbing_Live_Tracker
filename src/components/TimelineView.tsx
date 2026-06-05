import type { CompetitionState } from "../../server/src/types/domain";
import { timeOnly } from "../lib/format";

export function TimelineView({ state }: { state: CompetitionState }) {
  return (
    <main className="panel timeline-panel">
      <div className="section-title">Competition Timeline</div>
      <div className="timeline-list">
        {state.events.map((event) => (
          <div className={`timeline-item ${eventTypeClass(event.type)}`} key={event.id}>
            <time>{timeOnly(event.timestamp)}</time>
            <div>
              <strong>{event.message}</strong>
              <span>{event.type} · {event.source} · {event.reason}</span>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

function eventTypeClass(type: string) {
  if (type === "RANK_CHANGED") return "event-rank";
  if (type.includes("APPEAL")) return "event-appeal";
  return "";
}
