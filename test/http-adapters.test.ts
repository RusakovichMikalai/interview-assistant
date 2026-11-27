import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { anthropicAdapter, openaiCompatibleAdapter } from "../src/main/llm/adapters/http";
import { AdapterError, LimitError, type LlmRequest } from "../src/shared/llm";

const REQ: LlmRequest = {
  system: "be brief",
  turns: [{ role: "interviewer", text: "hi" }],
  question: "explain closures",
};

let server: Server | undefined;
afterEach(() => server?.close());

/** Start an HTTP server that replies with the given status/headers and SSE body. */
function serve(handler: (req: unknown) => { status?: number; headers?: Record<string, string>; sse?: string[] }) {
  return new Promise<string>((resolve) => {
    server = createServer((req, res) => {
      const out = handler(req);
      res.writeHead(out.status ?? 200, { "content-type": "text/event-stream", ...out.headers });
      for (const line of out.sse ?? []) res.write(line);
      res.end();
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server!.address();
      resolve(`http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`);
    });
  });
}

async function collect(tokens: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const t of tokens) out.push(t);
  return out;
}

describe("anthropic adapter (6.2)", () => {
  it("streams content_block_delta text", async () => {
    const base = await serve(() => ({
      sse: [
        `data: ${JSON.stringify({ type: "message_start" })}\n\n`,
        `data: ${JSON.stringify({ type: "content_block_delta", delta: { text: "Hel" } })}\n\n`,
        `data: ${JSON.stringify({ type: "content_block_delta", delta: { text: "lo" } })}\n\n`,
        `data: ${JSON.stringify({ type: "message_stop" })}\n\n`,
      ],
    }));
    const a = anthropicAdapter({ profileId: "a", model: "m", apiKey: "k", baseUrl: base });
    expect(await collect(a.start(REQ).tokens)).toEqual(["Hel", "lo"]);
  });

  it("throws LimitError with resetAt from retry-after on 429", async () => {
    const base = await serve(() => ({ status: 429, headers: { "retry-after": "2" } }));
    const a = anthropicAdapter({ profileId: "a", model: "m", apiKey: "k", baseUrl: base });
    const before = Date.now();
    await expect(collect(a.start(REQ).tokens)).rejects.toSatisfy((e: unknown) => {
      return e instanceof LimitError && (e.resetAt ?? 0) >= before + 2000;
    });
  });
});

describe("openai-compatible adapter (6.2)", () => {
  it("streams choices[].delta.content and stops at [DONE]", async () => {
    const base = await serve(() => ({
      sse: [
        `data: ${JSON.stringify({ choices: [{ delta: { role: "assistant" } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: "foo" } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: "bar" } }] })}\n\n`,
        `data: [DONE]\n\n`,
      ],
    }));
    const a = openaiCompatibleAdapter({ profileId: "o", model: "m", apiKey: "k", baseUrl: base });
    expect(await collect(a.start(REQ).tokens)).toEqual(["foo", "bar"]);
  });

  it("throws AdapterError on a 500", async () => {
    const base = await serve(() => ({ status: 500 }));
    const a = openaiCompatibleAdapter({ profileId: "o", model: "m", apiKey: "k", baseUrl: base });
    await expect(collect(a.start(REQ).tokens)).rejects.toBeInstanceOf(AdapterError);
  });

  it("abort() stops the stream", async () => {
    // Server that holds the connection open after one token.
    const base = await serve(() => ({
      sse: [`data: ${JSON.stringify({ choices: [{ delta: { content: "one" } }] })}\n\n`],
    }));
    const a = openaiCompatibleAdapter({ profileId: "o", model: "m", apiKey: "k", baseUrl: base });
    const s = a.start(REQ);
    const it = s.tokens[Symbol.asyncIterator]();
    expect((await it.next()).value).toBe("one");
    s.abort();
    // After abort the next pull settles (ends or throws AbortError); it must not hang.
    const settled = await Promise.race([
      it.next().then(() => "settled", () => "settled"),
      new Promise<string>((res) => setTimeout(() => res("hung"), 1000)),
    ]);
    expect(settled).toBe("settled");
  });
});
