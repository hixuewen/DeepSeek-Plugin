/**
 * Host half of the Quick Commands bundle.
 *
 * Quick commands are a browser-side interaction, but the browser cannot call a
 * model by itself: this half exposes one same-origin endpoint that turns the
 * Agent's latest answer into the short reply a user should send. It reuses the
 * Deployment's own LLM route and credentials (`ctx.llm` and the default model
 * selection), so no API key ever reaches the browser.
 *
 * The route is inert in profiles without a web server (CLI, ACP, SDK): the
 * exported `inject` list keeps the plugin dormant there.
 */

/** Cordis plugin name, matching `cordis.patch.yml` and the package id. */
export const name = 'quick-commands';

/**
 * Services the analyze route needs. `llm` and `agentDefaultModel` provide the
 * configured route, `connection` authenticates the caller, and `webServer`
 * publishes the route.
 */
export const inject = ['webServer', 'llm', 'agentDefaultModel', 'connection'];

/** Same-origin endpoint the client posts one answer to. */
export const ANALYZE_PATH = '/plugins/dsh-quick-commands/analyze';

/** Longest accepted answer, in characters, before it is sent to the model. */
const MAX_ANSWER_CHARS = 8000;

/** Largest accepted request body. One answer is a few kilobytes at most. */
const MAX_BODY_BYTES = 64 * 1024;

/** End-to-end budget for one model call. */
const TIMEOUT_MS = 8000;

/** Output cap: the reply is a short action, never prose. */
const MAX_TOKENS = 96;

/**
 * Instruction for the extractor. JSON output keeps the reply separable from any
 * commentary a model may add; the "时 / 的话 / 即可" note guards the exact bug
 * this feature exists to fix ("发版时" instead of "发版").
 */
const SYSTEM_PROMPT = [
  'You extract the one short reply a user should send to an AI coding assistant.',
  "You are given the assistant's latest answer. Decide whether it is asking the user for a short reply:",
  'a next-step confirmation, an offer it waits on ("say the word and I will release"), or a prerequisite it',
  'waits for the user to finish. If so, reply with the action alone, e.g. "发版", "继续修复", "写这个工具".',
  'Do not include condition words such as 时 / 的话 / 之后, particles such as 吗 / 呢 / 吧, or 即可.',
  'Do not include file references that start with @. Do not explain. If no short reply is requested, reply with "".',
  'Return only one JSON object, exactly {"reply":"..."}, and nothing else.',
].join(' ');

/** JSON response helper. */
const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
};

/**
 * Clean one candidate reply from the model.
 *
 * Mirrors the browser-side command rules: one line, at most 40 characters, no
 * quoting, no terminal punctuation, no question, and never a bare `@` reference.
 *
 * @param raw - candidate reply text.
 * @returns the cleaned reply, or an empty string when it is unusable.
 */
export function cleanReply(raw) {
  const value = String(raw ?? '')
    .replace(/\s*\r?\n\s*/g, ' ')
    .trim()
    .replace(/^[*`"'“”「」『』\s]+/u, '')
    .replace(/[*`"'“”「」『』\s]+$/u, '')
    .replace(/["“”「」『』`]|\*\*/gu, '')
    .replace(/[。.！!；;，,、：:]+$/u, '')
    .replace(/\s+/gu, ' ')
    .trim();

  if (!value || value.length > 40) return '';
  if (/^(?:无|没有|none|null|nothing|n\/a|empty)$/iu.test(value)) return '';
  if (/^@/u.test(value)) return '';
  if (/[？?]$/u.test(value)) return '';
  if (!/[0-9A-Za-z\u00C0-\u024F\u3400-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/u.test(value)) {
    return '';
  }
  return value;
}

/**
 * Read the reply out of model output.
 *
 * The prompt asks for `{"reply":"..."}`; a model that ignores the wrapper and
 * answers with the bare action still counts, while malformed JSON or commentary
 * falls back to no reply (the client then keeps its local heuristic result).
 *
 * @param raw - complete model text.
 * @returns the cleaned reply, or an empty string.
 */
export function parseModelOutput(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  // No brace at all: the model answered with the bare action.
  if (start < 0) return cleanReply(text);
  // A brace with no closing brace is a truncated JSON object, not a reply.
  if (end <= start) return '';
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return cleanReply(parsed && parsed.reply);
  } catch {
    return '';
  }
}

/**
 * Ask the Deployment's model for the reply, with a hard timeout and an output cap.
 *
 * @param ctx - host context providing `llm` and `agentDefaultModel`.
 * @param text - the Agent's latest answer.
 * @returns the cleaned reply, or an empty string when the model asks for none.
 * @throws when the route is unavailable, the model fails, or the call times out.
 */
export async function analyzeText(ctx, text) {
  const selection = ctx.agentDefaultModel.currentSelection();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const stream = ctx.llm.stream({
      provider: selection.provider,
      model: selection.model,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: String(text).slice(0, MAX_ANSWER_CHARS) }],
        },
      ],
      system: SYSTEM_PROMPT,
      maxTokens: MAX_TOKENS,
      purpose: 'quick-commands',
      signal: controller.signal,
    });

    let output = '';
    let failure = '';
    for await (const chunk of stream) {
      if (!chunk) continue;
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
        output += chunk.text;
      } else if (chunk.type === 'finish') {
        const kind = chunk.reason && chunk.reason.kind;
        if (kind !== 'stop') failure = String(kind || 'error');
      }
    }
    if (failure) throw new Error(`model finish: ${failure}`);
    return parseModelOutput(output);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Collect a bounded request body as UTF-8 text.
 *
 * @param req - incoming request.
 * @returns the body, or null when it exceeds the ceiling.
 */
async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.byteLength;
    if (size > MAX_BODY_BYTES) {
      req.resume();
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size).toString('utf8');
}

/**
 * Serve one analyze request: authenticate, validate, call the model, answer JSON.
 *
 * @param ctx - host context.
 * @param req - incoming request.
 * @param res - outgoing response.
 */
async function handleAnalyze(ctx, req, res) {
  const rejection = ctx.connection.requestRejection(req);
  if (rejection !== undefined) {
    res.statusCode = rejection;
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('allow', 'POST');
    res.end();
    return;
  }
  const mediaType = String(req.headers['content-type'] ?? '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  if (mediaType !== 'application/json') {
    sendJson(res, 415, { error: 'unsupported-media-type' });
    return;
  }

  const body = await readBody(req);
  if (body === null) {
    sendJson(res, 413, { error: 'payload-too-large' });
    return;
  }
  let text = '';
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.text === 'string') text = parsed.text;
  } catch {
    // Fall through to the empty-text rejection below.
  }
  if (!text.trim()) {
    sendJson(res, 400, { error: 'text-required' });
    return;
  }

  try {
    const reply = await analyzeText(ctx, text);
    sendJson(res, 200, { reply });
  } catch {
    sendJson(res, 502, { error: 'analyze-failed' });
  }
}

/**
 * Register the analyze route.
 *
 * @param ctx - host context with the injected services.
 */
export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: ANALYZE_PATH,
        handler: (req, res) => handleAnalyze(ctx, req, res),
      }),
    `quick-commands: POST ${ANALYZE_PATH}`,
  );
}
