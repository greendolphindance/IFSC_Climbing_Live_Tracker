# IFSC Network Contract

This project does not trust official page highlighting, green bars, CSS classes, or animation state.

## Captured Contract

- Captured official result endpoint: `/api/v1/category_rounds/10385/results`.
- Captured event endpoint: `/api/v1/events/1480`.
- No WebSocket frames were observed in the first 15-second capture.
- Result payload includes `ranking`, `startlist`, `starting_groups`, `ranking[].ascents`, `ranking[].active`, and `ranking[].under_appeal`.

## Current Implementation Status

- Runtime source defaults to `fixture://round-10385`.
- Set `COMP_SOURCE=ifsc IFSC_ROUND_URL=https://ifsc.results.info/event/1480/cr/10385` to poll the official REST endpoint.
- The backend normalizes snapshots into `CompetitionSnapshot`.
- The state machine consumes only normalized snapshots and emits current climbers, appeal state, rank changes, up-next, and timeline events.

## Capture Procedure

Run:

```sh
npm run probe:ifsc -- https://ifsc.results.info/event/1480/cr/10385
```

The script records:

- Fetch/XHR request URLs, methods, post bodies.
- Fetch/XHR response status, content type, JSON payloads or text preview.
- WebSocket open URL and sent/received frames.

Saved captures are written to `docs/network-captures/`.

## Adapter Contract To Fill From Capture

Map official payload fields to:

- `Athlete`: name, country, bib, start order.
- `BoulderResult`: boulder number, Zone/Top booleans, attempts to Zone/Top, raw status text.
- `RankingEntry`: athlete id, rank, score.
- `StartlistEntry`: athlete id, order.
- `Appeal`: athlete id, status, affected boulder, filed/resolved timestamps when available.

## Reliability Rules

- Official JSON/WebSocket values are `official`.
- Snapshot diffs are `derived`.
- Timer, current climber, current boulder, current attempt, and up-next are `estimated` when the official payload has no explicit live field.
- Any field below 80% confidence is shown as estimated in the UI.
