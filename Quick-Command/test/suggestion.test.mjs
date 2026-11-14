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
  `const MAX_LENGTH = 40;\n${source.slice(start, end)}\nreturn { extractAction, extractWaitingAction, extractSuggestedOptions };`,
);
const { extractAction, extractSuggestedOptions } = compile();

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

// Offers: "需要我发版的话说一声" asks for a reply without naming it in quotes.
test('extracts the action an offer waits on', () => {
  assert.equal(
    extractAction(
      '还没打标签或推送（v1.3.0 + `git push origin main --tags`）。需要我发版的话说一声。',
    ),
    '发版',
  );
  assert.equal(extractAction('需要我继续修复的话告诉我'), '继续修复');
  assert.equal(extractAction('需要我提交的话跟我说一声'), '提交');
  assert.equal(extractAction('需要我发版的话说一声'), '发版');
});

// A "when" clause describes the moment, not the action: "需要发版时告诉我"
// should offer 发版, never 发版时.
test('extracts the offered action from a when clause', () => {
  assert.equal(
    extractAction(
      '没有打标签，也没有发版；需要发版时告诉我，我会按 `v1.3.0` 打标签并推送标签。',
    ),
    '发版',
  );
  assert.equal(extractAction('需要我发版时告诉我'), '发版');
  assert.equal(extractAction('需要我发版的时候告诉我'), '发版');
  assert.equal(extractAction('需要我发版后告诉我'), '发版');
});

test('does not turn a bare @ reference into a chip', () => {
  // "@Quick-Command/" names a folder; it is not a reply the user sends.
  assert.equal(extractAction('直接说 `@Quick-Command/` 即可'), '');
  assert.equal(extractAction('直接回复 @Quick-Command/ 即可。'), '');
  assert.equal(
    extractAction('需要的话，直接发送 @Quick-Command/README.md'),
    '',
  );
  assert.equal(extractAction('请回复「@Quick-Command/」继续'), '');
});

/* --- several options: an answer that asks the user to pick one ------------- */

const CHOICE_ANSWER = [
  '4. 当前状态',
  '',
  '- .14：4899 原版 RServer3；4901 我们的 RadminServer',
  '- 全部新证据与结论已写入 lab-20261110/README.md',
  '- 改动未提交：InputProtocol.cs、ClientSession.cs',
  '',
  '下一步建议按这个顺序：① 剪贴板 1 字节兼容（改动小、可测）；② 多会话槽支持 chat/voice；③ 继续用 /file /shutdown 的动作把剩余命令字节逐个定名。需要我接着做哪一项？',
].join('\n');

test('extracts every inline option the closing question asks to pick', () => {
  assert.deepEqual(extractSuggestedOptions(CHOICE_ANSWER), [
    '剪贴板 1 字节兼容',
    '多会话槽支持 chat/voice',
    '继续用 /file /shutdown 的动作把剩余命令字节逐个定名',
  ]);
});

test('extracts a markdown list under a choice lead-in', () => {
  const answer = [
    '可选方案：',
    '1. 剪贴板兼容',
    '2. 多会话槽',
    '3. 命令定名',
    '',
    '需要我按哪一个来？',
  ].join('\n');
  assert.deepEqual(extractSuggestedOptions(answer), [
    '剪贴板兼容',
    '多会话槽',
    '命令定名',
  ]);
});

test('extracts options numbered with 、 after 请选择', () => {
  const answer = '请选择：\n1、先修剪贴板\n2、先做多会话槽';
  assert.deepEqual(extractSuggestedOptions(answer), [
    '先修剪贴板',
    '先做多会话槽',
  ]);
});

test('extracts a trailing numbered list that ends the answer', () => {
  const answer = [
    '登录已经成功，接下来可以这样做：',
    '',
    '1、写一个 Python 版旧版客户端',
    '2、重启 VM',
  ].join('\n');
  assert.deepEqual(extractSuggestedOptions(answer), [
    '写一个 Python 版旧版客户端',
    '重启 VM',
  ]);
});

test('extracts a bare trailing list with no lead-in and no question', () => {
  assert.deepEqual(
    extractSuggestedOptions('1、写一个 Python 版旧版客户端\n2、重启 VM'),
    ['写一个 Python 版旧版客户端', '重启 VM'],
  );
});

test('extracts options enumerated inline in one paragraph', () => {
  assert.deepEqual(
    extractSuggestedOptions('两条路：1、写一个 Python 版旧版客户端；2、重启 VM。'),
    ['写一个 Python 版旧版客户端', '重启 VM'],
  );
  assert.deepEqual(
    extractSuggestedOptions('1、写一个 Python 版旧版客户端；2、重启 VM'),
    ['写一个 Python 版旧版客户端', '重启 VM'],
  );
});

test('keeps a trailing change list out of the chip row', () => {
  assert.deepEqual(
    extractSuggestedOptions('改动包括：\n1、新增提取函数\n2、删除旧样式'),
    [],
  );
});

test('extracts full-width bracketed options', () => {
  const answer = '下一步先做哪一项？\n（1）剪贴板兼容\n（2）多会话槽';
  assert.deepEqual(extractSuggestedOptions(answer), [
    '剪贴板兼容',
    '多会话槽',
  ]);
});

test('extracts English options under Options/Which one', () => {
  const answer =
    'Options:\n1. Fix the clipboard path\n2. Add multi-session slots\n\nWhich one should I do next?';
  assert.deepEqual(extractSuggestedOptions(answer), [
    'Fix the clipboard path',
    'Add multi-session slots',
  ]);
});

test('keeps at most five options', () => {
  const answer = [
    '下一步按这个顺序：',
    '1. 改剪贴板',
    '2. 改会话槽',
    '3. 改命令表',
    '4. 改文档',
    '5. 补测试',
    '6. 发版',
  ].join('\n');
  assert.deepEqual(extractSuggestedOptions(answer), [
    '改剪贴板',
    '改会话槽',
    '改命令表',
    '改文档',
    '补测试',
  ]);
});

test('leaves a plain list in an answer alone', () => {
  assert.deepEqual(
    extractSuggestedOptions(
      '- .14：4899 原版 RServer3\n- 全部证据已写入 README\n- 改动未提交',
    ),
    [],
  );
  assert.deepEqual(
    extractSuggestedOptions('改动包括：\n1. 新增提取函数\n2. 调整样式'),
    [],
  );
  assert.deepEqual(extractSuggestedOptions('下一步做：\n1. 改剪贴板'), []);
});

test('needs two distinct options to become a chip row', () => {
  assert.deepEqual(
    extractSuggestedOptions('下一步按这个顺序：\n1. 改剪贴板\n2. 改剪贴板'),
    [],
  );
});

test('ignores numbered lines inside a code fence', () => {
  const answer = [
    '输出如下：',
    '```',
    '1. 剪贴板兼容',
    '2. 多会话槽',
    '```',
    '需要我按哪一个来？',
  ].join('\n');
  assert.deepEqual(extractSuggestedOptions(answer), []);
});

test('keeps a parenthetical that is the whole option', () => {
  const answer = '下一步按这个顺序：\n1. （先等构建结果）\n2. 改剪贴板';
  assert.deepEqual(extractSuggestedOptions(answer), [
    '（先等构建结果）',
    '改剪贴板',
  ]);
});

/* --- tables: one chip per row, first column only --------------------------- */

// The answer that produced the useless "接着做哪一项" chip: four directions in a
// table, then the closing question.
const TABLE_ANSWER = [
  '下一步可继续的方向',
  '',
  '| 项 | 可行性 |',
  '| --- | --- |',
  '| `0x20 state=0` 的触发条件 | 中（需在真机上复现，比如 UAC 安全桌面/锁屏） |',
  '| `0xFC` 138B 报文 | 低（只在一次代理会话出现过，缺样本） |',
  '| 原版 Viewer 对我们服务端 `0x90`（无 15B 尾）的兼容性 | 高（用 UIA 驱动 Viewer 点“获取剪贴板”即可验证） |',
  '| 服务端多显示器广告（真实两块屏而不是 fake） | 中（需要在服务端机器上插第二块屏或用 VMware 加显示器） |',
  '',
  '要我接着做哪一项？',
].join('\n');

test('extracts every row of a choice table as its own chip', () => {
  assert.deepEqual(extractSuggestedOptions(TABLE_ANSWER), [
    '0x20 state=0 的触发条件',
    '0xFC 138B 报文',
    '原版 Viewer 对我们服务端 0x90（无 15B 尾）的兼容性',
    '服务端多显示器广告（真实两块屏而不是 fake）',
  ]);
});

test('reads a table without outer pipes or alignment colons', () => {
  const answer =
    '下一步可选：\n\n方案 | 风险\n:--- | ---:\n先修协议 | 低\n先做多显示器 | 中';
  assert.deepEqual(extractSuggestedOptions(answer), [
    '先修协议',
    '先做多显示器',
  ]);
});

test('extracts a choice table that ends the answer', () => {
  const answer =
    '接下来可以走的方向：\n\n| 做法 | 代价 |\n| --- | --- |\n| 先修剪贴板 | 小 |\n| 先做多会话槽 | 中 |';
  assert.deepEqual(extractSuggestedOptions(answer), [
    '先修剪贴板',
    '先做多会话槽',
  ]);
});

test('keeps a change table out of the chip row', () => {
  const answer = [
    '改动清单',
    '',
    '| 文件 | 改动 |',
    '| --- | --- |',
    '| client.js | 加表格识别 |',
    '| README.md | 补文档 |',
    '',
    '需要我接着做哪一项？',
  ].join('\n');
  assert.deepEqual(extractSuggestedOptions(answer), []);
});

test('keeps a results table at the end of an answer out of the chip row', () => {
  const answer =
    '测试结果：\n\n| 用例 | 结果 |\n| --- | --- |\n| 剪贴板 | 通过 |\n| 多显示器 | 失败 |';
  assert.deepEqual(extractSuggestedOptions(answer), []);
});

test('needs two table rows to become a chip row', () => {
  const answer =
    '下一步可选：\n\n| 方案 | 风险 |\n| --- | --- |\n| 先修协议 | 低 |';
  assert.deepEqual(extractSuggestedOptions(answer), []);
});

test('never turns the choice question itself into a chip', () => {
  assert.equal(extractAction('要我接着做哪一项？'), '');
  assert.equal(extractAction('需要我做哪一条？'), '');
  assert.equal(extractAction(TABLE_ANSWER), '');
});

// Regression cases taken from a real session: tables that report work done or
// changes must stay prose even when the answer later asks a choice question.
test('keeps an implementation table out of the chip row', () => {
  const answer = [
    '## 实现',
    '',
    '| 模块 | 改动 |',
    '| --- | --- |',
    '| ClipboardSource（新） | 读本地剪贴板 |',
    '| ClientSession | 处理 0x60/0x62 |',
    '',
    '## 一个必须说明的边界',
    '',
    '原版服务端下行剪贴板用哪个消息类型，我们目前没有证据。',
    '',
    '## 还剩的可选项',
    '',
    '聊天、语音、4K 路径。要继续哪个？',
  ].join('\n');
  assert.deepEqual(extractSuggestedOptions(answer), []);
});

test('keeps a fix table out of a lead that only mentions 方向', () => {
  const answer = [
    '之前 `RadminServer_协议命令表.md` 里有几处方向错误，已修：',
    '',
    '| 问题 | 修正 |',
    '| --- | --- |',
    '| `0x80` 放错了表 | 移到 S→C |',
    '| 缺 `0x13` | 新增 |',
  ].join('\n');
  assert.deepEqual(extractSuggestedOptions(answer), []);
});

test('does not read a passing 用哪个 as the closing choice question', () => {
  const answer = [
    '## 记录',
    '',
    '| 项 | 说明 |',
    '| --- | --- |',
    '| 剪贴板 | 补上行 |',
    '| 多会话 | 加槽位 |',
    '',
    '原版用哪个消息类型我们还没有证据。',
  ].join('\n');
  assert.deepEqual(extractSuggestedOptions(answer), []);
});

test('extracts a table under a next-step heading with no question after it', () => {
  const answer = [
    '## 下一步的两个做法',
    '',
    '| 方案 | 好处 |',
    '| --- | --- |',
    '| A. 卡住再填 | 时序可控 |',
    '| B. 直接断 recv 侧 | 不依赖 UI |',
    '',
    '我建议 A 方案；不稳定就退到 B。',
  ].join('\n');
  assert.deepEqual(extractSuggestedOptions(answer), [
    'A. 卡住再填',
    'B. 直接断 recv 侧',
  ]);
});
