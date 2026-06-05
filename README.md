# IFSC Boulder Live Tracker

Standalone live-viewing assistant for IFSC Boulder rounds.

## Run

```sh
npm install
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8787/api/state
- Backend SSE: http://localhost:8787/events

The MVP runs against fixture snapshots that exercise Zone, Top, rank-change, up-next, timeline, and appeal handling.

To use the captured IFSC REST endpoint instead of fixtures:

```sh
COMP_SOURCE=ifsc IFSC_ROUND_URL=https://ifsc.results.info/event/1480/cr/10385 npm run dev
```

## Deploy to Vercel

Vercel uses the Vite static build plus the serverless endpoint in `api/state.ts`.
Set these environment variables in the Vercel project to choose the default round:

```sh
COMP_SOURCE=ifsc
IFSC_ROUND_URL=https://ifsc.results.info/event/1480/cr/10677
```

Build settings:

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`

The production frontend polls `/api/state` every 2 seconds. Local development still
uses the Fastify server and SSE endpoint from `server/src/index.ts`.

Users can paste another IFSC round URL into the page. The frontend will request
`/api/state?roundUrl=...`, so the deployment is not locked to the default
environment-variable round.

## IFSC Network Capture

```sh
npm run probe:ifsc -- https://ifsc.results.info/event/1480/cr/10385
```

Captured Fetch/XHR/WebSocket data is written to `docs/network-captures/` and should be used to replace the fixture source with the real IFSC adapter mapping.
