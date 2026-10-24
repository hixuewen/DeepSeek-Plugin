/**
 * Unit tests for the next-step suggestion extractor inside client.js.
 *
 * The plugin file is a browser module that registers itself on
 * window.__ModuleLoader__, so it cannot be imported directly. These tests
 * evaluate only the marked pure-helper section, which keeps the tests free of
 * the client runtime while still exercising the shipped source text.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'client.js'), 'utf8');

const START = '/* --- leading suggestion: pure extraction helpers';
const END = '/* --- end leading suggestion helpers';
const start = source.indexOf(START);
const end = source.indexOf(END);
assert.ok(start >= 0 && end > start, 'extraction section markers missing');

const compile = new Function(
  `const MAX_LENGTH = 40;\n${source.slice(start, end)}\nreturn { extractAction, extractWaitingAction };`,
);
const { extractAction } = compile();

const cases = [
  // Replies the Agent quotes directly.
  ['直接说「继续修复编译」即可。', '继续修复编译'],
  ['如果需要我继续修复，请回复「继续修复编译」。', '继续修复编译'],
  ['如果要继续，直接说 `npm test` 即可', 'npm test'],
  ['直接回复 **继续修复编译**', '继续修复编译'],
  ['直接回复：继续修复编译', '继续修复编译'],
  // Questions.
  ['需要我继续把工程修到可编译状态吗？', '继续把工程修到可编译状态'],
  ['要继续吗？', '继续'],
  // Waiting conditions.
  ['登录完成后告诉我，我读取 C:\\temp\\frida 的结果。', '登录完成'],
  ['装好依赖后告诉我', '装好依赖'],
  ['完成后告诉我', '完成'],
];

for (const [text, expected] of cases) {
  test(`extracts ${JSON.stringify(expected)} from ${JSON.stringify(text)}`, () => {
    assert.equal(extractAction(text), expected);
  });
}

test('extracts a one-word confirmation quoted after 确认一句', () => {
  assert.equal(extractAction('你只需要确认一句：“写这个工具”。'), '写这个工具');
});

test('extracts the confirmation from the full answer shown in the feedback', () => {
  const answer = [
    '输出统一到：',
    '',
    '```',
    'D:\\Code\\RadminViewer\\Viewer\\captures\\radmin\\',
    '```',
    '',
    '你只需要确认一句：“写这个工具”。',
    '我就开始实现，不再让你重复手工断点操作。',
  ].join('\n');
  assert.equal(extractAction(answer), '写这个工具');
});

test('extracts a confirmation quoted without a colon', () => {
  assert.equal(extractAction('你只需要确认一句「写这个工具」即可。'), '写这个工具');
});

test('extracts a confirmation the Agent asks for in plain words', () => {
  assert.equal(extractAction('确认一下：写这个工具'), '写这个工具');
});

test('keeps the reply when a comma follows it on the same sentence', () => {
  assert.equal(
    extractAction('你只需要确认一句：写这个工具，我就开始实现。'),
    '写这个工具',
  );
});

test('accepts 我只需要你说一句 with a quoted reply', () => {
  assert.equal(extractAction('我只需要你说一句“继续”。'), '继续');
});

test('does not turn an open question after a colon into a chip', () => {
  assert.equal(extractAction('确认一下：写这个工具是否可行'), '');
  assert.equal(extractAction('确认一下：写这个工具怎么样'), '');
});

test('ignores a colon that does not follow a directive', () => {
  assert.equal(extractAction('输出统一到：'), '');
  assert.equal(
    extractAction('这里统一输出到：D:\\Code\\RadminViewer\\Viewer\\captures\\radmin\\'),
    '',
  );
  assert.equal(extractAction('我确认「写这个工具」是可行的。'), '');
});

test('does not turn a yes/no question after a colon into a chip', () => {
  assert.equal(extractAction('确认一下：写这个工具吗？'), '');
  assert.equal(extractAction('确认一句：继续呢？'), '');
});
