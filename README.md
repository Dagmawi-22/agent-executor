# Skipr Backend Test - Fault-Tolerant Command Execution System

A fault-tolerant distributed system with a control server and agent that executes commands reliably, with crash recovery and idempotent execution.

## Architecture Overview

```
┌─────────────────────┐         ┌──────────────────────┐
│  Control Server     │◄────────┤      Agent           │
│                     │         │                      │
│  - REST API         │         │  - Command Poller    │
│  - SQLite DB        │         │  - Executors         │
│  - Recovery Logic   │         │  - Idempotency DB    │
└─────────────────────┘         └──────────────────────┘
         │                                 │
         ├── POST /commands                ├── Polls GET /commands/next
         ├── GET /commands/:id             ├── Submits PUT /commands/:id/result
         ├── GET /commands (all)           └── Crash simulation flags
         └── SQLite persistence
```

### Control Server

**Stack**: Node.js + TypeScript + Fastify + SQLite
**Persistence**: better-sqlite3 with WAL mode

**Responsibilities**:
- Accept command submissions via REST API
- Persist command state to SQLite database
- Assign commands to agents with transaction-based locking
- Track command lifecycle: PENDING → RUNNING → COMPLETED/FAILED
- Recover from crashes by marking orphaned RUNNING commands as FAILED

**Endpoints**:
- `GET /health` - Health check
- `POST /commands` - Submit new command
- `GET /commands` - List all commands
- `GET /commands/:id` - Get command status
- `GET /commands/next?agentId=X` - Agent polling (with locking)
- `PUT /commands/:id/result` - Agent submits result

### Agent

**Stack**: Node.js + TypeScript + SQLite (for idempotency)

**Responsibilities**:
- Poll control server for pending commands
- Execute DELAY and HTTP_GET_JSON commands
- Submit results back to server
- Track executed commands in local SQLite DB (idempotency)
- Simulate crashes for testing (`--kill-after`, `--random-failures`)

**Executors**:
- `DELAY`: Sleeps for specified milliseconds, returns actual duration
- `HTTP_GET_JSON`: Fetches URL, returns status + body (truncated to 100KB)

## Persistence Strategy

### Control Server Database

**Location**: `control-server/data/commands.db`
**Schema**: `control-server/src/db/schema.sql`

```sql
CREATE TABLE commands (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('DELAY', 'HTTP_GET_JSON')),
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  result TEXT,
  agentId TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  assignedAt INTEGER
);
```

**Indexes**:
- `idx_commands_status` - Fast PENDING command lookups
- `idx_commands_agentId` - Agent-specific queries

### Agent Idempotency Database

**Location**: `agent/data/idempotency.db`

```sql
CREATE TABLE executed_commands (
  commandId TEXT PRIMARY KEY,
  executedAt INTEGER NOT NULL
);
```

**Purpose**: Prevents re-execution if agent crashes after completing a command but before reporting to server.

## Crash Recovery & Fault Tolerance

### Server Crash Recovery

**On Startup** (`control-server/src/server.ts:18`):
```typescript
runRecovery(() => commandsService.recoverRunningCommands());
```

**Strategy**: Mark all RUNNING commands as FAILED, but agent automatically retries them

**Rationale**:
- FAILED status provides visibility that server crashed during execution
- Agent polling includes both PENDING and FAILED commands for automatic retry
- Agent idempotency prevents actual re-execution if already completed
- Best of both worlds: clear failure tracking + automatic recovery

### Agent Crash Recovery

**Dual Protection**:

1. **Server-side locking** (`control-server/src/services/commands.service.ts:77-110`):
   - Transaction ensures atomic PENDING → RUNNING transition
   - No command assigned to multiple agents

2. **Agent-side idempotency** (`agent/src/services/idempotency.ts`):
   - Checks local DB before executing
   - Marks command as executed after completion
   - Prevents re-execution even if server state is inconsistent

**Edge Cases Handled**:
- Crash mid-DELAY: Server marks FAILED, agent retries but won't re-execute if already started (idempotency)
- Crash after execution, before reporting: Server marks FAILED, agent picks it up, skips execution (idempotency), reports result
- Server restart during agent execution: Command marked FAILED on restart, agent may complete and submit successfully or retry

## Design Decisions & Trade-offs

### 1. Recovery Strategy: RUNNING → FAILED + Auto-Retry

**Decision**: On server restart, mark all RUNNING commands as FAILED, but agent automatically retries them by polling for both PENDING and FAILED commands

**Alternatives Considered**:
- Mark as PENDING: Loses visibility that a crash occurred
- Mark as FAILED only: Commands stay stuck, requiring manual intervention
- Smart detection: Too complex, not worth the risk

**Trade-off**: Provides visibility (FAILED status shows what crashed) while maintaining automatic recovery. Agent idempotency prevents double execution, making retry safe.

### 2. Transactional Command Assignment

**Implementation**: SQLite transaction wraps SELECT + UPDATE

**Benefits**:
- Prevents race conditions if multiple agents added later
- Atomic state transition
- No external locking mechanism needed

### 3. Dual Idempotency (Server + Agent)

**Server**: Status-based (PENDING → RUNNING prevents reassignment)
**Agent**: Local DB tracking (prevents actual re-execution)

**Why Both?**:
- Defense in depth
- Handles network failures, partial completions
- Different failure modes covered

### 4. SQLite Over JSON/LevelDB

**Chosen**: SQLite with WAL mode

**Reasons**:
- ACID guarantees
- Efficient indexing for status queries
- Mature, battle-tested
- Transaction support for locking
- Easy to inspect with `sqlite3` CLI

**Trade-off**: Single writer (not a problem for single-agent requirement)

## Running Locally

### Prerequisites
```bash
node >= 18.x
npm or yarn
```

### Control Server

```bash
cd control-server
npm install
npm run dev
```

Server runs on `http://localhost:3000`

### Agent

```bash
cd agent
npm install
npm run dev
```

**Environment Variables**:
- `SERVER_URL` - Control server URL (default: `http://localhost:3000`)
- `POLL_INTERVAL` - Polling interval in ms (default: `2000`)
- `AGENT_ID` - Custom agent ID (default: auto-generated UUID)

**Crash Simulation**:
```bash
npm run dev -- --kill-after=10        # Crash after 10 seconds
npm run dev -- --random-failures      # Random crashes (10% chance per cycle)
```

## Testing

### 1. Basic Flow Test

**Terminal 1 (Server)**:
```bash
cd control-server && npm run dev
```

**Terminal 2 (Agent)**:
```bash
cd agent && npm run dev
```

**Terminal 3 (Create commands)**:
```bash
# DELAY command
curl -X POST http://localhost:3000/commands \
  -H "Content-Type: application/json" \
  -d '{"type":"DELAY","payload":{"ms":3000}}'

# Expected: {"commandId":"<uuid>"}

# HTTP_GET_JSON command
curl -X POST http://localhost:3000/commands \
  -H "Content-Type: application/json" \
  -d '{"type":"HTTP_GET_JSON","payload":{"url":"https://jsonplaceholder.typicode.com/posts/1"}}'

# Check status
curl http://localhost:3000/commands/<commandId>

# Expected: {"status":"COMPLETED","result":{...},"agentId":"agent-..."}
```

### 2. Server Restart Recovery Test

**Steps**:
1. Start server + agent
2. Submit DELAY command with 10s
3. Kill server (Ctrl+C) while agent is executing
4. Restart server
5. Check database: command should be marked FAILED

**Verify**:
```bash
sqlite3 control-server/data/commands.db "SELECT id, status FROM commands;"
```

### 3. Agent Crash Test

**Steps**:
1. Start server
2. Start agent with `--kill-after=5`
3. Submit DELAY command with 10s
4. Agent crashes after 5s
5. Restart agent
6. Agent should NOT re-execute the command (idempotency check)

**Expected Log**:
```
Command <id> already executed (idempotency check)
```

### 4. Idempotency Test

**Steps**:
1. Start server + agent
2. Submit command
3. Kill agent AFTER execution but BEFORE result submission
4. Restart agent
5. Agent fetches same command (marked RUNNING)
6. Agent skips execution (already in idempotency DB)

**Verify Agent DB**:
```bash
sqlite3 agent/data/idempotency.db "SELECT * FROM executed_commands;"
```

## Project Structure

```
├── control-server/
│   ├── src/
│   │   ├── db/
│   │   │   ├── index.ts           # Database connection
│   │   │   └── schema.sql         # SQLite schema
│   │   ├── services/
│   │   │   └── commands.service.ts # CRUD + recovery logic
│   │   ├── routes/
│   │   │   └── index.ts           # API endpoints
│   │   ├── types/
│   │   │   └── index.ts           # TypeScript types
│   │   └── server.ts              # Fastify server + recovery
│   ├── data/                      # SQLite database (gitignored)
│   ├── package.json
│   └── tsconfig.json
│
└── agent/
    ├── src/
    │   ├── executors/
    │   │   ├── index.ts           # Command dispatcher
    │   │   ├── delay.ts           # DELAY executor
    │   │   └── http-get-json.ts   # HTTP_GET_JSON executor
    │   ├── services/
    │   │   ├── api.ts             # HTTP client for server
    │   │   └── idempotency.ts     # Local DB tracking
    │   ├── types/
    │   │   └── index.ts           # TypeScript types
    │   └── agent.ts               # Main polling loop
    ├── data/                      # Idempotency DB (gitignored)
    ├── package.json
    └── tsconfig.json
```

## API Examples

### Create DELAY Command
```bash
curl -X POST http://localhost:3000/commands \
  -H "Content-Type: application/json" \
  -d '{"type":"DELAY","payload":{"ms":5000}}'
```

### Create HTTP_GET_JSON Command
```bash
curl -X POST http://localhost:3000/commands \
  -H "Content-Type: application/json" \
  -d '{"type":"HTTP_GET_JSON","payload":{"url":"https://api.github.com/users/octocat"}}'
```

### Get Command Status
```bash
curl http://localhost:3000/commands/<commandId>
```

### List All Commands
```bash
curl http://localhost:3000/commands
```

## Command Examples

### DELAY Command

**Input**:
```json
{
  "type": "DELAY",
  "payload": { "ms": 3000 }
}
```

**Output**:
```json
{
  "ok": true,
  "tookMs": 3001
}
```

### HTTP_GET_JSON Command

**Input**:
```json
{
  "type": "HTTP_GET_JSON",
  "payload": { "url": "https://jsonplaceholder.typicode.com/posts/1" }
}
```

**Output** (success):
```json
{
  "status": 200,
  "body": { "userId": 1, "id": 1, "title": "...", "body": "..." },
  "truncated": false,
  "bytesReturned": 292,
  "error": null
}
```

**Output** (error):
```json
{
  "status": 0,
  "body": null,
  "truncated": false,
  "bytesReturned": 0,
  "error": "fetch failed"
}
```

## Known Limitations

1. **Single agent assumption**: Designed for one agent, though server supports multiple (untested)
2. **No exponential backoff**: Retries happen immediately on agent poll, no delay strategy
3. **No command timeout**: Long-running commands can block agent indefinitely
4. **No result validation**: Server accepts any result format from agent
5. **No authentication**: Open API, no security
6. **No metrics/monitoring**: No Prometheus, logging only

## Future Enhancements

- [ ] Multiple agent support with load balancing
- [ ] Exponential backoff for retry delays
- [ ] Command timeout enforcement
- [ ] Max retry count to prevent infinite retry loops
- [ ] Result schema validation
- [ ] Authentication & authorization
- [ ] Metrics (Prometheus) + monitoring
- [ ] Graceful shutdown handling
- [ ] Command priority queue

---

## AI Usage Reflection

*This section documents how AI (Claude Code) was used, where it made mistakes, and what required manual intervention.*

### How AI Was Used

1. **Initial architecture design**: AI suggested SQLite + transaction-based locking approach
2. **Boilerplate code**: TypeScript types, Fastify setup, database schema
3. **Implementation**: Most of the code was AI-generated with human guidance
4. **Incremental commits**: AI helped break work into logical commits

### Where AI Was Wrong

1. **better-sqlite3 import**: Initially used wrong import syntax, required fix to use default export
2. **TypeScript config**: Had to change `moduleResolution` from `node` to `bundler` to avoid deprecation warning
3. **Unused parameters**: Generated executor functions with unused `config` parameter

### What Required Manual Debugging

1. **Database directory creation**: Had to manually add `mkdirSync` for data folder
2. **Type imports**: Some import paths needed manual correction
3. **Testing**: All manual testing done by human, AI provided test scenarios

### Manual Commits

All git commits were created manually by the developer sometimes following AI's suggested commit structure.

---

Built with Node.js, TypeScript, Fastify, and SQLite
