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
 * - only while the Session is open, idle and has already had a turn;
 * - hidden while the composer holds a draft, so typing dismisses the row;
 * - once dismissed by typing it stays hidden until the next task settles.
 *
 * Built-in commands live in `BUILTIN` below. Additional commands can be added,
 * renamed, reordered and deleted from the row itself; they are persisted in
 * the browser's localStorage under `STORAGE_KEY`.
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

    /** Longest accepted command text, in characters. */
    const MAX_LENGTH = 40;

    /**
     * Built-in commands: the label shown on the chip is also the exact prompt
     * sent to the Agent. They are fixed and cannot be edited from the UI.
     */
    const BUILTIN = [
      { id: 'submit', text: '提交' },
      { id: 'continue', text: '继续' },
      { id: 'test', text: '测试' },
    ];

    /** UI copy, translated through the Client locale service. */
    const zh = {
      'group.label': '快捷命令',
      'hint.submit': '把「提交」发送给 Agent，执行代码提交',
      'hint.continue': '把「继续」发送给 Agent，继续推进当前任务',
      'hint.test': '把「测试」发送给 Agent，运行测试',
      'hint.custom': '点击把这条自定义命令发送给 Agent',
      'add.label': '添加',
      'add.hint': '手动添加一条快捷命令',
      'add.placeholder': '输入命令文字',
      'add.confirm': '确定',
      'add.cancel': '取消',
      'manage.label': '管理',
      'manage.done': '完成',
      'manage.empty': '还没有自定义命令，返回后点「+ 添加」新增一条。',
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
      'hint.test': 'Send “测试” to the agent to run the tests',
      'hint.custom': 'Send this custom command to the agent',
      'add.label': 'Add',
      'add.hint': 'Add a custom quick command',
      'add.placeholder': 'Command text',
      'add.confirm': 'Add',
      'add.cancel': 'Cancel',
      'manage.label': 'Manage',
      'manage.done': 'Done',
      'manage.empty': 'No custom commands yet. Go back and use “+ Add” to create one.',
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

    /**
     * Read custom commands from localStorage, tolerating missing or corrupt
     * data, duplicates, and entries that collide with built-in commands.
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

      const seenTexts = new Set(BUILTIN.map((command) => command.text));
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

    /** In-memory snapshot so `useSyncExternalStore` gets a stable reference. */
    let cache = null;
    const listeners = new Set();

    /** @returns the shared custom-command list. */
    const getCustom = () => {
      if (cache === null) cache = readStored();
      return cache;
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
     * Whether `text` collides with a built-in command or another custom one.
     *
     * @param text - normalized candidate text.
     * @param excludeId - custom command being edited, ignored in the check.
     */
    const isDuplicate = (text, excludeId) =>
      BUILTIN.some((command) => command.text === text) ||
      getCustom().some(
        (command) => command.id !== excludeId && command.text === text,
      );

    // Keep the row in sync when another tab edits or clears the same list.
    window.addEventListener('storage', (event) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
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
      const idle = props.useSession(
        (state) => state.openState === 'open' && !state.running && !state.blank,
      );
      const custom = React.useSyncExternalStore(subscribe, getCustom, getCustom);

      const [dismissed, setDismissed] = React.useState(false);
      const [adding, setAdding] = React.useState(false);
      const [addText, setAddText] = React.useState('');
      const [managing, setManaging] = React.useState(false);
      const [editingId, setEditingId] = React.useState(null);
      const [editText, setEditText] = React.useState('');
      const wasRunning = React.useRef(running);

      const visible = canAccept && idle && !dismissed;

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

      /**
       * Render one command chip.
       *
       * @param command - `{ id, text }` to display and send.
       * @param isCustom - custom commands get a generic tooltip.
       */
      const renderChip = (command, isCustom) => {
        const hint = isCustom ? t('hint.custom') : t(`hint.${command.id}`);
        return h(
          'button',
          {
            key: command.id,
            type: 'button',
            className: 'dsh-quick-commands__chip',
            title: hint,
            onClick: (event) => {
              event.preventDefault();
              run(command.text);
            },
          },
          chipIcon,
          h('span', null, command.text),
        );
      };

      const renderChipRow = () => {
        const chips = [
          ...BUILTIN.map((command) => renderChip(command, false)),
          ...custom.map((command) => renderChip(command, true)),
        ];

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

        if (custom.length > 0) {
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

      const renderManagerRow = (command, index) => {
        if (command.id === editingId) {
          return h(
            'div',
            { className: 'dsh-quick-commands__row', key: command.id },
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

        return h(
          'div',
          { className: 'dsh-quick-commands__row', key: command.id },
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
          custom.length === 0
            ? h(
                'span',
                { className: 'dsh-quick-commands__empty' },
                t('manage.empty'),
              )
            : custom.map(renderManagerRow),
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
