import cors from "@fastify/cors";
import Fastify from "fastify";
import { createRoundSourceFromEnv, IfscAdapter } from "./adapters/IfscAdapter.js";
import { CompetitionStateMachine } from "./state/CompetitionStateMachine.js";
import { SnapshotStore } from "./state/SnapshotStore.js";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";
const app = Fastify({ logger: true });
const adapter = new IfscAdapter(createRoundSourceFromEnv());
const machine = new CompetitionStateMachine();
const store = new SnapshotStore();

await app.register(cors, { origin: true });

app.get("/api/state", async (_, reply) => {
  const state = store.getState();
  if (!state) return reply.code(503).send({ error: "No competition state available yet." });
  return state;
});

app.get("/events", async (request, reply) => {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*"
  });

  const send = (state: unknown) => {
    reply.raw.write(`event: state\n`);
    reply.raw.write(`data: ${JSON.stringify(state)}\n\n`);
  };
  const unsubscribe = store.subscribe(send);
  request.raw.on("close", unsubscribe);
});

async function tick() {
  try {
    const snapshot = await adapter.fetchSnapshot();
    const state = machine.apply(snapshot, adapter.sourceName(), adapter.refreshMs());
    store.setState(state);
  } catch (error) {
    app.log.error(error, "Failed to update competition state");
  }
}

await tick();
setInterval(tick, adapter.refreshMs());
await app.listen({ port, host });
