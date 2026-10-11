/**
 * Context Quote — quote selected conversation text into the composer.
 *
 * Two slot contributions cooperate:
 *
 * - `conversation.input.overlay` (Session scope) mounts an invisible bridge that
 *   publishes this Session's stable `inputActions` face. That slot is the only
 *   sanctioned seat that hands a plugin the composer's public action face.
 * - `shell.overlay` (root scope, the frame-wide floating layer) mounts the
 *   visible `引用` action, which follows the current selection anywhere in the
 *   conversation.
 *
 * Draft text is written with `captureInsertion()` + `insertText()`: the composer
 * keeps its existing content (including `@` reference chips) and the quote lands
 * at the caret. `/`-adjudication, submission locking, and chip bookkeeping stay
 * owned by the composer. Keyboard focus then returns to the composer through the
 * Session input facade (`conversation.input.for(binding.ctx).focus()`), so the
 * caret sits right after the quote and the reply can be typed immediately.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-context-quote',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Dictionary namespace owned by this plugin. */
    const NS = 'contextQuote';
    /** Composer-adjacent button copy. */
    const zh = {
      'action.quote': '引用',
      'action.quoteHint': '将选中的内容引用到输入框',
    };
    const en = {
      'action.quote': 'Quote',
      'action.quoteHint': 'Quote the selected text into the composer',
    };

    /** Selection action chrome, built only from host theme tokens. */
    const CSS = [
      '.dsh-context-quote__button{',
      'display:inline-flex;align-items:center;gap:4px;box-sizing:border-box;',
      'height:26px;padding:0 9px;',
      'font:var(--dsw-font-xs-strong-13,500 13px/18px var(--dsw-font-family,sans-serif));',
      'color:var(--dsw-alias-label-primary);',
      'background:var(--dsw-alias-bg-overlay);',
      'border:1px solid var(--dsw-alias-border-l2);',
      'border-radius:var(--dsw-radius-md,8px);',
      'box-shadow:var(--dsw-elevation-panel,0 4px 12px rgba(0,0,0,.14));',
      'cursor:pointer;white-space:nowrap;',
      '}',
      '.dsh-context-quote__button:hover{background:var(--dsw-alias-bg-layer-2);}',
      '.dsh-context-quote__button:focus-visible{',
      'outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;',
      '}',
      '.dsh-context-quote__icon{display:inline-flex;flex:none;}',
    ].join('');

    /* ------------------------------------------------------------------ *
     * Session bridge store
     *
     * The floating action lives in a root-scope slot, which receives no
     * composer action face. The Session-scope bridge publishes one, and the
     * action reads it lazily so the draft never re-renders the floating UI.
     * ------------------------------------------------------------------ */

    /** Latest published bridge, or null while no Session composer is mounted. */
    let bridge = null;
    /** Render callbacks waiting for a bridge change. */
    const bridgeListeners = new Set();

    /**
     * Replace the published bridge and wake its readers.
     * @param next - the new bridge face, or null when the composer unmounts.
     */
    function publishBridge(next) {
      bridge = next;
      for (const listener of Array.from(bridgeListeners)) listener();
    }

    /**
     * Subscribe a component to the published bridge.
     * @returns the current bridge, or null while no Session is active.
     */
    function useBridge() {
      const [, bump] = React.useReducer((count) => count + 1, 0);
      React.useEffect(() => {
        bridgeListeners.add(bump);
        return () => {
          bridgeListeners.delete(bump);
        };
      }, []);
      return bridge;
    }

    /**
     * Normalize one selection into the Markdown quote block that enters the composer.
     * @param raw - the browser selection text.
     * @param hasDraft - whether the composer already holds content.
     * @returns the block to insert, divider first when the draft is not empty.
     */
    function buildQuote(raw, hasDraft) {
      const lines = String(raw).replace(/\r\n?/g, '\n').split('\n');
      while (lines.length > 0 && lines[0].trim() === '') lines.shift();
      while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
      const body = lines
        .map((line) => {
          const trimmed = line.replace(/\s+$/, '');
          return trimmed === '' ? '>' : `> ${trimmed}`;
        })
        .join('\n');
      const separator = hasDraft ? '\n\n---\n\n' : '';
      return `${separator}${body}\n\n`;
    }

    /**
     * Resolve the floating anchor for one selection: the end of its last line,
     * kept inside the viewport and flipped below when the top edge is crowded.
     * @param range - the live selection range.
     * @returns the anchor point, or null when the range occupies no space.
     */
    function anchorOf(range) {
      const rects = range.getClientRects();
      const rect = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();
      if (rect === undefined || rect === null) return null;
      if (rect.width === 0 && rect.height === 0) return null;
      const halfWidth = 44;
      const x = Math.min(
        Math.max(rect.left + rect.width / 2, halfWidth + 8),
        Math.max(halfWidth + 8, window.innerWidth - halfWidth - 8),
      );
      const above = rect.top >= 48;
      return { x, y: above ? rect.top - 8 : rect.bottom + 8, below: !above };
    }

    /**
     * Hand the keyboard back to one Session's composer, keeping the caret the
     * editor last held (the end of the quote just inserted).
     *
     * Resolved through the Session binding rather than the DOM: focusing the
     * contenteditable directly would drop the caret at the start of the draft.
     * @param rootCtx - the plugin's client root context.
     * @param sessionId - Session whose composer should take focus.
     * @returns whether a retained Session composer accepted focus.
     */
    function focusComposer(rootCtx, sessionId) {
      const sessions = rootCtx.get('sessions');
      if (sessions === undefined) return false;
      const binding = sessions.binding(sessionId);
      if (binding === undefined) return false;
      try {
        const conversation = binding.ctx.get('conversation');
        if (conversation === undefined) return false;
        conversation.input.for(binding.ctx).focus();
        return true;
      } catch {
        // A pending submission or a disposed Session generation refuses the
        // focus; the quote is already in the draft, so this stays silent.
        return false;
      }
    }

    /**
     * Build the invisible Session-scope bridge for one plugin instance:
     * republishes the composer action face for the current Session and exposes
     * the live draft without re-rendering.
     * @param rootCtx - the plugin's client root context.
     * @returns the bridge component.
     */
    function createQuoteBridge(rootCtx) {
      return function QuoteBridge(props) {
        const { inputActions, sessionId, useInput } = props;
        const draft = useInput((state) => state.draft);
        const draftRef = React.useRef(draft);
        draftRef.current = draft;
        React.useEffect(() => {
          publishBridge({
            sessionId,
            readDraft: () => draftRef.current,
            focusComposer: () => focusComposer(rootCtx, sessionId),
            insert(block) {
              // `insertText` is revision-guarded: a draft edit between capture and
              // insert refuses the write, so recapture a few times before giving up.
              for (let attempt = 0; attempt < 3; attempt += 1) {
                const span = inputActions.captureInsertion();
                if (inputActions.insertText(block, span)) return true;
              }
              return false;
            },
          });
          return () => {
            publishBridge(null);
          };
        }, [inputActions, sessionId]);
        return null;
      };
    }

    /**
     * The floating `引用` action: appears beside a non-empty selection inside the
     * conversation transcript and writes the quote into the composer draft.
     * @param props - locale seat (`t`) for the visible label.
     * @returns the action while a quotable selection exists; null otherwise.
     */
    function QuoteAction(props) {
      const { t } = props;
      const current = useBridge();
      const [quote, setQuote] = React.useState(null);
      const [anchor, setAnchor] = React.useState(null);

      React.useEffect(() => {
        let frame = 0;

        /** Drop the action; the next live selection brings it back. */
        const clear = () => {
          setQuote(null);
          setAnchor(null);
        };

        /** Re-read the live selection and reposition the action. */
        const update = () => {
          const selection = window.getSelection();
          if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) {
            clear();
            return;
          }
          const text = selection.toString();
          if (text === '' || text.trim() === '') {
            clear();
            return;
          }
          const node = selection.anchorNode;
          const element =
            node === null ? null : node.nodeType === 1 ? node : node.parentElement;
          // Only the transcript quotes: the composer, its editor, and any other
          // editable or non-conversation surface keep their own selection behavior.
          if (element === null || element.closest('[data-conversation-scroll]') === null) {
            clear();
            return;
          }
          if (element.closest('[data-composer-card]') !== null) {
            clear();
            return;
          }
          if (element.closest('input, textarea, [contenteditable="true"]') !== null) {
            clear();
            return;
          }
          try {
            const range = selection.getRangeAt(0);
            const point = anchorOf(range);
            if (point === null) {
              clear();
              return;
            }
            setQuote(text);
            setAnchor(point);
          } catch {
            clear();
          }
        };

        /** Coalesce selection/scroll/resize bursts into one frame. */
        const schedule = () => {
          if (frame !== 0) return;
          frame = window.requestAnimationFrame(() => {
            frame = 0;
            update();
          });
        };

        document.addEventListener('selectionchange', schedule);
        window.addEventListener('scroll', schedule, true);
        window.addEventListener('resize', schedule);
        return () => {
          if (frame !== 0) window.cancelAnimationFrame(frame);
          document.removeEventListener('selectionchange', schedule);
          window.removeEventListener('scroll', schedule, true);
          window.removeEventListener('resize', schedule);
        };
      }, []);

      if (current === null || quote === null || anchor === null) return null;

      return h(
        React.Fragment,
        null,
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h(
          'div',
          {
            className: 'dsh-context-quote',
            style: {
              position: 'fixed',
              left: `${anchor.x}px`,
              top: `${anchor.y}px`,
              transform: anchor.below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
              zIndex: 30,
            },
          },
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-context-quote__button',
              title: t('action.quoteHint'),
              'aria-label': t('action.quoteHint'),
              // Keep the browser selection alive: without this the mousedown
              // collapses it before `click` reads the text.
              onMouseDown: (event) => {
                event.preventDefault();
                event.stopPropagation();
              },
              onClick: (event) => {
                event.preventDefault();
                const draft = current.readDraft() ?? '';
                current.insert(buildQuote(quote, draft.trim() !== ''));
                // Drop the transcript highlight before focusing, so the composer
                // restores its own caret last and it stays visible.
                const selection = window.getSelection();
                if (selection !== null) selection.removeAllRanges();
                setQuote(null);
                setAnchor(null);
                current.focusComposer();
              },
            },
            h(
              'span',
              { className: 'dsh-context-quote__icon', 'aria-hidden': true },
              h(
                'svg',
                {
                  width: 14,
                  height: 14,
                  viewBox: '0 0 14 14',
                  fill: 'none',
                  xmlns: 'http://www.w3.org/2000/svg',
                },
                h('path', {
                  d: 'M2.6 2.2v9.6',
                  stroke: 'currentColor',
                  strokeWidth: 1.6,
                  strokeLinecap: 'round',
                }),
                h('path', {
                  d: 'M6.4 4.9h5M6.4 9.1h5',
                  stroke: 'currentColor',
                  strokeWidth: 1.6,
                  strokeLinecap: 'round',
                }),
              ),
            ),
            h('span', null, t('action.quote')),
          ),
        ),
      );
    }

    return {
      inject: ['slots', 'locale'],
      /**
       * Register the dictionaries and both slot contributions.
       * @param ctx - client root context.
       */
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'context-quote: dictionaries');
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'context-quote-action', order: 20, locale: NS },
            QuoteAction,
          ),
        );
        ctx.slots.inject('conversation.input.overlay', () =>
          ctx.slots.register(
            { name: 'conversation.input.overlay', id: 'context-quote-bridge', order: 90 },
            createQuoteBridge(ctx),
          ),
        );
      },
    };
  },
});
