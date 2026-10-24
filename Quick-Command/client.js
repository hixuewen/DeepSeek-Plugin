/**
 * Quick Commands — one-click prompts above the composer.
 *
 * After a task settles the Session is idle again; this contribution renders a
 * row of command chips in `conversation.input.dock`. Clicking one writes that
 * word into the composer and submits it through the public `InputActions`
 * face, so the message reaches the Agent exactly as if the user had typed it
 * and pressed Enter.
 *
 * Visibility rules:
 * - only while the Session is open, idle and past its first turn: a brand-new
 *   Session has no conversation context yet, so the row stays hidden there;
 * - hidden while the composer holds a draft, so typing dismisses the row;
 * - once dismissed by typing it stays hidden until the next task settles.
 *
 * Built-in commands live in `BUILTIN` below; custom ones are added from the row
 * itself and can be renamed, reordered and deleted in the manage panel. Custom
 * commands are persisted under `STORAGE_KEY`, and the ids of deleted built-ins
 * under `HIDDEN_KEY`.
 *
 * The leading chip is not stored: it is derived from the Agent's latest answer.
 * When that answer ends by asking the user to reply with an exact action — for
 * example "直接说「继续修复编译」即可" or a one-word confirmation such as
 * "你只需要确认一句：「写这个工具」" — the action becomes a suggestion chip
 * in front of every built-in and custom command. A plain statement also counts:
 * when the Agent waits for the user to finish a prerequisite and report back,
 * such as "登录完成后告诉我，我读取 C:\temp\frida 的结果。", the prerequisite
 * becomes a "登录完成" chip; when it offers to do the next step and waits for
 * the word, such as "需要我发版的话说一声。", "发版" becomes the chip. A derived
 * chip that matches an existing command text exactly is dropped. It follows
 * each new answer and disappears when no action can be extracted.
 */
window.__ModuleLoader__.load({
  id: 'dsh-quick-commands',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Dictionary namespace owned by this plugin. */
    const NS = 'quickCommands';

    /** Where custom commands are persisted in the browser. */
    const STORAGE_KEY = 'dsh-quick-commands.custom';

    /** Where the ids of deleted built-in commands are persisted. */
    const HIDDEN_KEY = 'dsh-quick-commands.hidden';

    /** Longest accepted command text, in characters. */
    const MAX_LENGTH = 40;

    /**
     * Built-in commands: the label shown on the chip is also the exact prompt
     * sent to the Agent. Their text is fixed, but they can be deleted from the
     * manage panel; a deleted id is remembered in `HIDDEN_KEY` and stays gone.
     */
    const BUILTIN = [
      { id: 'submit', text: '提交' },
      { id: 'continue', text: '继续' },
      { id: 'confirm', text: '确认' },
    ];

    /** UI copy, translated through the Client locale service. */
    const zh = {
      'group.label': '快捷命令',
      'hint.submit': '把「提交」发送给 Agent，执行代码提交',
      'hint.continue': '把「继续」发送给 Agent，继续推进当前任务',
      'hint.confirm': '把「确认」发送给 Agent，确认当前操作',
      'hint.custom': '点击把这条自定义命令发送给 Agent',
      'hint.suggestion':
        '从 Agent 最后一条回答里提取的下一步动作（它让你回复的短句、提问或等待你完成的事项），点击直接发送',
      'add.label': '添加',
      'add.hint': '手动添加一条快捷命令',
      'add.placeholder': '输入命令文字',
      'add.confirm': '确定',
      'add.cancel': '取消',
      'manage.label': '管理',
      'manage.done': '完成',
      'manage.empty': '还没有快捷命令，返回后点「+ 添加」新增一条。',
      'manage.edit': '编辑',
      'manage.save': '保存',
      'manage.cancel': '取消',
      'manage.delete': '删除',
      'manage.moveUp': '上移',
      'manage.moveDown': '下移',
      'manage.invalid': '命令不能为空，也不能与已有命令重复',
    };
    const en = {
      'group.label': 'Quick commands',
      'hint.submit': 'Send “提交” to the agent to commit the code',
      'hint.continue': 'Send “继续” to the agent to continue the current task',
      'hint.confirm': 'Send “确认” to the agent to confirm the current step',
      'hint.custom': 'Send this custom command to the agent',
      'hint.suggestion':
        'The next action extracted from the agent’s last answer (a short reply it asks for, a question, or something it waits for you to finish). Click to send it',
      'add.label': 'Add',
      'add.hint': 'Add a custom quick command',
      'add.placeholder': 'Command text',
      'add.confirm': 'Add',
      'add.cancel': 'Cancel',
      'manage.label': 'Manage',
      'manage.done': 'Done',
      'manage.empty': 'No quick commands yet. Go back and use “+ Add” to create one.',
      'manage.edit': 'Edit',
      'manage.save': 'Save',
      'manage.cancel': 'Cancel',
      'manage.delete': 'Delete',
      'manage.moveUp': 'Move up',
      'manage.moveDown': 'Move down',
      'manage.invalid': 'The command must be non-empty and not a duplicate',
    };

    /** Chip styling, built only from host theme tokens. */
    const CSS = [
      '.dsh-quick-commands{',
      'box-sizing:border-box;',
      // Match the resident composer card: same clearance, same max width, centered.
      'width:calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance));',
      'max-width:var(--dsh-composer-card-max-width);',
      'margin:0 auto;',
      'display:flex;flex-wrap:wrap;align-items:center;gap:6px;',
      'padding:0 2px;',
      '}',
      '.dsh-quick-commands__chip{',
      'display:inline-flex;align-items:center;gap:5px;box-sizing:border-box;',
      'height:26px;padding:0 10px;margin:0;',
      'font:var(--dsw-font-xs-strong-13,500 13px/18px var(--dsw-font-family,sans-serif));',
      'color:var(--dsw-alias-label-secondary);',
      'background:var(--dsw-alias-bg-layer-1);',
      'border:1px solid var(--dsw-alias-border-l1);',
      'border-radius:999px;',
      'cursor:pointer;white-space:nowrap;user-select:none;',
      'transition:background-color .15s ease,color .15s ease,border-color .15s ease;',
      '}',
      '.dsh-quick-commands__chip:hover{',
      'color:var(--dsw-alias-label-primary);',
      'background:var(--dsw-alias-bg-layer-2);',
      'border-color:var(--dsw-alias-border-l2);',
      '}',
      '.dsh-quick-commands__chip:focus-visible{',
      'outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;',
      '}',
      '.dsh-quick-commands__chip:disabled{opacity:.45;cursor:default;}',
      '.dsh-quick-commands__chip:disabled:hover{',
      'color:var(--dsw-alias-label-secondary);',
      'background:var(--dsw-alias-bg-layer-1);',
      'border-color:var(--dsw-alias-border-l1);',
      '}',
      '.dsh-quick-commands__chip--ghost{background:transparent;border-style:dashed;}',
      '.dsh-quick-commands__chip--ghost:hover{background:var(--dsw-alias-bg-layer-1);}',
      '.dsh-quick-commands__chip--suggestion{',
      'color:var(--dsw-alias-brand-primary);',
      'border-color:var(--dsw-alias-brand-primary);',
      'background:var(--dsw-alias-bg-layer-1);',
      '}',
      '.dsh-quick-commands__chip--suggestion:hover{',
      'color:var(--dsw-alias-brand-primary);',
      'background:var(--dsw-alias-bg-layer-2);',
      'border-color:var(--dsw-alias-brand-primary);',
      '}',
      '.dsh-quick-commands__chip--suggestion .dsh-quick-commands__icon{opacity:1;}',
      '.dsh-quick-commands__icon{display:inline-flex;flex:none;opacity:.85;}',
      '.dsh-quick-commands__editor{display:inline-flex;align-items:center;gap:6px;}',
      '.dsh-quick-commands__input{',
      'box-sizing:border-box;height:26px;width:150px;padding:0 8px;margin:0;',
      'font:var(--dsw-font-xs-strong-13,500 13px/18px var(--dsw-font-family,sans-serif));',
      'color:var(--dsw-alias-label-primary);',
      'background:var(--dsw-alias-bg-layer-1);',
      'border:1px solid var(--dsw-alias-border-l2);border-radius:8px;',
      'outline:none;',
      '}',
      '.dsh-quick-commands__input:focus{border-color:var(--dsw-alias-brand-primary);}',
      '.dsh-quick-commands__input::placeholder{color:var(--dsw-alias-label-secondary);opacity:.7;}',
      '.dsh-quick-commands__panel{',
      'box-sizing:border-box;width:100%;',
      'display:flex;flex-direction:column;gap:4px;',
      'padding:6px 8px;max-height:260px;overflow-y:auto;',
      'background:var(--dsw-alias-bg-layer-1);',
      'border:1px solid var(--dsw-alias-border-l1);border-radius:10px;',
      '}',
      '.dsh-quick-commands__row{display:flex;align-items:center;gap:4px;min-height:26px;}',
      '.dsh-quick-commands__row-text{',
      'flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
      'font:var(--dsw-font-xs-strong-13,500 13px/18px var(--dsw-font-family,sans-serif));',
      'color:var(--dsw-alias-label-primary);',
      '}',
      '.dsh-quick-commands__row .dsh-quick-commands__input{flex:1 1 auto;width:auto;min-width:0;}',
      '.dsh-quick-commands__icon-button{',
      'display:inline-flex;align-items:center;justify-content:center;flex:none;',
      'width:24px;height:24px;padding:0;margin:0;',
      'font:var(--dsw-font-xs-strong-13,500 13px/18px var(--dsw-font-family,sans-serif));',
      'color:var(--dsw-alias-label-secondary);',
      'background:transparent;border:0;border-radius:6px;cursor:pointer;',
      '}',
      '.dsh-quick-commands__icon-button:hover{',
      'color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);',
      '}',
      '.dsh-quick-commands__icon-button:focus-visible{',
      'outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;',
      '}',
      '.dsh-quick-commands__icon-button:disabled{opacity:.35;cursor:default;background:transparent;}',
      '.dsh-quick-commands__empty{',
      'padding:2px 4px;',
      'font:var(--dsw-font-xs-strong-13,500 13px/18px var(--dsw-font-family,sans-serif));',
      'color:var(--dsw-alias-label-secondary);',
      '}',
      '.dsh-quick-commands__panel-footer{display:flex;justify-content:flex-end;align-items:center;gap:6px;}',
    ].join('');

    /**
     * Normalize user input: collapse line breaks, trim, and cap the length.
     *
     * @param value - raw text from an input or from storage.
     * @returns the normalized command text, possibly empty.
     */
    const normalizeText = (value) =>
      String(value ?? '')
        .replace(/\s*\r?\n\s*/g, ' ')
        .trim()
        .slice(0, MAX_LENGTH);

    /** Create a stable id for a custom command. */
    const newId = () =>
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

    /* --- leading suggestion: pure extraction helpers --------------------- */

    /**
     * Quote pairs that may wrap the exact text the Agent asks for. Bold markers
     * are included because Agents often emphasize the reply instead of quoting
     * it with CJK brackets.
     */
    const QUOTE_PAIRS = [
      ['“', '”'],
      ['"', '"'],
      ['「', '」'],
      ['『', '』'],
      ['`', '`'],
      ['**', '**'],
    ];

    /**
     * A directive that introduces the exact reply the user should send.
     *
     * Covers both "说 / 回复 / 确认" with the reply in quotes and the colon form
     * "确认一句：" followed by the reply in plain text; "一句话" and "一下" are
     * treated as the same softener, and punctuation may follow it.
     */
    const DIRECTIVE_BEFORE =
      /(?:^|[，,：:；;]\s*)(?:(?:直接|只需|只需要|只要|请|就|可以|再|然后|接着|麻烦|你|您|我(?:们)?\s*(?:只需要|只需|需要|只要))\s*)*(?:说|回复|回答|答复|回|确认|输入|发送|告诉我|跟我说|叫我|say|reply|answer|type|send|confirm|respond)(?:\s*(?:我|with|me|that|the word))?\s*(?:[：:，,]\s*)?(?:一?句(?:话)?|一下)?\s*(?:[：:，,]\s*)?$/i;

    /** Text after a quoted action that marks it as the reply the Agent wants. */
    const CONFIRM_AFTER =
      /^\s*(?:即可|就行|就可以|就可以了|便可|即开始|就开始|然后继续|then)/i;

    /** Longest unquoted reply accepted after a directive colon, in characters. */
    const COLON_TAIL_LENGTH = 24;

    /** An unquoted reply that is really an open question, not an action. */
    const OPEN_QUESTION =
      /(?:是否|是不是|要不要|能不能|可不可以|怎么样|如何|好不好|吗|呢)/u;

    /** A question frame that introduces a quoted choice. */
    const ASK_BEFORE =
      /(?:是否|要不要|需不需要|是否需要|需要|要我|能否)[^。！？!?\n]{0,24}$/;

    /** Verbs that make a short quoted phrase plausible as the next action. */
    const LOOKS_LIKE_ACTION =
      /^(?:继续|接着|修复|修改|运行|执行|提交|确认|部署|重试|再试|安装|更新|删除|回滚|构建|编译|测试|启动|重启|apply|commit|deploy|fix|run|retry|rebuild|test|continue|proceed|start|install|update|delete|revert|reset)/i;

    /** Whether one sentence is phrased as a question. */
    const isQuestion = (sentence) =>
      /[？?]\s*$/.test(sentence) || /[吗么嘛呢][。！!]?\s*$/.test(sentence);

    /**
     * Find every quoted span in one sentence.
     *
     * @param sentence - single sentence to scan.
     * @returns spans `{ start, end, value }` sorted by position.
     */
    const collectQuotes = (sentence) => {
      const spans = [];
      for (const [open, close] of QUOTE_PAIRS) {
        let from = 0;
        for (;;) {
          const start = sentence.indexOf(open, from);
          if (start < 0) break;
          const end = sentence.indexOf(close, start + open.length);
          if (end < 0) break;
          const value = sentence.slice(start + open.length, end).trim();
          if (value) spans.push({ start, end: end + close.length, value });
          from = end + close.length;
        }
      }
      return spans.sort((left, right) => left.start - right.start);
    };

    /**
     * Turn a raw quoted or captured phrase into an acceptable command.
     *
     * @param raw - candidate action text.
     * @returns the cleaned command, or an empty string when it is unusable.
     */
    const cleanAction = (raw) => {
      const value = String(raw ?? '')
        .replace(/\s*\r?\n\s*/g, ' ')
        .trim()
        .replace(/^[*`"'“”「」『』\s]+/u, '')
        .replace(/[*`"'“”「」『』\s]+$/u, '')
        .replace(/["“”「」『』`]|\*\*/gu, '')
        .replace(/[。.！!；;，,、：:]+$/u, '')
        .replace(/\s+/gu, ' ')
        .trim();

      if (!value || value.length > MAX_LENGTH) return '';
      // An `@` reference names a file or folder, it is not itself a reply:
      // never turn "@Quick-Command/" into a chip.
      if (/^@/u.test(value)) return '';
      if (!/[0-9A-Za-z\u00C0-\u024F\u3400-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/u.test(value)) {
        return '';
      }
      if (/[？?]$/u.test(value)) return '';
      return value;
    };

    /* --- waiting conditions: statements that ask the user to report back -- */

    /** Words that mark the reported prerequisite as finished. */
    const DONE_WORDS =
      '(?:准备好|装好|配好|弄好|做好|装完|配完|弄完|做完|完成|成功|好了|好|就绪|结束|完毕|通过|搞定)';

    /** Ways an Agent asks the user to report that a prerequisite is done. */
    const TELL_TRIGGER =
      /(?:告诉我|跟我说(?:一声|一下|一句)?|跟我说|和我说(?:一声|一下)?|通知我|回我(?:一声|一下)?|叫我(?:一声|一下)?|说一声|吱一声|告知我|喊我|发消息给我|给我发消息)/gu;

    /** Leading social or temporal words stripped from a captured action. */
    const WAIT_PREFIX =
      /^(?:(?:你|您|我们|我|麻烦|请|先|再|都|全部|全都|已经|已|现在|直接|(?:需要|得|要|必须)在|需要|得|要|必须|然后|接着|等|待|等到)\s*)+/u;

    /** One sentence that expects the user to finish a prerequisite first. */
    const ENGLISH_WAIT =
      /(?:let me know|tell me|notify me|ping me|message me)\s+(?:once|when|after|as soon as)\s+(.{1,60}?)(?:[.!?]|$)/iu;

    /** A bare "when this is done" clause with no named action. */
    const PURE_DONE =
      /^(?:都|全部|全都|你|您|我们|我|请|麻烦)?\s*(?:完成|做完|搞定|弄完|结束|完毕|好了|好)(?:之后|以后|后|了)?$/u;

    /**
     * Keep the clause that directly precedes a "tell me" trigger.
     *
     * Trailing politeness such as "，请" is removed before the last comma is
     * used as a cut point, so "如果登录成功了，请告诉我" keeps the condition.
     *
     * @param before - raw text ahead of the trigger.
     * @returns the trimmed prerequisite clause, possibly empty.
     */
    const trimWaitBefore = (before) => {
      let clause = String(before ?? '')
        .replace(/[。;；、，,\s]+$/u, '')
        .trim();
      clause = clause
        .replace(
          /(?:[\s，,]*(?:再|就|然后|才|的话|吧|啦|哈|哦|啊|呢|请|麻烦|你|您|记得|随时|及时))+$/u,
          '',
        )
        .trim();
      if (!clause) return '';
      const cut = Math.max(
        clause.lastIndexOf('，'),
        clause.lastIndexOf(','),
        clause.lastIndexOf('：'),
        clause.lastIndexOf(':'),
        clause.lastIndexOf('；'),
        clause.lastIndexOf(';'),
      );
      if (cut >= 0) {
        const tail = clause.slice(cut + 1).trim();
        if (tail) clause = tail;
      }
      return clause;
    };

    /**
     * Match "X 装好 / X 配好 / X 弄好" and keep the whole verb phrase.
     *
     * Keeps the natural object-verb order of "依赖装好" instead of turning it
     * into "依赖完成".
     *
     * @param clause - trimmed prerequisite clause.
     * @returns the action phrase, or an empty string.
     */
    const matchVerbGood = (clause) => {
      const match = clause.match(
        /^(?:等|待|等到|如果|一旦|当|在)?\s*(?:你|您|麻烦|请)?\s*(.{1,16}?(?:装|配|弄|做|搞|修|改|搭|接|开|关|启|停)(?:好|好了))\s*(?:之后|以后|后|的话)?$/u,
      );
      return match ? match[1] : '';
    };

    /**
     * Match "X 完成 / X 好了 / X 成功" and capture X.
     *
     * @param clause - trimmed prerequisite clause.
     * @returns the action phrase, or an empty string.
     */
    const matchDoneTail = (clause) => {
      const match = clause.match(
        new RegExp(
          `^(?:等|待|等到|如果|一旦|当|在)?\\s*(?:你|您|麻烦|请|先|再|我们|我)?\\s*(.{1,16}?)\\s*${DONE_WORDS}\\s*了?\\s*(?:之后|以后|后|的话)?$`,
          'u',
        ),
      );
      return match ? match[1] : '';
    };

    /**
     * Match "完成 X 后 / 做完 X 后" and capture X.
     *
     * @param clause - trimmed prerequisite clause.
     * @returns the action phrase, or an empty string.
     */
    const matchFinishedVerb = (clause) => {
      const match = clause.match(
        /^(?:等|待|等到|如果|一旦|当|在)?\s*(?:你|您|麻烦|请)?\s*(?:先|再)?\s*(?:完成|做完|搞定)\s*(.{1,16}?)\s*(?:之后|以后|后|的话|了)?$/u,
      );
      return match ? match[1] : '';
    };

    /**
     * Match a bare "X 后 / X 之后" prerequisite and capture X.
     *
     * @param clause - trimmed prerequisite clause.
     * @returns the action phrase, or an empty string.
     */
    const matchAfter = (clause) => {
      const match = clause.match(
        /^(?:等|待|等到|在|如果|一旦|当)?\s*(?:你|您|麻烦|请)?\s*(.{1,16}?)\s*(?:之后|以后|后)$/u,
      );
      return match ? match[1] : '';
    };

    /**
     * Match "需要我 X / 要不要我 X" and capture X.
     *
     * This is the offer form of a waiting statement: the Agent proposes to do
     * something and asks the user to say the word, as in
     * "需要我发版的话说一声。" The captured action is already sendable, so it is
     * not passed through `cleanWaitAction` (which would append 完成).
     *
     * @param clause - trimmed prerequisite clause.
     * @returns the action phrase, or an empty string.
     */
    const matchOffer = (clause) => {
      const text = String(clause ?? '')
        .replace(/[\s，,。；;、]+$/u, '')
        .replace(/(?:的话|的话就)+$/u, '')
        .trim();
      if (!text) return '';
      const match = text.match(
        /^(?:如果|要是|若)?\s*(?:(?:你|您)(?:需要|想|想要|要|希望)|(?:需要|要不要|需不需要|是否(?:需要|要)|可以|能))\s*(?:我|我们)?\s*(?:帮你|帮忙|帮|为|给|替)?\s*(.{1,20}?)\s*(?:吗|么|嘛|呢)?$/u,
      );
      return match ? match[1].trim() : '';
    };

    /**
     * Turn a captured prerequisite into a sendable command.
     *
     * @param raw - action phrase captured from the prerequisite clause.
     * @returns the cleaned command, or an empty string.
     */
    const cleanWaitAction = (raw) => {
      let value = cleanAction(raw);
      if (!value) return '';
      value = value.replace(WAIT_PREFIX, '').trim();
      value = value.replace(/(?:之后|以后|后|的话|了)$/u, '').trim();
      if (!value) return '';
      // "装好依赖" already states completion; everything else gets 完成.
      if (
        /(?:准备好|装好|配好|弄好|做好|装完|配完|弄完|做完|完成|成功|好了|好|就绪|结束|搞定)/u.test(
          value,
        )
      ) {
        return value;
      }
      const command = `${value}完成`;
      return command.length > MAX_LENGTH ? '' : command;
    };

    /**
     * Extract a "report back when done" action from one sentence.
     *
     * @param sentence - trimmed sentence to inspect.
     * @returns the command, or an empty string when no waiting ask is found.
     */
    const waitActionOfSentence = (sentence) => {
      const text = String(sentence ?? '').trim();
      if (!text) return '';

      const english = text.match(ENGLISH_WAIT);
      if (english && /log(?:ged)?\s*in|sign(?:ed)?\s*in|login/i.test(english[1])) {
        return 'Logged in';
      }

      let best = '';
      for (const trigger of text.matchAll(TELL_TRIGGER)) {
        const before = trimWaitBefore(text.slice(0, trigger.index));
        if (!before) continue;
        if (
          PURE_DONE.test(before) ||
          PURE_DONE.test(before.replace(/^(?:如果|一旦|当)/u, '').trim())
        ) {
          best = '完成';
          continue;
        }
        // "需要我发版的话说一声" is an offer: the captured phrase is the reply.
        const offer = matchOffer(before);
        if (offer) {
          const cleaned = cleanAction(offer);
          if (cleaned) best = cleaned;
          continue;
        }
        const action =
          matchVerbGood(before) ||
          matchDoneTail(before) ||
          matchFinishedVerb(before) ||
          matchAfter(before);
        if (!action) continue;
        const cleaned = cleanWaitAction(action);
        if (cleaned) best = cleaned;
      }
      return best;
    };

    /**
     * Extract a waiting condition from an Agent answer, scanning from the end.
     *
     * Statement forms such as "登录完成后告诉我，我读取 C:\temp\frida 的结果。"
     * carry no question mark but still imply the next user action.
     *
     * @param text - the latest assistant prose.
     * @returns the command, or an empty string when none is found.
     */
    const extractWaitingAction = (text) => {
      const source = String(text ?? '');
      if (!source) return '';
      const sentences = source.match(/[^。！？!?；;\n]+[。！？!?；;]?/gu) || [];
      for (let index = sentences.length - 1; index >= 0; index -= 1) {
        const action = waitActionOfSentence(sentences[index]);
        if (action) return action;
      }
      return '';
    };

    /**
     * Extract an action from one sentence: an explicitly quoted reply first,
     * then a colon-introduced reply, then a short Chinese or English question.
     *
     * @param sentence - trimmed sentence to inspect.
     * @param question - whether the sentence is phrased as a question.
     * @returns the extracted command, or an empty string.
     */
    const extractFromSentence = (sentence, question) => {
      let best = '';
      for (const span of collectQuotes(sentence)) {
        const before = sentence.slice(0, span.start);
        const after = sentence.slice(span.end, span.end + 12);
        const directed = DIRECTIVE_BEFORE.test(before);
        const confirmed = CONFIRM_AFTER.test(after);
        const asked =
          question && !directed && !confirmed && ASK_BEFORE.test(before);
        if (!directed && !confirmed && !asked) continue;
        const action = cleanAction(span.value);
        if (!action) continue;
        if (asked && !LOOKS_LIKE_ACTION.test(action)) continue;
        best = action;
      }
      if (best) return best;

      // A directive may also end at a colon and spell the reply out unquoted,
      // as in "你只需要确认一句：写这个工具" or "...：写这个工具，我就开始实现".
      const colon = Math.max(
        sentence.lastIndexOf('：'),
        sentence.lastIndexOf(':'),
      );
      if (colon > 0) {
        const head = sentence.slice(0, colon + 1);
        const tail = sentence
          .slice(colon + 1)
          .split(/[，,。；;！!？?\n]/u)[0]
          .trim();
        if (
          tail &&
          tail.length <= COLON_TAIL_LENGTH &&
          !OPEN_QUESTION.test(tail) &&
          DIRECTIVE_BEFORE.test(head)
        ) {
          const action = cleanAction(tail);
          if (action) return action;
        }
      }

      const bare = sentence
        .trim()
        .match(
          /^(?:(?:可以|请|直接|你|您|麻烦)\s*)*(?:回复|回答|输入|发送)[：:]\s*([^\n]{1,40})$/u,
        );
      if (bare) {
        const action = cleanAction(bare[1]);
        if (action) return action;
      }

      const bareEnglish = sentence
        .trim()
        .match(/^(?:please\s+)?(?:reply|answer|type|send)\s*[:：]\s*(.{1,40})$/iu);
      if (bareEnglish) {
        const action = cleanAction(bareEnglish[1]);
        if (action) return action;
      }

      if (!question) return '';

      const chinese = sentence
        .trim()
        .match(
          /^(?:请问[，,]?)?(?:是否(?:要)?|需不需要|需要|要不要|要)(?:我|我们)?(.{1,40}?)(?:吗|么|嘛|呢)?[？?]?$/u,
        );
      if (chinese) {
        const action = cleanAction(chinese[1]);
        if (action) return action;
      }

      const trimmed = sentence.trim();
      if (/^(?:继续|接着|往下)(?:吗|么|嘛|呢)?[？?]?$/u.test(trimmed)) {
        return '继续';
      }
      if (/^(?:确认|可以|行|好|没问题)(?:吗|么|嘛|呢)?[？?]?$/u.test(trimmed)) {
        return trimmed.replace(/[吗么嘛呢？?。！!]+$/u, '').trim();
      }

      const english = trimmed.match(
        /^(?:should|shall|do you want me to|would you like me to|may i|can i)\s+(?:(?:i|we)\s+)?(.{1,40}?)[？?]?$/iu,
      );
      if (english) {
        const action = cleanAction(english[1]);
        if (action) return action.charAt(0).toUpperCase() + action.slice(1);
      }
      return '';
    };

    /**
     * Extract the action requested by the final ask in an Agent answer: a
     * quoted reply, a question, or a "report back when this is done" statement.
     * Sentences are scanned from the end so the last ask wins.
     *
     * @param text - the latest assistant prose.
     * @returns the cleanup command, or an empty string when none is found.
     */
    const extractAction = (text) => {
      const source = String(text ?? '').replace(
        /([.!?])\s+(?=[A-Z])/gu,
        '$1\n',
      );
      if (!source) return '';
      const sentences = source.match(/[^。！？!?；;\n]+[。！？!?；;]?/gu) || [];
      for (let index = sentences.length - 1; index >= 0; index -= 1) {
        const sentence = sentences[index].trim();
        if (!sentence) continue;
        const action = extractFromSentence(sentence, isQuestion(sentence));
        if (action) return action;
      }
      // No quoted reply or question: fall back to a statement that asks the
      // user to finish a prerequisite and report back.
      return extractWaitingAction(source);
    };

    /**
     * Join the prose blocks of one finalized assistant message.
     *
     * @param node - a Conversation node from the Chat snapshot.
     * @returns its text blocks joined by newlines, or an empty string.
     */
    const assistantTextOf = (node) => {
      if (!node || node.kind !== 'assistant' || !Array.isArray(node.blocks)) {
        return '';
      }
      let text = '';
      for (const block of node.blocks) {
        if (
          block &&
          block.kind === 'text' &&
          typeof block.text === 'string' &&
          block.text.trim()
        ) {
          text += (text ? '\n' : '') + block.text;
        }
      }
      return text;
    };

    /**
     * The prose of the latest assistant message that carries text.
     *
     * @param nodes - Conversation nodes loaded for the current Session.
     * @returns the latest assistant prose, or an empty string.
     */
    const latestAssistantText = (nodes) => {
      if (!Array.isArray(nodes)) return '';
      for (let index = nodes.length - 1; index >= 0; index -= 1) {
        const text = assistantTextOf(nodes[index]);
        if (text) return text;
      }
      return '';
    };

    /* --- end leading suggestion helpers --------------------------------- */

    /**
     * Read the ids of deleted built-in commands from localStorage, keeping only
     * ids that still name a known built-in.
     *
     * @returns a fresh array of built-in ids, empty when nothing valid.
     */
    const readHidden = () => {
      let parsed;
      try {
        const raw = window.localStorage.getItem(HIDDEN_KEY);
        if (!raw) return [];
        parsed = JSON.parse(raw);
      } catch {
        return [];
      }
      if (!Array.isArray(parsed)) return [];

      const known = new Set(BUILTIN.map((command) => command.id));
      const result = [];
      for (const id of parsed) {
        if (typeof id !== 'string' || !known.has(id) || result.includes(id)) {
          continue;
        }
        result.push(id);
      }
      return result;
    };

    /**
     * Read custom commands from localStorage, tolerating missing or corrupt
     * data, duplicates, and entries that collide with visible built-ins.
     *
     * @returns a fresh array of `{ id, text }`, empty when nothing valid.
     */
    const readStored = () => {
      let parsed;
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        parsed = JSON.parse(raw);
      } catch {
        return [];
      }
      if (!Array.isArray(parsed)) return [];

      const seenTexts = new Set(
        getVisibleBuiltin().map((command) => command.text),
      );
      const seenIds = new Set();
      const result = [];
      for (const entry of parsed) {
        const text = normalizeText(
          typeof entry === 'string' ? entry : entry && entry.text,
        );
        if (!text || seenTexts.has(text)) continue;
        seenTexts.add(text);
        const id =
          entry &&
          typeof entry.id === 'string' &&
          entry.id !== '' &&
          !seenIds.has(entry.id)
            ? entry.id
            : newId();
        seenIds.add(id);
        result.push({ id, text });
      }
      return result;
    };

    /**
     * In-memory snapshots so `useSyncExternalStore` gets stable references:
     * the custom list, the deleted built-in ids, and the built-ins still shown.
     */
    let cache = null;
    let hiddenCache = null;
    let visibleBuiltinCache = null;
    const listeners = new Set();

    /** @returns the shared custom-command list. */
    const getCustom = () => {
      if (cache === null) cache = readStored();
      return cache;
    };

    /** @returns the ids of built-in commands the user deleted. */
    const getHidden = () => {
      if (hiddenCache === null) hiddenCache = readHidden();
      return hiddenCache;
    };

    /** @returns the built-in commands that have not been deleted. */
    const getVisibleBuiltin = () => {
      if (visibleBuiltinCache === null) {
        const hidden = new Set(getHidden());
        visibleBuiltinCache = BUILTIN.filter(
          (command) => !hidden.has(command.id),
        );
      }
      return visibleBuiltinCache;
    };

    const notify = () => {
      listeners.forEach((listener) => listener());
    };

    /**
     * Replace the custom-command list, persist it, and notify every mounted
     * row. Storage failures keep the session copy alive.
     *
     * @param next - the next `{ id, text }[]`.
     */
    const setCustom = (next) => {
      cache = next;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Private mode or a full quota: keep working for this session.
      }
      notify();
    };

    /**
     * Delete a built-in command for good.
     *
     * @param id - built-in id to hide.
     */
    const deleteBuiltin = (id) => {
      if (!BUILTIN.some((command) => command.id === id)) return;
      const hidden = getHidden();
      if (hidden.includes(id)) return;
      hiddenCache = [...hidden, id];
      visibleBuiltinCache = null;
      try {
        window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(hiddenCache));
      } catch {
        // Private mode or a full quota: keep working for this session.
      }
      notify();
    };

    /**
     * Subscribe to custom-command changes.
     *
     * @param listener - called after each change.
     * @returns an unsubscribe function.
     */
    const subscribe = (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    };

    /**
     * Whether `text` collides with a visible command or another custom one.
     *
     * @param text - normalized candidate text.
     * @param excludeId - custom command being edited, ignored in the check.
     */
    const isDuplicate = (text, excludeId) =>
      getVisibleBuiltin().some((command) => command.text === text) ||
      getCustom().some(
        (command) => command.id !== excludeId && command.text === text,
      );

    // Keep the row in sync when another tab edits or clears the same list.
    window.addEventListener('storage', (event) => {
      if (
        event.key !== STORAGE_KEY &&
        event.key !== HIDDEN_KEY &&
        event.key !== null
      ) {
        return;
      }
      hiddenCache = readHidden();
      visibleBuiltinCache = null;
      cache = readStored();
      notify();
    });

    /**
     * The quick-command row for one Session.
     *
     * @param props - Session-scope slot props: stable `inputActions`, the
     * `useInput` / `useSession` selector hooks, and the bound `t`.
     * @returns the chip row, the management panel, or null while hidden.
     */
    function QuickCommands(props) {
      const { inputActions, t } = props;
      const canAccept = props.useInput(
        (state) => state.phase === 'plain' && state.draft.trim() === '',
      );
      const running = props.useSession((state) => state.running);
      // A brand-new Session has no conversation context yet: a one-word reply
      // has nothing to act on, so the row waits for the idle state that follows
      // a first turn. `blank` is the host's New Session marker.
      const idle = props.useSession(
        (state) =>
          state.openState === 'open' && !state.running && !state.blank,
      );
      const custom = React.useSyncExternalStore(subscribe, getCustom, getCustom);
      const builtin = React.useSyncExternalStore(
        subscribe,
        getVisibleBuiltin,
        getVisibleBuiltin,
      );
      const lastAnswer = props.useChat((state) =>
        latestAssistantText(state.legacy.nodes),
      );

      const [dismissed, setDismissed] = React.useState(false);
      const [adding, setAdding] = React.useState(false);
      const [addText, setAddText] = React.useState('');
      const [managing, setManaging] = React.useState(false);
      const [editingId, setEditingId] = React.useState(null);
      const [editText, setEditText] = React.useState('');
      const wasRunning = React.useRef(running);

      const visible = canAccept && idle && !dismissed;

      // The leading chip is derived, never stored: the latest answer's final
      // question decides it, and it is hidden when it duplicates a command.
      const suggestion = React.useMemo(() => {
        if (!visible) return '';
        const action = extractAction(lastAnswer);
        return action && !isDuplicate(action) ? action : '';
      }, [visible, lastAnswer, builtin, custom]);

      // Typing (or any programmatic draft) dismisses the row immediately.
      React.useEffect(() => {
        if (!canAccept) setDismissed(true);
      }, [canAccept]);

      // A task settling brings the row back, unless a draft still blocks it.
      React.useEffect(() => {
        if (wasRunning.current && !running) setDismissed(false);
        wasRunning.current = running;
      }, [running]);

      // Never keep the editor open across a hide/show cycle.
      React.useEffect(() => {
        if (visible) return;
        setAdding(false);
        setAddText('');
        setManaging(false);
        setEditingId(null);
        setEditText('');
      }, [visible]);

      if (!visible) return null;

      /**
       * Write one command into the composer and submit it.
       *
       * `setDraft` updates the editor synchronously; deferring `submit` by one
       * macrotask guarantees the input state has published the new draft
       * before the submit machine reads it.
       *
       * @param text - exact prompt to send to the Agent.
       */
      const run = (text) => {
        inputActions.setDraft(text);
        window.setTimeout(() => inputActions.submit(), 0);
      };

      const addCandidate = normalizeText(addText);
      const addInvalid = addCandidate === '' || isDuplicate(addCandidate);
      const editCandidate = normalizeText(editText);
      const editInvalid =
        editingId === null ||
        editCandidate === '' ||
        isDuplicate(editCandidate, editingId);

      /** Append the typed command at the end of the custom list. */
      const commitAdd = () => {
        if (addInvalid) return;
        setCustom([...getCustom(), { id: newId(), text: addCandidate }]);
        setAddText('');
        setAdding(false);
      };

      const cancelAdd = () => {
        setAdding(false);
        setAddText('');
      };

      const beginEdit = (command) => {
        setEditingId(command.id);
        setEditText(command.text);
      };

      const cancelEdit = () => {
        setEditingId(null);
        setEditText('');
      };

      /** Rename the command being edited, keeping its position and id. */
      const commitEdit = () => {
        if (editInvalid) return;
        setCustom(
          getCustom().map((command) =>
            command.id === editingId
              ? { ...command, text: editCandidate }
              : command,
          ),
        );
        cancelEdit();
      };

      const removeCommand = (id) => {
        setCustom(getCustom().filter((command) => command.id !== id));
        if (editingId === id) cancelEdit();
      };

      /**
       * Move a custom command by `delta` positions.
       *
       * @param id - command to move.
       * @param delta - -1 for up, 1 for down.
       */
      const moveCommand = (id, delta) => {
        const list = getCustom().slice();
        const index = list.findIndex((command) => command.id === id);
        const target = index + delta;
        if (index < 0 || target < 0 || target >= list.length) return;
        const [moved] = list.splice(index, 1);
        list.splice(target, 0, moved);
        setCustom(list);
      };

      /** The small lightning-bolt glyph shared by every command chip. */
      const chipIcon = h(
        'span',
        { className: 'dsh-quick-commands__icon', 'aria-hidden': true },
        h(
          'svg',
          {
            width: 12,
            height: 12,
            viewBox: '0 0 16 16',
            fill: 'none',
            xmlns: 'http://www.w3.org/2000/svg',
          },
          h('path', {
            d: 'M9.4 1.4 3.7 8.8h3.2l-.7 5.8 6-7.8H8.9l.5-5.4Z',
            fill: 'currentColor',
          }),
        ),
      );

      /** An arrow that marks the derived next-step suggestion. */
      const suggestionIcon = h(
        'span',
        { className: 'dsh-quick-commands__icon', 'aria-hidden': true },
        h(
          'svg',
          {
            width: 12,
            height: 12,
            viewBox: '0 0 16 16',
            fill: 'none',
            xmlns: 'http://www.w3.org/2000/svg',
          },
          h('path', {
            d: 'M2.5 8h9.5M8.5 4.5 12 8l-3.5 3.5',
            stroke: 'currentColor',
            strokeWidth: 1.6,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          }),
        ),
      );

      /**
       * Render one command chip.
       *
       * @param command - `{ id, text }` to display and send.
       * @param kind - `builtin`, `custom`, or the derived `suggestion`.
       */
      const renderChip = (command, kind) => {
        const hint =
          kind === 'suggestion'
            ? t('hint.suggestion')
            : kind === 'custom'
              ? t('hint.custom')
              : t(`hint.${command.id}`);
        return h(
          'button',
          {
            key: `${kind === 'builtin' ? 'b' : kind === 'custom' ? 'c' : 's'}:${command.id}`,
            type: 'button',
            className:
              kind === 'suggestion'
                ? 'dsh-quick-commands__chip dsh-quick-commands__chip--suggestion'
                : 'dsh-quick-commands__chip',
            title: hint,
            onClick: (event) => {
              event.preventDefault();
              run(command.text);
            },
          },
          kind === 'suggestion' ? suggestionIcon : chipIcon,
          h('span', null, command.text),
        );
      };

      const renderChipRow = () => {
        const chips = [];
        if (suggestion) {
          chips.push(renderChip({ id: 'next', text: suggestion }, 'suggestion'));
        }
        chips.push(
          ...builtin.map((command) => renderChip(command, 'builtin')),
          ...custom.map((command) => renderChip(command, 'custom')),
        );

        if (adding) {
          chips.push(
            h(
              'span',
              { key: 'add-editor', className: 'dsh-quick-commands__editor' },
              h('input', {
                className: 'dsh-quick-commands__input',
                value: addText,
                maxLength: MAX_LENGTH,
                autoFocus: true,
                placeholder: t('add.placeholder'),
                'aria-label': t('add.placeholder'),
                onChange: (event) => setAddText(event.target.value),
                onKeyDown: (event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitAdd();
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelAdd();
                  }
                },
              }),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-quick-commands__chip',
                  title: addInvalid ? t('manage.invalid') : t('add.confirm'),
                  'aria-label': t('add.confirm'),
                  disabled: addInvalid,
                  onClick: commitAdd,
                },
                t('add.confirm'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className:
                    'dsh-quick-commands__chip dsh-quick-commands__chip--ghost',
                  'aria-label': t('add.cancel'),
                  onClick: cancelAdd,
                },
                t('add.cancel'),
              ),
            ),
          );
        } else {
          chips.push(
            h(
              'button',
              {
                key: 'add',
                type: 'button',
                className:
                  'dsh-quick-commands__chip dsh-quick-commands__chip--ghost',
                title: t('add.hint'),
                'aria-label': t('add.hint'),
                onClick: (event) => {
                  event.preventDefault();
                  setAdding(true);
                  setAddText('');
                },
              },
              h('span', { 'aria-hidden': true }, '+'),
              h('span', null, t('add.label')),
            ),
          );
        }

        if (builtin.length + custom.length > 0) {
          chips.push(
            h(
              'button',
              {
                key: 'manage',
                type: 'button',
                className:
                  'dsh-quick-commands__chip dsh-quick-commands__chip--ghost',
                title: t('manage.label'),
                'aria-label': t('manage.label'),
                onClick: (event) => {
                  event.preventDefault();
                  setManaging(true);
                  setEditingId(null);
                },
              },
              t('manage.label'),
            ),
          );
        }

        return chips;
      };

      /** One small icon button used by every manage row. */
      const iconButton = (label, glyph, onClick, disabled) =>
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-quick-commands__icon-button',
            title: label,
            'aria-label': label,
            disabled,
            onClick,
          },
          glyph,
        );

      /** A built-in row keeps its fixed text and offers deletion only. */
      const renderBuiltinRow = (command) =>
        h(
          'div',
          { className: 'dsh-quick-commands__row', key: `b:${command.id}` },
          h(
            'span',
            { className: 'dsh-quick-commands__row-text', title: command.text },
            command.text,
          ),
          iconButton(
            t('manage.delete'),
            '×',
            () => deleteBuiltin(command.id),
            false,
          ),
        );

      const renderManagerRow = (command, index) => {
        if (command.id === editingId) {
          return h(
            'div',
            { className: 'dsh-quick-commands__row', key: `c:${command.id}` },
            h('input', {
              className: 'dsh-quick-commands__input',
              value: editText,
              maxLength: MAX_LENGTH,
              autoFocus: true,
              'aria-label': t('manage.edit'),
              onChange: (event) => setEditText(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitEdit();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelEdit();
                }
              },
            }),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-quick-commands__icon-button',
                title: editInvalid ? t('manage.invalid') : t('manage.save'),
                'aria-label': t('manage.save'),
                disabled: editInvalid,
                onClick: commitEdit,
              },
              '✓',
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-quick-commands__icon-button',
                title: t('manage.cancel'),
                'aria-label': t('manage.cancel'),
                onClick: cancelEdit,
              },
              '×',
            ),
          );
        }

        return h(
          'div',
          { className: 'dsh-quick-commands__row', key: `c:${command.id}` },
          h(
            'span',
            { className: 'dsh-quick-commands__row-text', title: command.text },
            command.text,
          ),
          iconButton(t('manage.edit'), '✎', () => beginEdit(command), false),
          iconButton(
            t('manage.moveUp'),
            '↑',
            () => moveCommand(command.id, -1),
            index === 0,
          ),
          iconButton(
            t('manage.moveDown'),
            '↓',
            () => moveCommand(command.id, 1),
            index === custom.length - 1,
          ),
          iconButton(
            t('manage.delete'),
            '×',
            () => removeCommand(command.id),
            false,
          ),
        );
      };

      const renderManager = () =>
        h(
          'div',
          {
            className: 'dsh-quick-commands__panel',
            role: 'group',
            'aria-label': t('manage.label'),
          },
          builtin.length + custom.length === 0
            ? h(
                'span',
                { className: 'dsh-quick-commands__empty' },
                t('manage.empty'),
              )
            : [builtin.map(renderBuiltinRow), custom.map(renderManagerRow)],
          h(
            'div',
            { className: 'dsh-quick-commands__panel-footer' },
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-quick-commands__chip',
                onClick: () => {
                  setManaging(false);
                  cancelEdit();
                },
              },
              t('manage.done'),
            ),
          ),
        );

      return h(
        React.Fragment,
        null,
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h(
          'div',
          {
            className: 'dsh-quick-commands',
            role: 'group',
            'aria-label': t('group.label'),
          },
          managing ? renderManager() : renderChipRow(),
        ),
      );
    }

    return {
      inject: ['slots', 'locale'],
      /**
       * Register the dictionary and the composer-dock contribution.
       *
       * @param ctx - Client root context.
       */
      apply(ctx) {
        ctx.effect(
          () => ctx.locale.register(NS, { zh, en }),
          'quick-commands: dictionaries',
        );
        ctx.slots.inject('conversation.input.dock', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.dock',
              id: 'quick-commands',
              order: 5,
              locale: NS,
            },
            QuickCommands,
          ),
        );
      },
    };
  },
});
