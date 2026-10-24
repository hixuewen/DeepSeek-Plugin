/**
 * Unit tests for the Host analyze route.
 *
 * `index.js` is a plain ESM module whose `apply` is only called by the loader,
 * so importing it here exercises the pure helpers and `analyzeText` without a
 * Host. The model stream is injected through a fake `ctx`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanReply, parseModelOutput, analyzeText } from '../index.js';

test('cleans one short reply', () => {
  assert.equal(cleanReply('发版'), '发版');
  assert.equal(cleanReply('「发版」。'), '发版');
  assert.equal(cleanReply('**继续修复**'), '继续修复');
  assert.equal(cleanReply('发版？'), '');
  assert.equal(cleanReply('@Quick-Command/'), '');
  assert.equal(cleanReply('无'), '');
  assert.equal(cleanReply('x'.repeat(41)), '');
});

test('parses the JSON reply and a bare reply', () => {
  assert.equal(parseModelOutput('{"reply":"发版"}'), '发版');
  assert.equal(parseModelOutput('```json\n{"reply":"继续修复"}\n```'), '继续修复');
  assert.equal(parseModelOutput('发版'), '发版');
  assert.equal(parseModelOutput('{"reply":""}'), '');
  assert.equal(parseModelOutput('{"reply": '), '');
  assert.equal(parseModelOutput(''), '');
});

/** Build a Host context whose model streams the given chunks. */
const fakeCtx = (chunks, capture) => ({
  agentDefaultModel: {
    currentSelection: () => ({
      provider: 'deepseek-official',
      model: 'deepseek-chat',
    }),
  },
  llm: {
    stream(options) {
      capture.push(options);
      return (async function* generate() {
        for (const chunk of chunks) yield chunk;
      })();
    },
  },
});

test('analyzes through the default model route', async () => {
  const calls = [];
  const ctx = fakeCtx(
    [
      { type: 'text-delta', index: 0, text: '{"reply":"' },
      { type: 'text-delta', index: 0, text: '发版"}' },
      { type: 'finish', reason: { kind: 'stop' } },
    ],
    calls,
  );

  assert.equal(
    await analyzeText(ctx, '没有打标签，也没有发版；需要发版时告诉我'),
    '发版',
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].provider, 'deepseek-official');
  assert.equal(calls[0].model, 'deepseek-chat');
  assert.equal(calls[0].messages[0].role, 'user');
  assert.match(calls[0].messages[0].content[0].text, /需要发版时告诉我/u);
  assert.match(calls[0].system, /Return only one JSON object/u);
  assert.equal(calls[0].maxTokens, 96);
});

test('falls back to no reply when the model asks for none', async () => {
  const calls = [];
  const ctx = fakeCtx(
    [
      { type: 'text-delta', index: 0, text: '{"reply":""}' },
      { type: 'finish', reason: { kind: 'stop' } },
    ],
    calls,
  );
  assert.equal(await analyzeText(ctx, '总结一下改动'), '');
});

test('rejects a failed model finish', async () => {
  const calls = [];
  const ctx = fakeCtx([{ type: 'finish', reason: { kind: 'error' } }], calls);
  await assert.rejects(() => analyzeText(ctx, '需要发版时告诉我'));
});

test('rejects an empty stream', async () => {
  const calls = [];
  const ctx = fakeCtx([], calls);
  assert.equal(await analyzeText(ctx, '需要发版时告诉我'), '');
});
