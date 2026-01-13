CREATE TABLE IF NOT EXISTS commands (
  id TEXT PRIMARY KEY,

  type TEXT NOT NULL CHECK(type IN ('DELAY', 'HTTP_GET_JSON')),

  payload TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),

  result TEXT,

  agentId TEXT,

  createdAt INTEGER NOT NULL,

  updatedAt INTEGER NOT NULL,

  assignedAt INTEGER
);

CREATE INDEX IF NOT EXISTS idx_commands_status ON commands(status);

CREATE INDEX IF NOT EXISTS idx_commands_agentId ON commands(agentId);
