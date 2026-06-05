import { createRoundSourceFromEnv, IfscAdapter } from "../server/src/adapters/IfscAdapter.js";
import { CompetitionStateMachine } from "../server/src/state/CompetitionStateMachine.js";

const adapter = new IfscAdapter(createRoundSourceFromEnv());
const machine = new CompetitionStateMachine();

export default async function handler(_: unknown, response: {
  status: (code: number) => { json: (body: unknown) => void };
  setHeader: (name: string, value: string) => void;
}) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  try {
    const snapshot = await adapter.fetchSnapshot();
    const state = machine.apply(snapshot, adapter.sourceName(), adapter.refreshMs());
    response.status(200).json(state);
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Failed to update competition state"
    });
  }
}
