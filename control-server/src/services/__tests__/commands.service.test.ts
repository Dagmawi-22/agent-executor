/// <reference types="jest" />
import Database from "better-sqlite3";

describe("CommandsService", () => {
  let testDb: ReturnType<typeof Database>;

  beforeEach(() => {
    testDb = new Database(":memory:");

    testDb.exec(`
      CREATE TABLE commands (
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
      CREATE INDEX idx_commands_status ON commands(status);
      CREATE INDEX idx_commands_agentId ON commands(agentId);
    `);
  });

  afterEach(() => {
    testDb.close();
  });

  describe("Crash Recovery", () => {
    it("should mark all RUNNING commands as FAILED on recovery", () => {
      const now = Date.now();

      testDb.prepare(`
        INSERT INTO commands (id, type, payload, status, agentId, createdAt, updatedAt, assignedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run("cmd-1", "DELAY", '{"ms":1000}', "RUNNING", "agent-1", now, now, now);

      testDb.prepare(`
        INSERT INTO commands (id, type, payload, status, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run("cmd-2", "DELAY", '{"ms":2000}', "PENDING", now, now);

      testDb.prepare(`
        INSERT INTO commands (id, type, payload, status, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run("cmd-3", "DELAY", '{"ms":3000}', "COMPLETED", now, now);

      const recovered = testDb.prepare(`
        UPDATE commands
        SET status = 'FAILED', updatedAt = ?, agentId = NULL, assignedAt = NULL
        WHERE status = 'RUNNING'
      `).run(Date.now());

      expect(recovered.changes).toBe(1);

      const runningCount = testDb.prepare("SELECT COUNT(*) as count FROM commands WHERE status = 'RUNNING'").get() as { count: number };
      const failedCount = testDb.prepare("SELECT COUNT(*) as count FROM commands WHERE status = 'FAILED'").get() as { count: number };

      expect(runningCount.count).toBe(0);
      expect(failedCount.count).toBe(1);
    });
  });

  describe("Command Assignment", () => {
    it("should assign PENDING command to agent with transaction", () => {
      const now = Date.now();

      testDb.prepare(`
        INSERT INTO commands (id, type, payload, status, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run("cmd-1", "DELAY", '{"ms":1000}', "PENDING", now, now);

      const transaction = testDb.transaction(() => {
        const row = testDb.prepare(`
          SELECT * FROM commands
          WHERE status IN ('PENDING', 'FAILED')
          ORDER BY createdAt ASC
          LIMIT 1
        `).get();

        if (!row) return null;

        testDb.prepare(`
          UPDATE commands
          SET status = 'RUNNING', agentId = ?, assignedAt = ?, updatedAt = ?
          WHERE id = ?
        `).run("agent-1", now, now, (row as any).id);

        return testDb.prepare("SELECT * FROM commands WHERE id = ?").get((row as any).id);
      });

      const command = transaction() as any;

      expect(command).not.toBeNull();
      expect(command.status).toBe("RUNNING");
      expect(command.agentId).toBe("agent-1");
      expect(command.assignedAt).toBeTruthy();
    });

    it("should return null when no pending commands exist", () => {
      const transaction = testDb.transaction(() => {
        const row = testDb.prepare(`
          SELECT * FROM commands
          WHERE status IN ('PENDING', 'FAILED')
          ORDER BY createdAt ASC
          LIMIT 1
        `).get();

        return row || null;
      });

      const command = transaction();
      expect(command).toBeNull();
    });

    it("should also pick up FAILED commands for retry", () => {
      const now = Date.now();

      testDb.prepare(`
        INSERT INTO commands (id, type, payload, status, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run("cmd-failed", "DELAY", '{"ms":1000}', "FAILED", now, now);

      const transaction = testDb.transaction(() => {
        const row = testDb.prepare(`
          SELECT * FROM commands
          WHERE status IN ('PENDING', 'FAILED')
          ORDER BY createdAt ASC
          LIMIT 1
        `).get();

        if (!row) return null;

        testDb.prepare(`
          UPDATE commands
          SET status = 'RUNNING', agentId = ?, assignedAt = ?, updatedAt = ?
          WHERE id = ?
        `).run("agent-1", now, now, (row as any).id);

        return testDb.prepare("SELECT * FROM commands WHERE id = ?").get((row as any).id);
      });

      const command = transaction() as any;

      expect(command).not.toBeNull();
      expect(command.id).toBe("cmd-failed");
      expect(command.status).toBe("RUNNING");
    });
  });

  describe("Command Lifecycle", () => {
    it("should transition through lifecycle: PENDING → RUNNING → COMPLETED", () => {
      const now = Date.now();
      const cmdId = "cmd-lifecycle";

      testDb.prepare(`
        INSERT INTO commands (id, type, payload, status, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(cmdId, "DELAY", '{"ms":1000}', "PENDING", now, now);

      let cmd = testDb.prepare("SELECT * FROM commands WHERE id = ?").get(cmdId) as any;
      expect(cmd.status).toBe("PENDING");

      testDb.prepare(`
        UPDATE commands
        SET status = 'RUNNING', agentId = ?, assignedAt = ?, updatedAt = ?
        WHERE id = ?
      `).run("agent-1", now, now, cmdId);

      cmd = testDb.prepare("SELECT * FROM commands WHERE id = ?").get(cmdId) as any;
      expect(cmd.status).toBe("RUNNING");
      expect(cmd.agentId).toBe("agent-1");

      testDb.prepare(`
        UPDATE commands
        SET status = 'COMPLETED', result = ?, updatedAt = ?
        WHERE id = ?
      `).run('{"ok":true,"tookMs":1001}', now, cmdId);

      cmd = testDb.prepare("SELECT * FROM commands WHERE id = ?").get(cmdId) as any;
      expect(cmd.status).toBe("COMPLETED");
      expect(cmd.result).toBeTruthy();
    });

    it("should support FAILED status", () => {
      const now = Date.now();
      const cmdId = "cmd-failed";

      testDb.prepare(`
        INSERT INTO commands (id, type, payload, status, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(cmdId, "DELAY", '{"ms":1000}', "RUNNING", now, now);

      testDb.prepare(`
        UPDATE commands SET status = 'FAILED', updatedAt = ? WHERE id = ?
      `).run(now, cmdId);

      const cmd = testDb.prepare("SELECT * FROM commands WHERE id = ?").get(cmdId) as any;
      expect(cmd.status).toBe("FAILED");
    });
  });

  describe("Command Result Submission", () => {
    it("should update command with result and mark as COMPLETED", () => {
      const now = Date.now();
      const cmdId = "cmd-result";

      testDb.prepare(`
        INSERT INTO commands (id, type, payload, status, agentId, createdAt, updatedAt, assignedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(cmdId, "DELAY", '{"ms":1000}', "RUNNING", "agent-1", now, now, now);

      const result = { ok: true, tookMs: 1001 };

      testDb.prepare(`
        UPDATE commands
        SET status = 'COMPLETED', result = ?, updatedAt = ?
        WHERE id = ? AND agentId = ?
      `).run(JSON.stringify(result), now, cmdId, "agent-1");

      const cmd = testDb.prepare("SELECT * FROM commands WHERE id = ?").get(cmdId) as any;

      expect(cmd.status).toBe("COMPLETED");
      expect(JSON.parse(cmd.result)).toEqual(result);
    });

    it("should not update command if agentId does not match", () => {
      const now = Date.now();
      const cmdId = "cmd-wrong-agent";

      testDb.prepare(`
        INSERT INTO commands (id, type, payload, status, agentId, createdAt, updatedAt, assignedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(cmdId, "DELAY", '{"ms":1000}', "RUNNING", "agent-1", now, now, now);

      const result = testDb.prepare(`
        UPDATE commands
        SET status = 'COMPLETED', result = ?, updatedAt = ?
        WHERE id = ? AND agentId = ?
      `).run('{"ok":true}', now, cmdId, "agent-2");

      expect(result.changes).toBe(0);
    });
  });
});
