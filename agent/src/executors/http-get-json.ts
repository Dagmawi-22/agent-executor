import {
  Command,
  HttpGetJsonResult,
  HttpGetJsonPayload,
} from "../types";

const MAX_BODY_SIZE = 1024 * 100;

export async function executeHttpGetJson(
  command: Command
): Promise<HttpGetJsonResult> {
  const payload = command.payload as HttpGetJsonPayload;

  try {
    const response = await fetch(payload.url);

    const text = await response.text();
    const bytesReturned = text.length;
    const truncated = bytesReturned > MAX_BODY_SIZE;

    const bodyText = truncated ? text.slice(0, MAX_BODY_SIZE) : text;

    let body: object | string | null;
    try {
      body = JSON.parse(bodyText);
    } catch {
      body = bodyText;
    }

    return {
      status: response.status,
      body,
      truncated,
      bytesReturned,
      error: null,
    };
  } catch (error) {
    return {
      status: 0,
      body: null,
      truncated: false,
      bytesReturned: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
