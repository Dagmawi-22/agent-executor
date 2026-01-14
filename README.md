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

## Running with Docker

### Prerequisites
```bash
docker >= 20.x
docker-compose >= 2.x
```

### Quick Start

**Start both services**:
```bash
docker-compose up --build
```

This will:
- Build Docker images for both control-server and agent
- Start control-server on port 3000
- Wait for health check before starting agent
- Create persistent volumes for databases and logs

**Run in detached mode**:
```bash
docker-compose up -d --build
```

**View logs**:
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f control-server
docker-compose logs -f agent
```

**Stop services**:
```bash
docker-compose down
```

**Stop and remove volumes** (clears databases):
```bash
docker-compose down -v
```

### Testing with Docker

**Submit commands** (use the host port, default 3000 or your configured `CONTROL_SERVER_PORT`):
```bash
# Health check
curl http://localhost:3000/health

# DELAY command
curl -X POST http://localhost:3000/commands \
  -H "Content-Type: application/json" \
  -d '{"type":"DELAY","payload":{"ms":3000}}'

# HTTP_GET_JSON command
curl -X POST http://localhost:3000/commands \
  -H "Content-Type: application/json" \
  -d '{"type":"HTTP_GET_JSON","payload":{"url":"https://jsonplaceholder.typicode.com/posts/1"}}'

# Check status
curl http://localhost:3000/commands/<commandId>

# List all commands
curl http://localhost:3000/commands
```

**Note**: If you set `CONTROL_SERVER_PORT=7001` in your `.env`, use `http://localhost:7001` instead.

**Access service logs**:
```bash
# Check agent logs inside container
docker exec -it agent cat /app/logs/agent.log

# Check server logs inside container
docker exec -it control-server cat /app/logs/server.log
```

**Access databases**:
```bash
# Control server database
docker exec -it control-server sqlite3 /app/data/commands.db "SELECT id, status FROM commands;"

# Agent idempotency database
docker exec -it agent sqlite3 /app/data/idempotency.db "SELECT * FROM executed_commands;"
```

### Docker Volumes

Persistent data is stored in named volumes:
- `control-server-data`: Server SQLite database
- `control-server-logs`: Server log files
- `agent-data`: Agent idempotency database
- `agent-logs`: Agent log files

### Environment Configuration

The docker-compose configuration supports environment variables for flexible deployment:

1. **Copy the example environment file**:
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` with your values**:
   ```bash
   # Port mapping: Host port -> Container port
   # Control server listens on port 3000 inside the container
   # This maps it to a different port on the host machine
   CONTROL_SERVER_PORT=7001

   # IMPORTANT: SERVER_URL must use the INTERNAL container port (3000)
   # NOT the external host port (7001)
   # Containers communicate directly inside the Docker network
   SERVER_URL=http://control-server:3000

   POLL_INTERVAL=2000
   NODE_ENV=production
   AGENT_ID=agent-1
   ```

3. **Run with custom configuration**:
   ```bash
   docker-compose up -d
   ```

**Understanding Port Configuration**:
- **Container Port**: The port the service listens on INSIDE the container (always 3000 for control-server)
- **Host Port**: The port exposed on the HOST machine (configurable via `CONTROL_SERVER_PORT`, e.g., 7001)
- **Docker Network**: Containers communicate using container ports, not host ports
- **External Access**: Use the host port (e.g., `http://localhost:7001/health`)
- **Internal Access**: Agent uses container port via `SERVER_URL=http://control-server:3000`

### Nginx Reverse Proxy Setup

To expose the control-server through nginx on a custom path:

1. **Create nginx configuration** (`/etc/nginx/sites-available/agent-executor`):
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;  # or use _ for IP-based access

       location /agent-executor {
           rewrite ^/agent-executor(/.*)$ $1 break;
           rewrite ^/agent-executor$ / break;
           proxy_pass http://127.0.0.1:7001;  # Use the host port
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

2. **Enable and reload**:
   ```bash
   sudo ln -s /etc/nginx/sites-available/agent-executor /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

3. **Test**:
   ```bash
   curl http://your-domain.com/agent-executor/health
   ```

**Important**: Make sure to use the **host port** (e.g., 7001) in the nginx `proxy_pass` directive, not the container port (3000).

### Docker Deployment Troubleshooting

**Problem: Container builds but server can't be accessed from host**

*Symptom*: `curl: (56) Recv failure: Connection reset by peer` or nginx 502 errors

*Solution*: The server must bind to `0.0.0.0` instead of `localhost` to accept connections through Docker port mapping:

```typescript
// control-server/src/server.ts
await fastify.listen({ port: 3000, host: '0.0.0.0' });
```

Without `host: '0.0.0.0'`, the server only accepts connections from inside the container, preventing Docker port mapping from working.

**Problem: Agent logs show "fetch failed" errors**

*Symptom*: Agent continuously fails to connect to control-server

*Solution*: Check that `SERVER_URL` uses the **internal container port** (3000), not the external host port:

```bash
# Wrong - uses host port
SERVER_URL=http://control-server:7001

# Correct - uses container port
SERVER_URL=http://control-server:3000
```

**Problem: Docker build fails with "EBADENGINE" error**

*Symptom*: `npm warn EBADENGINE Unsupported engine { package: 'better-sqlite3@12.6.0' }`

*Solution*: Update Dockerfiles to use Node 20+:

```dockerfile
FROM node:20-alpine
```

**Problem: TypeScript compilation fails in Docker**

*Symptom*: `tsc: The TypeScript Compiler - Version 5.9.3` (help output instead of compilation)

*Solution*: Ensure `tsconfig.json` is NOT in `.dockerignore`. Remove it if present:

```bash
# .dockerignore should NOT contain:
# tsconfig.json  <- Remove this line
```

**Problem: npm ci fails with "package-lock.json not found"**

*Solution*: Ensure `package-lock.json` is committed to git and not in `.gitignore`.

## CI/CD Pipeline

This project includes a GitHub Actions CI/CD pipeline that automatically builds, tests, and pushes Docker images to GitHub Container Registry.

### Pipeline Overview

The workflow (`.github/workflows/ci-cd.yml`) runs on:

- **Push to main**: Builds, tests, and pushes Docker images to GitHub Container Registry
- **Pull requests to main**: Runs build and test only (no image push)

### What Happens Automatically

1. **Build and Test**: Compiles TypeScript and runs tests for both services
2. **Build and Push**: Creates Docker images and pushes to `ghcr.io/YOUR_USERNAME/agent-executor/control-server:latest` and `ghcr.io/YOUR_USERNAME/agent-executor/agent:latest`

**No manual configuration needed** - GitHub automatically provides `GITHUB_TOKEN` for pushing to the registry.

### Using Pre-Built Images from GitHub Container Registry

After the CI/CD pipeline pushes images to GitHub Container Registry, you can pull and run them on any server:

#### Option 1: Pull and Run with docker-compose.prod.yml

1. **On your server, copy the production compose file**:
   ```bash
   # Create a directory
   mkdir -p ~/agent-executor
   cd ~/agent-executor

   # Copy files (or git clone the repo)
   # You need: docker-compose.prod.yml and .env.example
   ```

2. **Create .env file with your GitHub repository**:
   ```bash
   cp .env.example .env
   nano .env
   ```

   Set this variable:
   ```bash
   GITHUB_REPOSITORY=your-username/agent-executor
   ```

3. **Pull and start services**:
   ```bash
   docker-compose -f docker-compose.prod.yml pull
   docker-compose -f docker-compose.prod.yml up -d
   ```

4. **Check it's running**:
   ```bash
   curl http://localhost:3000/health
   ```

#### Option 2: Pull Images Manually

```bash
# Login to GitHub Container Registry (if private repo)
echo $GITHUB_TOKEN | docker login ghcr.io -u YOUR_USERNAME --password-stdin

# Pull images
docker pull ghcr.io/YOUR_USERNAME/agent-executor/control-server:latest
docker pull ghcr.io/YOUR_USERNAME/agent-executor/agent:latest

# Run with docker-compose.prod.yml
docker-compose -f docker-compose.prod.yml up -d
```

**Note**: By default, GitHub Container Registry packages are private. Make them public in:
GitHub → Packages → Your package → Package settings → Change visibility

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

## Postman Collection

A complete Postman collection is available at `postman_collection.json` with all API endpoints and examples.

### Import to Postman

1. Open Postman
2. Click **Import** button
3. Select `postman_collection.json` from this repository
4. The collection will be imported with all endpoints

### Collection Variables

The collection uses these variables:
- `baseUrl`: API base URL (default: `http://localhost:3000`)
- `commandId`: Auto-populated when you create a command
- `agentId`: Agent identifier for agent endpoints (default: `agent-test-001`)

### Usage

1. **Update baseUrl** if your server is on a different port or host
2. **Run Health Check** to verify the server is running
3. **Create a command** using one of the POST endpoints (commandId will be auto-saved)
4. **Get Command by ID** to check the status (uses the saved commandId)
5. **Get All Commands** to see all commands

### Included Endpoints

- ✅ Health Check
- ✅ Create DELAY Command
- ✅ Create HTTP_GET_JSON Command (JSONPlaceholder example)
- ✅ Create HTTP_GET_JSON Command (GitHub API example)
- ✅ Get All Commands
- ✅ Get Command by ID
- ✅ Agent - Poll for Next Command
- ✅ Agent - Submit Command Result (DELAY)
- ✅ Agent - Submit Command Result (HTTP)

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

## Development Notes

*This project was built collaboratively between a human developer and AI (Claude Code). This section honestly documents the contributions and limitations of both.*

### Developer Contributions

The human developer was responsible for:
1. **Architecture decisions**: Chose the overall approach and requirements
2. **Problem-solving**: Identified critical missing features (like automatic retry mechanism)
3. **Code review**: Caught all AI mistakes and required fixes
4. **Testing**: Performed all manual testing and validation
5. **Git workflow**: Created all commits with meaningful messages
6. **Quality standards**: Enforced TypeScript best practices (no `any` types, proper logging)
7. **Critical thinking**: Questioned AI suggestions and pushed for better solutions

### AI Contributions

AI assisted with:
1. **Boilerplate generation**: TypeScript types, Fastify routes, database schema
2. **Code scaffolding**: Initial structure for services, executors, and utilities
3. **Documentation**: README structure and API examples
4. **Docker setup**: Dockerfiles and docker-compose configuration

### Where AI Failed

AI made several significant mistakes that required human intervention:

1. **Missing retry logic**: Initially implemented recovery that marked commands as FAILED but **failed to implement any retry mechanism**. The developer had to point out this critical flaw and suggest the solution of polling for both PENDING and FAILED commands.

2. **Import issues**: Used wrong syntax for `better-sqlite3` imports, causing runtime errors

3. **TypeScript configuration**:
   - Used deprecated `moduleResolution` settings
   - Had to fix multiple times (node → bundler → node10 with ignoreDeprecations)
   - Agent's tsconfig.json became empty at one point

4. **Missing files**: The `agent.ts` file was completely missing initially, causing the agent to fail

5. **Type safety**: Initially used `any` types everywhere until developer requested proper typing

6. **Directory creation**: Forgot to create data directories, causing database initialization failures

7. **Logging approach**: Initially suggested console.log everywhere; developer requested file-based logging with timestamps

### Human-Led Improvements

Key improvements driven by the developer:
- Automatic retry mechanism (AI completely missed this)
- File-based logging with timestamps instead of console.log
- Removing all `any` types for full type safety
- Proper error handling and idempotency checks
- Docker setup optimization

### Conclusion

While AI accelerated initial development, **the human developer was essential** for:
- Catching critical design flaws
- Ensuring code quality
- Implementing missing features
- Fixing numerous bugs
- Making architectural decisions

The final working system is a result of active human supervision and correction of AI-generated code.

---

Built with Node.js, TypeScript, Fastify, and SQLite
