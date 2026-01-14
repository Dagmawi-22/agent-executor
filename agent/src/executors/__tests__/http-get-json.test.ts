/// <reference types="jest" />
import { executeHttpGetJson } from "../http-get-json";
import { Command } from "../../types";

global.fetch = jest.fn();

describe("HTTP_GET_JSON Executor", () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
  });

  it("should successfully fetch JSON data", async () => {
    const mockData = { userId: 1, id: 1, title: "Test Post" };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(mockData),
    });

    const command: Command = {
      id: "test-http-1",
      type: "HTTP_GET_JSON",
      payload: { url: "https://jsonplaceholder.typicode.com/posts/1" },
      status: "RUNNING",
      result: null,
      agentId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      assignedAt: null,
    };

    const result = await executeHttpGetJson(command);

    expect(result.status).toBe(200);
    expect(result.body).toEqual(mockData);
    expect(result.error).toBeNull();
    expect(result.truncated).toBe(false);
    expect(result.bytesReturned).toBeGreaterThan(0);
  });

  it("should handle fetch errors gracefully", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

    const command: Command = {
      id: "test-http-error",
      type: "HTTP_GET_JSON",
      payload: { url: "https://invalid-url.com" },
      status: "RUNNING",
      result: null,
      agentId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      assignedAt: null,
    };

    const result = await executeHttpGetJson(command);

    expect(result.status).toBe(0);
    expect(result.body).toBeNull();
    expect(result.error).toContain("Network error");
    expect(result.bytesReturned).toBe(0);
  });

  it("should handle non-200 status codes", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "Not Found",
    });

    const command: Command = {
      id: "test-http-404",
      type: "HTTP_GET_JSON",
      payload: { url: "https://example.com/not-found" },
      status: "RUNNING",
      result: null,
      agentId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      assignedAt: null,
    };

    const result = await executeHttpGetJson(command);

    expect(result.status).toBe(404);
    expect(result.body).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it("should truncate large responses", async () => {
    const largeData = "a".repeat(150 * 1024); // 150KB

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => largeData,
    });

    const command: Command = {
      id: "test-http-large",
      type: "HTTP_GET_JSON",
      payload: { url: "https://example.com/large" },
      status: "RUNNING",
      result: null,
      agentId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      assignedAt: null,
    };

    const result = await executeHttpGetJson(command);

    expect(result.status).toBe(200);
    expect(result.truncated).toBe(true);
    expect(result.bytesReturned).toBe(100 * 1024); // Should be truncated to 100KB
  });

  it("should handle invalid JSON", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "Not valid JSON",
    });

    const command: Command = {
      id: "test-http-invalid-json",
      type: "HTTP_GET_JSON",
      payload: { url: "https://example.com/invalid" },
      status: "RUNNING",
      result: null,
      agentId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      assignedAt: null,
    };

    const result = await executeHttpGetJson(command);

    expect(result.status).toBe(200);
    expect(result.body).toBeNull();
  });

  it("should report accurate byte count", async () => {
    const data = { test: "data" };
    const jsonString = JSON.stringify(data);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => jsonString,
    });

    const command: Command = {
      id: "test-http-bytes",
      type: "HTTP_GET_JSON",
      payload: { url: "https://example.com/data" },
      status: "RUNNING",
      result: null,
      agentId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      assignedAt: null,
    };

    const result = await executeHttpGetJson(command);

    expect(result.bytesReturned).toBe(jsonString.length);
  });

  it("should handle empty responses", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "",
    });

    const command: Command = {
      id: "test-http-empty",
      type: "HTTP_GET_JSON",
      payload: { url: "https://example.com/empty" },
      status: "RUNNING",
      result: null,
      agentId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      assignedAt: null,
    };

    const result = await executeHttpGetJson(command);

    expect(result.status).toBe(200);
    expect(result.bytesReturned).toBe(0);
  });
});
