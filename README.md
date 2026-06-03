# Agent Executor

A small control server plus worker agent that runs commands reliably. Submit work over HTTP; the agent polls, executes, and reports back. If either side restarts mid-flight, state is recovered without double-running finished jobs.

## How it fits together

```
┌──────────────────┐         ┌─────────────────┐
│  Control Server  │◄────────┤  Agent          │
│  REST + SQLite   │         │  poller + DB    │
└──────────────────┘         └─────────────────┘
```

**Control server** — accepts commands, stores status (`PENDING` → `RUNNING` → `COMPLETED` / `FAILED`), hands work to agents.

**Agent** — polls for work, runs `DELAY` or `HTTP_GET_JSON`, posts results. Keeps a local idempotency log so a crash after execution does not run the same command twice.

## Command types

| Type | Payload | What it does |
|------|---------|--------------|
| `DELAY` | `{ "ms": 3000 }` | Sleeps, returns `{ ok, tookMs }` |
| `HTTP_GET_JSON` | `{ "url": "https://..." }` | GET request; body capped at 100KB |

## API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Health check |
| `POST` | `/commands` | Submit command |
| `GET` | `/commands` | List commands |
| `GET` | `/commands/:id` | Status + result |
| `GET` | `/commands/next?agentId=X` | Agent poll (locks command) |
| `PUT` | `/commands/:id/result` | Agent reports result |

Quick try:

```bash
curl -X POST http://localhost:3000/commands \
  -H "Content-Type: application/json" \
  -d '{"type":"DELAY","payload":{"ms":3000}}'

curl http://localhost:3000/commands/<commandId>
```

Import `postman_collection.json` if you prefer Postman.

## Run locally

**Requirements:** Node 18+, npm

**Server**

```bash
cd control-server
npm install
npm run start:dev
```

Runs at `http://localhost:3000`.

**Agent**

```bash
cd agent
npm install
npm run start:dev
```

| Env var | Default | Notes |
|---------|---------|-------|
| `SERVER_URL` | `http://localhost:3000` | Control server |
| `POLL_INTERVAL` | `2000` | Poll interval (ms) |
| `AGENT_ID` | auto UUID | Optional fixed id |

Crash simulation (dev only):

```bash
npm run start:dev -- --kill-after=10
npm run start:dev -- --random-failures
```

## Docker

```bash
cp .env.example .env   # optional tweaks
docker-compose up --build
```

Detached: `docker-compose up -d --build`  
Logs: `docker-compose logs -f`  
Reset data: `docker-compose down -v`

**Ports:** The server listens on **3000 inside the container**. `CONTROL_SERVER_PORT` maps that to a host port (e.g. 7001). The agent’s `SERVER_URL` must use the **internal** URL (`http://control-server:3000`), not the host port.

Production images (after CI pushes to GHCR):

```bash
# set GITHUB_REPOSITORY in .env
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d
```

## Recovery (short version)

- **Server restart:** `RUNNING` commands become `FAILED`. The agent picks up `FAILED` again; idempotency skips work already done.
- **Agent restart:** Same command may be offered again; local SQLite (`agent/data/idempotency.db`) prevents re-execution.
- **Assignment:** SQLite transaction when polling so one command goes to one agent.

Databases: `control-server/data/commands.db`, `agent/data/idempotency.db`.

## Layout

```
control-server/     API, persistence, recovery on startup
agent/              polling loop, executors, idempotency
docker-compose.yml
postman_collection.json
```

## CI

GitHub Actions (`.github/workflows/ci-cd.yml`) builds and tests both packages on PRs; on `main` it also pushes images to `ghcr.io/<owner>/agent-executor/`.

## Limits

Built for a single agent instance. No auth, timeouts, or metrics out of the box — fine for local/dev, not a full production job queue.

---

Node.js, TypeScript, Fastify, SQLite.
