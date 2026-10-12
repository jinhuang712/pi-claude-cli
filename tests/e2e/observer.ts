import { appendFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** Only synthetic sandbox content and whitelisted public transport metadata. */
export function record(type: string, data: unknown): void {
  const path = process.env.PCC_E2E_OBSERVATIONS;
  if (!path) throw new Error("PCC_E2E_OBSERVATIONS is required");
  if (process.env.PCC_E2E_BOUNDARY === "1") {
    // A failed model may call an unexpected tool. Keep its arguments, returned
    // text, and native payloads out of the boundary fixture's observation file.
    if (type === "tool-start" || type === "tool-end")
      data = metadata(data, ["toolCallId", "toolName"], ["isError"]);
    else if (type === "canonical-tool")
      data = { call: metadata(object(data).call, ["id", "name"]) };
    else if (type === "initialized")
      data = metadata(data, ["claudeSessionId", "model", "runtimeVersion"]);
  }
  appendFileSync(path, JSON.stringify({ type, data }) + "\n", { mode: 0o600 });
}

/** Exercise native hook revisions only for the cache test's exact fixture. */
export function rewriteCacheTool(event: {
  toolName: string;
  toolCallId: string;
  input: unknown;
}): void {
  const from = process.env.PCC_E2E_REWRITE_FROM;
  const to = process.env.PCC_E2E_REWRITE_TO;
  if (!from || !to || event.toolName !== "bash") return;
  const input = object(event.input);
  if (input.command !== from) return;
  input.command = to;
  record("native-hook-rewrite", {
    toolCallId: event.toolCallId,
    toolName: event.toolName,
  });
}

export function response(
  status: number,
  headers: Record<string, string>,
  provider?: string,
): void {
  const providerScope =
    provider === "pi-claude-cli" ? "bridge" : provider ? "other" : "unknown";
  if (providerScope === "other") {
    record("other-provider-response", { status, providerScope });
    return;
  }
  record("response", {
    providerScope,
    status,
    driver: headers["x-pi-claude-driver"],
    claudeSessionId: headers["x-pi-claude-session-id"],
    transport: headers["x-pi-claude-transport"],
    ...(headers["x-pi-claude-call-scope"]
      ? {
          callScope: ["session", "auxiliary"].includes(
            headers["x-pi-claude-call-scope"],
          )
            ? headers["x-pi-claude-call-scope"]
            : "unknown",
        }
      : {}),
  });
}

export function systemPrompt(stage: string, value: unknown): void {
  const marker = process.env.PCC_E2E_SYSTEM_MARKER;
  const parts =
    typeof value === "string"
      ? [value]
      : Array.isArray(value) && value.every((part) => typeof part === "string")
        ? value
        : undefined;
  record("system-prompt", {
    stage,
    available: parts !== undefined,
    markerConfigured: Boolean(marker),
    markerIncluded: Boolean(
      marker && parts?.some((part) => part.includes(marker)),
    ),
    length: parts?.join("\n\n").length,
    parts: parts?.length,
  });
}

export function providerPrompt(payload: unknown, hostSessionId?: string): void {
  const prompt =
    typeof payload === "object" && payload !== null && "systemPrompt" in payload
      ? payload.systemPrompt
      : undefined;
  systemPrompt("before_provider_request", prompt);
  if (process.env.PCC_E2E_BOUNDARY === "1") {
    const input = object(object(payload).input);
    const requestSessionId = object(object(payload).session).sessionId;
    const callScope =
      hostSessionId && typeof requestSessionId === "string"
        ? requestSessionId === hostSessionId
          ? "session"
          : "auxiliary"
        : undefined;
    const marker = process.env.PCC_E2E_STEER_MARKER;
    const steering = Array.isArray(input.steering) ? input.steering : [];
    const texts = steering.slice(0, 32).flatMap((block) => {
      const part = object(block);
      return part.type === "text" && typeof part.text === "string"
        ? [part.text]
        : [];
    });
    const length = texts.reduce((total, text) => total + text.length, 0);
    record("steering-input", {
      ...(callScope ? { callScope } : {}),
      kind:
        input.kind === "prompt" || input.kind === "tool-results"
          ? input.kind
          : "unknown",
      markerConfigured: Boolean(marker),
      markerIncluded: Boolean(
        marker && texts.some((text) => text.slice(0, 65536).includes(marker)),
      ),
      parts: Math.min(steering.length, 32),
      length: Math.min(length, 65536),
      truncated: steering.length > 32 || length > 65536,
    });
  }
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function safeId(value: unknown): string | undefined {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    !/\p{Cc}/u.test(value)
    ? value
    : undefined;
}
function safeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function metadata(
  value: unknown,
  ids: readonly string[],
  flags: readonly string[] = [],
  counts: readonly string[] = [],
): Record<string, unknown> {
  const source = object(value),
    result: Record<string, unknown> = {};
  for (const key of ids) {
    const id = safeId(source[key]);
    if (id !== undefined) result[key] = id;
  }
  for (const key of flags)
    if (typeof source[key] === "boolean") result[key] = source[key];
  for (const key of counts)
    if (safeCount(source[key])) result[key] = source[key];
  return result;
}

/** Native admission/consumption metadata only; never capture an input packet. */
export function steeringAdmission(value: unknown): void {
  const event = object(value);
  const source = object(event.data);
  const commandId = safeId(source.commandId);
  if (
    event.type !== "observation" ||
    event.family !== "diagnostic" ||
    event.subtype !== "steering-admission" ||
    !safeCount(event.sequence) ||
    !commandId ||
    (source.state !== "queued" && source.state !== "started")
  )
    return;
  record("steering-admission", {
    commandId,
    state: source.state,
    sequence: event.sequence,
  });
}

let nativeOutputScope: string | undefined;
const nativeTextTails = new Map<string, string>();
/** Compare synthetic markers against native output without writing any text. */
export function nativeOutput(value: unknown): void {
  const marker = safeId(process.env.PCC_E2E_STEER_MARKER);
  if (process.env.PCC_E2E_BOUNDARY !== "1" || !marker) return;
  const event = object(value);
  const eventType = event.type;
  if (
    !safeCount(event.sequence) ||
    (eventType !== "assistant_snapshot" &&
      eventType !== "content_start" &&
      eventType !== "content_delta" &&
      eventType !== "turn_end")
  )
    return;
  const scope = `${process.env.PCC_E2E_OBSERVATIONS}:${marker}`;
  if (scope !== nativeOutputScope) {
    nativeTextTails.clear();
    nativeOutputScope = scope;
  }
  const messageId =
    safeId(event.messageId) ?? safeId(object(event.attribution).messageId);
  const block = object(event.content);
  const delta = object(event.delta);
  const texts =
    eventType === "assistant_snapshot" && Array.isArray(event.content)
      ? event.content.slice(0, 32).flatMap((part) => {
          const content = object(part);
          return content.type === "text" && typeof content.text === "string"
            ? [content.text]
            : [];
        })
      : eventType === "content_start" &&
          block.type === "text" &&
          typeof block.text === "string"
        ? [block.text]
        : eventType === "content_delta" &&
            delta.kind === "text" &&
            typeof delta.text === "string"
          ? [delta.text]
          : eventType === "turn_end" && typeof event.resultText === "string"
            ? [event.resultText]
            : [];
  const text = texts
    .map((part) => part.slice(0, 65536))
    .join("")
    .slice(0, 65536);
  let markerIncluded = text.includes(marker);
  if (
    messageId &&
    safeCount(event.index) &&
    (eventType === "content_start" || eventType === "content_delta")
  ) {
    const key = `${messageId}:${event.index}`;
    const previous =
      eventType === "content_delta" ? (nativeTextTails.get(key) ?? "") : "";
    const combined = previous + text;
    markerIncluded = combined.includes(marker);
    if (nativeTextTails.size >= 128 && !nativeTextTails.has(key))
      nativeTextTails.delete(nativeTextTails.keys().next().value!);
    // Only a bounded suffix lives transiently in the observer to detect a marker
    // split across streamed chunks. No part of that suffix enters a receipt.
    nativeTextTails.set(
      key,
      marker.length > 1 ? combined.slice(-(marker.length - 1)) : "",
    );
  }
  record("native-output", {
    eventType,
    messageId,
    sequence: event.sequence,
    length: Math.min(
      texts.reduce((length, part) => length + part.length, 0),
      65536,
    ),
    markerIncluded,
  });
}

let calls = 0;

let gateCalls = 0;
/** A real native tool stays parked until the RPC controller releases its file. */
export async function gate(
  toolCallId: string,
  signal: AbortSignal | undefined,
) {
  const nonce = process.env.PCC_E2E_NONCE;
  const temp = process.env.TMPDIR;
  const release = process.env.PCC_E2E_GATE_RELEASE;
  if (
    !nonce ||
    !temp ||
    !release ||
    release !== join(dirname(temp), "gate-release")
  )
    throw new Error("Native E2E gate requires its owned release marker");
  const call = { toolCallId, calls: ++gateCalls };
  record("gate-start", call);
  await new Promise<void>((resolve, reject) => {
    const poll = setInterval(() => {
      if (existsSync(release)) finish();
    }, 25);
    const timeout = setTimeout(() => {
      record("gate-timeout", call);
      finish(new Error("Native E2E gate release timed out"));
    }, 12000);
    function finish(error?: Error) {
      clearInterval(poll);
      clearTimeout(timeout);
      signal?.removeEventListener("abort", aborted);
      if (error) reject(error);
      else resolve();
    }
    function aborted() {
      record("gate-abort", call);
      finish(new Error("Native E2E gate was aborted"));
    }
    if (signal?.aborted) aborted();
    else signal?.addEventListener("abort", aborted, { once: true });
  });
  const structuredContent = { ...call, nonce };
  record("gate-release", call);
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(structuredContent) },
    ],
    details: { structuredContent, _meta: { fixture: "native-boundary-gate" } },
    structuredContent,
  };
}

export async function sentinel(toolCallId: string) {
  const nonce = process.env.PCC_E2E_NONCE;
  if (!nonce) throw new Error("PCC_E2E_NONCE is required");
  calls++;
  const structuredContent = { nonce, calls, toolCallId };
  record("sentinel", structuredContent);
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(structuredContent) },
    ],
    details: { structuredContent, _meta: { fixture: "native-live-sentinel" } },
    structuredContent,
  };
}

export async function slow(
  toolCallId: string,
  signal: AbortSignal | undefined,
) {
  record("slow-start", { toolCallId });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", aborted);
      record("slow-effect", { toolCallId });
      resolve();
    }, 30_000);
    function aborted() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", aborted);
      record("slow-abort", { toolCallId });
      reject(new Error("Native E2E slow tool aborted"));
    }
    if (signal?.aborted) aborted();
    else signal?.addEventListener("abort", aborted, { once: true });
  });
  return {
    content: [{ type: "text" as const, text: "slow-effect" }],
    details: {},
  };
}
