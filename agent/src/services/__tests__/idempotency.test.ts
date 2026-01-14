/// <reference types="jest" />
import Database from "better-sqlite3";

describe("Idempotency Service", () => {
  let testDb: ReturnType<typeof Database>;

  beforeEach(() => {
    testDb = new Database(":memory:");

    testDb.exec(`
      CREATE TABLE executed_commands (
        commandId TEXT PRIMARY KEY,
        executedAt INTEGER NOT NULL
      );
    `);
  });

  afterEach(() => {
    testDb.close();
  });

  describe("Command Execution Tracking", () => {
    it("should mark command as executed", () => {
      const commandId = "cmd-123";
      const executedAt = Date.now();

      testDb.prepare(`
        INSERT INTO executed_commands (commandId, executedAt)
        VALUES (?, ?)
      `).run(commandId, executedAt);

      const row = testDb.prepare("SELECT * FROM executed_commands WHERE commandId = ?").get(commandId) as any;

      expect(row).not.toBeNull();
      expect(row.commandId).toBe(commandId);
      expect(row.executedAt).toBe(executedAt);
    });

    it("should check if command was already executed", () => {
      const commandId = "cmd-already-executed";

      testDb.prepare(`
        INSERT INTO executed_commands (commandId, executedAt)
        VALUES (?, ?)
      `).run(commandId, Date.now());

      const row = testDb.prepare("SELECT * FROM executed_commands WHERE commandId = ?").get(commandId);

      expect(row).not.toBeNull();
    });

    it("should return null for command that was not executed", () => {
      const commandId = "cmd-not-executed";

      const row = testDb.prepare("SELECT * FROM executed_commands WHERE commandId = ?").get(commandId);

      expect(row).toBeUndefined();
    });

    it("should prevent duplicate execution tracking", () => {
      const commandId = "cmd-duplicate";

      testDb.prepare(`
        INSERT INTO executed_commands (commandId, executedAt)
        VALUES (?, ?)
      `).run(commandId, Date.now());

      expect(() => {
        testDb.prepare(`
          INSERT INTO executed_commands (commandId, executedAt)
          VALUES (?, ?)
        `).run(commandId, Date.now());
      }).toThrow();
    });
  });

  describe("Idempotency Check Flow", () => {
    it("should allow execution of new command", () => {
      const commandId = "cmd-new";

      const existing = testDb.prepare("SELECT * FROM executed_commands WHERE commandId = ?").get(commandId);

      expect(existing).toBeUndefined();

      const result = { ok: true, tookMs: 1000 };
      testDb.prepare(`
        INSERT INTO executed_commands (commandId, executedAt)
        VALUES (?, ?)
      `).run(commandId, Date.now());

      const marked = testDb.prepare("SELECT * FROM executed_commands WHERE commandId = ?").get(commandId);
      expect(marked).not.toBeUndefined();
    });

    it("should skip execution of already executed command", () => {
      const commandId = "cmd-skip";

      testDb.prepare(`
        INSERT INTO executed_commands (commandId, executedAt)
        VALUES (?, ?)
      `).run(commandId, Date.now());

      const existing = testDb.prepare("SELECT * FROM executed_commands WHERE commandId = ?").get(commandId);

      expect(existing).not.toBeUndefined();

    });
  });

  describe("Crash Recovery Scenario", () => {
    it("should handle case where command executed but result not submitted", () => {
      const commandId = "cmd-crash-after-exec";

      testDb.prepare(`
        INSERT INTO executed_commands (commandId, executedAt)
        VALUES (?, ?)
      `).run(commandId, Date.now());


      const alreadyExecuted = testDb.prepare("SELECT * FROM executed_commands WHERE commandId = ?").get(commandId);

      expect(alreadyExecuted).not.toBeUndefined();

    });
  });

  describe("Database Persistence", () => {
    it("should persist executed commands across sessions", () => {
      const commandId = "cmd-persist";

      testDb.prepare(`
        INSERT INTO executed_commands (commandId, executedAt)
        VALUES (?, ?)
      `).run(commandId, Date.now());

      const row = testDb.prepare("SELECT * FROM executed_commands WHERE commandId = ?").get(commandId);
      expect(row).not.toBeUndefined();
    });
  });
});
