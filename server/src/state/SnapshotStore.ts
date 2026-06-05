import type { CompetitionState } from "../types/domain.js";

type Listener = (state: CompetitionState) => void;

export class SnapshotStore {
  private state?: CompetitionState;
  private listeners = new Set<Listener>();

  getState() {
    return this.state;
  }

  setState(state: CompetitionState) {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    if (this.state) listener(this.state);
    return () => this.listeners.delete(listener);
  }
}
