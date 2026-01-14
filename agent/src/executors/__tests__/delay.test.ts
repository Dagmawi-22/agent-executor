/// <reference types="jest" />
import { executeDelay } from "../delay";
import { Command } from "../../types";

describe("DELAY Executor", () => {
  it("should delay for specified milliseconds", async () => {
    const delayMs = 100;
    const command: Command = {
      id: "test-delay-1",
      type: "DELAY",
      payload: { ms: delayMs },
      status: "RUNNING",
      result: null,
      agentId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      assignedAt: null,
    };

    const startTime = Date.now();
    const result = await executeDelay(command);
    const elapsed = Date.now() - startTime;

    expect(result.ok).toBe(true);
    expect(result.tookMs).toBeGreaterThanOrEqual(delayMs);
    expect(elapsed).toBeGreaterThanOrEqual(delayMs);
  });

  it("should return accurate timing", async () => {
    const delayMs = 50;
    const command: Command = {
      id: "test-delay-2",
      type: "DELAY",
      payload: { ms: delayMs },
      status: "RUNNING",
      result: null,
      agentId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      assignedAt: null,
    };

    const result = await executeDelay(command);

    expect(result.tookMs).toBeGreaterThanOrEqual(delayMs);
    expect(result.tookMs).toBeLessThan(delayMs + 50);
  });

  it("should handle zero delay", async () => {
    const command: Command = {
      id: "test-delay-zero",
      type: "DELAY",
      payload: { ms: 0 },
      status: "RUNNING",
      result: null,
      agentId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      assignedAt: null,
    };

    const result = await executeDelay(command);

    expect(result.ok).toBe(true);
    expect(result.tookMs).toBeGreaterThanOrEqual(0);
  });

  it("should handle large delays", async () => {
    const delayMs = 500;
    const command: Command = {
      id: "test-delay-large",
      type: "DELAY",
      payload: { ms: delayMs },
      status: "RUNNING",
      result: null,
      agentId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      assignedAt: null,
    };

    const startTime = Date.now();
    const result = await executeDelay(command);
    const elapsed = Date.now() - startTime;

    expect(result.ok).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(delayMs);
  }, 10000); // Increase test timeout for longer delay
});
