import { AdapterError, LimitError, type LlmAdapter, type LlmRequest, type StreamSession } from "../../../shared/llm";

// `anthropic` and `openai-compatible` streaming adapters. Both speak SSE; they
// differ only in URL, auth header, request body and which JSON field carries a
// token. Secrets never reach the router: the main process resolves the key from
// the OS keychain and passes the plain string here. See design D7 / spec 6.2.

export interface HttpAdapterConfig {
  profileId: string;
  model: string;
  apiKey: string;
  /** API base (e.g. https://api.deepseek.com/v1); the adapter appends the route. See defaults. */
  baseUrl?: string;
  maxTokens?: number;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

type Msg = { role: "user" | "assistant"; content: string };

function toMessages(req: LlmRequest): Msg[] {
  const msgs: Msg[] = req.turns.map((t) => ({
    role: t.role === "candidate" ? "assistant" : "user",
    content: t.text,
  }));
  msgs.push({ role: "user", content: req.question });
  return msgs;
}

function systemText(req: LlmRequest): string {
  return [req.prefix, req.system].filter(Boolean).join("\n\n");
}

function limitFrom(res: Response): LimitError {
  const retry = Number(res.headers.get("retry-after"));
  const resetAt = Number.isFinite(retry) && retry > 0 ? Date.now() + retry * 1000 : undefined;
  return new LimitError(`rate limited (HTTP 429)`, resetAt);
}

/** Lazily fetch on first token, parse SSE, map each data payload to a token (null = skip). */
function httpStream(
  doFetch: (signal: AbortSignal) => Promise<Response>,
  mapData: (payload: string) => string | null,
): StreamSession {
  const controller = new AbortController();
  const tokens = (async function* () {
    const res = await doFetch(controller.signal);
    if (res.status === 429) throw limitFrom(res);
    if (!res.ok || !res.body) throw new AdapterError(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trimEnd();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") return;
        const tok = mapData(payload);
        if (tok) yield tok;
      }
    }
  })();
  return { tokens, abort: () => controller.abort() };
}

export function anthropicAdapter(cfg: HttpAdapterConfig): LlmAdapter {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  const url = (cfg.baseUrl ?? "https://api.anthropic.com") + "/v1/messages";
  return {
    profileId: cfg.profileId,
    kind: "anthropic",
    start(req) {
      const body = JSON.stringify({
        model: cfg.model,
        max_tokens: cfg.maxTokens ?? 1024,
        stream: true,
        system: systemText(req),
        messages: toMessages(req),
      });
      return httpStream(
        (signal) =>
          fetchImpl(url, {
            method: "POST",
            signal,
            headers: {
              "content-type": "application/json",
              "x-api-key": cfg.apiKey,
              "anthropic-version": "2023-06-01",
            },
            body,
          }),
        (payload) => {
          const ev = JSON.parse(payload) as { type?: string; delta?: { text?: string } };
          return ev.type === "content_block_delta" ? (ev.delta?.text ?? null) : null;
        },
      );
    },
  };
}

export function openaiCompatibleAdapter(cfg: HttpAdapterConfig): LlmAdapter {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  // Presets store the API base (.../v1); append the chat route. Accept a full URL too.
  const base = (cfg.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const url = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
  return {
    profileId: cfg.profileId,
    kind: "openai-compatible",
    start(req) {
      const body = JSON.stringify({
        model: cfg.model,
        stream: true,
        messages: [{ role: "system", content: systemText(req) }, ...toMessages(req)],
      });
      return httpStream(
        (signal) =>
          fetchImpl(url, {
            method: "POST",
            signal,
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${cfg.apiKey}`,
            },
            body,
          }),
        (payload) => {
          const ev = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
          return ev.choices?.[0]?.delta?.content ?? null;
        },
      );
    },
  };
}
