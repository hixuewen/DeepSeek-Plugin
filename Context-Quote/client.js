/**
 * Context Quote — quote conversation text, workspace files, and previewed code
 * into the composer.
 *
 * Three slot contributions and one Service registration cooperate:
 *
 * - `conversation.input.overlay` (Session scope) mounts an invisible bridge that
 *   publishes this Session's stable `inputActions` face. That slot is the only
 *   sanctioned seat that hands a plugin the composer's public action face.
 * - `shell.overlay` (root scope, the frame-wide floating layer) mounts the
 *   visible `引用` action for conversation selections.
 * - `sidebar.right.tab.document.actions` (Session scope) publishes the quoting
 *   face for one open preview (path plus insert callbacks), which the floating
 *   `引用` action uses while a code or plain-text selection is live.
 * - `contextMenus` contributions add `引用` to the host's shared menu for every
 *   captured `file` and `directory` target, so a right click on a workspace tree
 *   row, the `files` page directory bar, or a preview path bar quotes the entry.
 *
 * The host owns the file menu itself; the plugin only contributes one row, so
 * the tree keeps its native open/copy/download items and its own dismissal and
 * keyboard behavior. The row writes the entry as an `@` reference chip through
 * the Session face published by the composer bridge.
 *
 * Conversation selections become the host's native quote node through the
 * public `insertQuote()` action, so the composer shows the same quote preview
 * as the built-in Quote action and submission serializes it as a Markdown
 * blockquote — no hand-built `>` text enters the draft.
 *
 * Inserts never overwrite the draft: an `@file` / `@folder/` reference goes in
 * as a real composer chip through the Session input facade's
 * `insertReference()`, and the optional code fence follows through
 * `insertText()`, both revision-guarded by `captureInsertion()`. Keyboard focus
 * then returns to the composer through `SessionInput.focus()`, so the caret
 * sits after the inserted block.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-context-quote',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Dictionary namespace owned by this plugin. */
    const NS = 'contextQuote';
    /** Composer-adjacent and menu copy. */
    const zh = {
      'action.quote': '引用',
      'action.quoteHint': '将选中的内容引用到输入框',
      'action.quoteCodeHint': '将选中的代码引用到输入框',
      'menu.quote': '引用',
    };
    const en = {
      'action.quote': 'Quote',
      'action.quoteHint': 'Quote the selected text into the composer',
      'action.quoteCodeHint': 'Quote the selected code into the composer',
      'menu.quote': 'Quote',
    };

    /** Floating action and context-menu chrome, built only from host theme tokens. */
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

    /** Source name owned by the shipped `@file` reference source. */
    const REFERENCE_SOURCE = 'reference';
    /** Key this plugin owns in the shared menu: its icon and its action id. */
    const MENU_KEY = 'context-quote.quote';
    /** Preview roots that publish their own file identity. */
    const PREVIEW_ROOT = '[data-textpreview-url]';
    /** Renderers whose selection reads as code rather than prose. */
    const CODE_SELECTION = '[data-code-preview], [data-textpreview-plain]';

    /* ------------------------------------------------------------------ *
     * Path and payload helpers
     * ------------------------------------------------------------------ */

    /**
     * Read the final non-empty segment of either separator spelling.
     * @param path - a host or workspace path.
     * @returns the display basename.
     */
    function basenameOf(path) {
      const trimmed = String(path).replace(/[/\\]+$/, '');
      const slash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
      return trimmed.slice(slash + 1);
    }

    /**
     * Normalize a host path to the `/` spelling the mention grammar uses.
     * @param path - a host or workspace path.
     * @returns the slash-separated path.
     */
    function slashPath(path) {
      return String(path).replace(/\\/g, '/');
    }

    /**
     * Express one absolute path relative to its workspace root when it is inside it.
     * @param path - absolute path from the tree row or preview metadata.
     * @param root - the Session's workspace root, when known.
     * @returns the relative path, the unchanged absolute path, or '' for the root.
     */
    function mentionPathOf(path, root) {
      const absolute = slashPath(path);
      const base = slashPath(root ?? '').replace(/\/+$/, '');
      if (base === '') return absolute;
      if (absolute === base) return '';
      if (absolute.startsWith(`${base}/`)) {
        return absolute.slice(base.length + 1).replace(/^(?:\.\/)+/, '');
      }
      return absolute;
    }

    /**
     * Spell one file as an atomic `@` mention.
     * @param path - relative or absolute path.
     * @returns the mention, or null when the grammar cannot represent the path.
     */
    function formatFileMention(path) {
      const value = slashPath(path);
      // Same rejection as the shipped reference source: control characters and
      // embedded quotes cannot survive the `@path` / `@"path"` grammar.
      if (value === '' || /[\u0000-\u001f\u007f-\u009f"]/u.test(value)) return null;
      return /\s/u.test(value) ? `@"${value}"` : `@${value}`;
    }

    /**
     * Spell one directory as an atomic `@` mention. The shipped grammar marks a
     * folder by a trailing `/` (that is also what makes the transcript render a
     * folder chip), so the separator is added after trimming any the caller or
     * the tree row already carries.
     * @param path - relative or absolute directory path.
     * @returns the mention, or null when the grammar cannot represent the path.
     */
    function formatFolderMention(path) {
      const value = `${slashPath(path).replace(/[/\\]+$/, '')}/`;
      if (value === '/' || /[\u0000-\u001f\u007f-\u009f"]/u.test(value)) return null;
      return /\s/u.test(value) ? `@"${value}"` : `@${value}`;
    }

    /** Fence language for the extensions the host previews as code. */
    const LANGUAGE_BY_EXTENSION = {
      ts: 'ts', tsx: 'tsx', mts: 'ts', cts: 'ts',
      js: 'js', jsx: 'jsx', mjs: 'js', cjs: 'js',
      py: 'python', pyi: 'python',
      rs: 'rust', go: 'go', java: 'java', kt: 'kotlin', kts: 'kotlin',
      c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp',
      cs: 'csharp', rb: 'ruby', php: 'php', swift: 'swift', scala: 'scala',
      sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'fish', ps1: 'powershell',
      sql: 'sql', graphql: 'graphql', gql: 'graphql', proto: 'proto',
      json: 'json', jsonc: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml', ini: 'ini',
      html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
      md: 'markdown', mdx: 'mdx', xml: 'xml', svg: 'xml',
      vue: 'vue', svelte: 'svelte', astro: 'astro', dart: 'dart', lua: 'lua',
      r: 'r', jl: 'julia', ex: 'elixir', exs: 'elixir', erl: 'erlang',
      hs: 'haskell', clj: 'clojure', vim: 'vim', diff: 'diff', patch: 'diff',
      dockerfile: 'dockerfile', makefile: 'makefile',
    };

    /**
     * Pick the fence info string for one path.
     * @param path - file path of any spelling.
     * @returns a language label, or '' when the extension is unknown.
     */
    function languageOf(path) {
      const name = basenameOf(path).toLowerCase();
      if (name === 'dockerfile') return 'dockerfile';
      if (name === 'makefile') return 'makefile';
      const dot = name.lastIndexOf('.');
      if (dot < 0 || dot === name.length - 1) return '';
      return LANGUAGE_BY_EXTENSION[name.slice(dot + 1)] ?? '';
    }

    /**
     * Wrap source text in a fence long enough for its own backtick runs.
     * @param text - selected source text.
     * @param language - optional fence info string.
     * @returns the fenced block.
     */
    function codeFence(text, language) {
      let longest = 2;
      for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
      const fence = '`'.repeat(longest + 1);
      return `${fence}${language}\n${text}\n${fence}`;
    }

    /**
     * Normalize a browser selection into the body a quote carries: plain line
     * endings, no blank edge lines, original indentation preserved. The
     * conversation quote node and the quoted code fence both use it.
     * @param raw - the browser selection text.
     * @returns the trimmed body.
     */
    function quoteTextOf(raw) {
      const lines = String(raw).replace(/\r\n?/g, '\n').split('\n');
      while (lines.length > 0 && lines[0].trim() === '') lines.shift();
      while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
      return lines.join('\n');
    }

    /* ------------------------------------------------------------------ *
     * Composer access
     *
     * The floating layer is root-scoped, so every insert resolves the owning
     * Session binding first and then that generation's public input facade.
     * ------------------------------------------------------------------ */

    /**
     * Resolve one Session's public input facade.
     * @param rootCtx - the plugin's client root context.
     * @param sessionId - Session whose composer should receive the insert.
     * @returns the facade, or null when the Session/composer is unavailable.
     */
    function sessionFacade(rootCtx, sessionId) {
      const sessions = rootCtx.get('sessions');
      if (sessions === undefined) return null;
      const binding = sessions.binding(sessionId);
      if (binding === undefined) return null;
      try {
        const conversation = binding.ctx.get('conversation');
        if (conversation === undefined) return null;
        return conversation.input.for(binding.ctx);
      } catch {
        // A pending submission or a disposed Session generation refuses the
        // facade; the caller keeps the draft untouched.
        return null;
      }
    }

    /**
     * Hand the keyboard back to one Session's composer, keeping the caret the
     * editor last held (the end of the inserted block).
     * @param rootCtx - the plugin's client root context.
     * @param sessionId - Session whose composer should take focus.
     * @returns whether a retained Session composer accepted focus.
     */
    function focusComposer(rootCtx, sessionId) {
      const input = sessionFacade(rootCtx, sessionId);
      if (input === null) return false;
      try {
        input.focus();
        return true;
      } catch {
        return false;
      }
    }

    /**
     * Build the write path shared by the file menu and the preview action.
     * @param rootCtx - the plugin's client root context.
     * @param sessionId - Session that owns the composer.
     * @param inputActions - the Session composer's public action face.
     * @returns insert callbacks that never overwrite existing content.
     */
    function createInserter(rootCtx, sessionId, inputActions) {
      /** @returns a revision-guarded copy of the current editor selection. */
      function capture() {
        return inputActions.captureInsertion();
      }

      /**
       * Insert one reference chip, separating it from preceding text when the
       * caret sits directly after a non-space character. `insertReference`
       * itself adds the trailing space.
       * @param reference - the reference insertion payload.
       * @returns whether the chip landed.
       */
      function insertChip(reference) {
        const input = sessionFacade(rootCtx, sessionId);
        if (input === null) return false;
        let span = capture();
        if (span.start === span.end && span.start > 0) {
          const draft = input.state?.getSnapshot?.()?.draft ?? '';
          const before = draft.slice(0, span.start);
          if (before !== '' && !/\s$/u.test(before)) {
            // `insertText` on the collapsed span keeps the selection semantics
            // of the composer, then the chip sees the new revision.
            if (!inputActions.insertText(' ', span)) return false;
            span = capture();
          }
        }
        for (let attempt = 0; attempt < 3; attempt += 1) {
          if (input.insertReference(reference, span)) return true;
          span = capture();
        }
        return false;
      }

      /**
       * Insert plain text at the live caret with the same retry pattern.
       * @param text - text to insert in one undo step.
       * @returns whether the write applied.
       */
      function insertText(text) {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          if (inputActions.insertText(text, capture())) return true;
        }
        return false;
      }

      /**
       * Quote one whole file or directory as an `@` chip. A directory keeps the
       * trailing slash and the folder glyph the shipped picker uses, so the chip
       * reads as a folder and the mention resolves to the folder itself.
       * @param path - relative or absolute mention path.
       * @param kind - `file` or `folder`.
       * @returns whether the chip landed.
       */
      function quoteEntry(path, kind) {
        const folder = kind === 'folder';
        const mention = folder ? formatFolderMention(path) : formatFileMention(path);
        if (mention === null) return false;
        const name = basenameOf(path);
        const reference = {
          source: REFERENCE_SOURCE,
          ref: mention,
          label: folder ? `${name}/` : name,
          appearance: folder ? 'folder' : 'file',
          clipboardText: mention,
        };
        const applied = insertChip(reference);
        if (applied) focusComposer(rootCtx, sessionId);
        return applied;
      }

      /**
       * Quote one whole file as an `@file` chip.
       * @param path - relative or absolute mention path.
       * @returns whether the chip landed.
       */
      function quoteFile(path) {
        return quoteEntry(path, 'file');
      }

      /**
       * Quote one whole directory as an `@folder/` chip.
       * @param path - relative or absolute mention path.
       * @returns whether the chip landed.
       */
      function quoteFolder(path) {
        return quoteEntry(path, 'folder');
      }

      /**
       * Quote one selected code range as an `@file` chip followed by a fenced
       * code block. When the chip is refused, the mention itself still travels
       * as plain prompt text so the quote is never silently lost.
       * @param path - relative or absolute mention path.
       * @param raw - the preview selection text.
       * @returns whether the whole quote reached the draft.
       */
      function quoteSnippet(path, raw) {
        const code = quoteTextOf(raw);
        const mention = formatFileMention(path);
        if (code === '' || mention === null) return false;
        const reference = {
          source: REFERENCE_SOURCE,
          ref: mention,
          label: basenameOf(path),
          appearance: 'file',
          clipboardText: mention,
        };
        const block = `\n\n${codeFence(code, languageOf(path))}\n\n`;
        const chipped = insertChip(reference);
        const textApplied = insertText(chipped ? block : `${mention}${block}`);
        if (chipped || textApplied) focusComposer(rootCtx, sessionId);
        return chipped && textApplied;
      }

      return { quoteFile, quoteFolder, quoteSnippet };
    }

    /* ------------------------------------------------------------------ *
     * Session input faces
     *
     * The floating action and the context-menu rows live outside the Session
     * slots, so they receive no composer action face. A Session-scope bridge
     * publishes this Session's `inputActions` face: the floating action quotes
     * transcript selections through it, and the root-scope menu resolves the
     * captured target's Session face from it.
     * ------------------------------------------------------------------ */

    /** Latest published bridge, or null while no Session composer is mounted. */
    let bridge = null;
    /** Published faces by Session id, for menu rows addressing another Session. */
    const sessionFaces = new Map();
    /** Render callbacks waiting for a bridge change. */
    const bridgeListeners = new Set();

    /** Wake every bridge reader after a publish or withdraw. */
    function wakeBridge() {
      for (const listener of Array.from(bridgeListeners)) listener();
    }

    /**
     * Publish one Session composer's face as the current bridge.
     * @param face - Session id, public insert actions, and the quote action.
     */
    function publishBridge(face) {
      bridge = face;
      sessionFaces.set(face.sessionId, face);
      wakeBridge();
    }

    /**
     * Withdraw one composer's face without disturbing a newer bridge.
     * @param face - the exact face the unmounting composer published.
     */
    function withdrawBridge(face) {
      if (bridge === face) bridge = null;
      if (sessionFaces.get(face.sessionId) === face) sessionFaces.delete(face.sessionId);
      wakeBridge();
    }

    /**
     * Resolve one Session's published composer face.
     * @param sessionId - Session whose composer published a face.
     * @returns the face, or undefined while that composer is unmounted.
     */
    function faceOf(sessionId) {
      return sessionFaces.get(sessionId);
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

    /* ------------------------------------------------------------------ *
     * Preview faces
     *
     * The Session-scoped preview anchor publishes each live preview's quoting
     * face here; the root-scope floating action reads it. The store keeps no
     * React state of its own.
     * ------------------------------------------------------------------ */

    /** Live preview roots and the quoting face each one publishes. */
    const previewFaces = new WeakMap();

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
     * The quote glyph, shared by the floating action and the context-menu icon.
     * @param props - optional `size` in pixels; the menu icon uses the default.
     * @returns the SVG glyph.
     */
    function QuoteIcon(props) {
      const size = props?.size ?? 16;
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          xmlns: 'http://www.w3.org/2000/svg',
          'aria-hidden': true,
        },
        h('path', {
          d: 'M3 2.5v11',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
        }),
        h('path', {
          d: 'M7.3 5.6h5.7M7.3 10.4h5.7',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
        }),
      );
    }

    /** The quote glyph inside the floating action button. */
    function quoteGlyph() {
      return h(
        'span',
        { className: 'dsh-context-quote__icon', 'aria-hidden': true },
        h(QuoteIcon, { size: 14 }),
      );
    }

    /**
     * The floating `引用` action: appears beside a non-empty selection inside
     * the conversation transcript or inside a code/plain-text preview and
     * writes that selection into the composer — as a native quote node for
     * transcript text, as a reference chip plus code fence for previewed code.
     * @param props - locale seat (`t`) for the visible label.
     * @returns the action while a quotable selection exists; null otherwise.
     */
    function QuoteAction(props) {
      const { t } = props;
      const current = useBridge();
      const [hit, setHit] = React.useState(null);
      const [anchor, setAnchor] = React.useState(null);

      React.useEffect(() => {
        let frame = 0;

        /** Drop the action; the next live selection brings it back. */
        const clear = () => {
          setHit(null);
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
          if (element === null) {
            clear();
            return;
          }
          // Editable surfaces keep their own selection behavior everywhere.
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
            // Right Sidebar previews quote code (and plain text); Markdown,
            // images, PDFs, and other renderers keep their own behavior.
            const preview = element.closest(PREVIEW_ROOT);
            if (preview !== null) {
              if (element.closest(CODE_SELECTION) === null) {
                clear();
                return;
              }
              const face = previewFaces.get(preview);
              if (face === undefined) {
                clear();
                return;
              }
              setHit({ kind: 'snippet', text, face });
              setAnchor(point);
              return;
            }
            // Only the transcript quotes: the composer and every other
            // non-conversation surface keep their own selection behavior.
            if (element.closest('[data-conversation-scroll]') === null) {
              clear();
              return;
            }
            if (element.closest('[data-composer-card]') !== null) {
              clear();
              return;
            }
            setHit({ kind: 'transcript', text });
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

      if (hit === null || anchor === null) return null;
      // A conversation quote needs its Session bridge; a preview quote carries
      // its own write face, so it stays available independently.
      if (hit.kind === 'transcript' && current === null) return null;

      const hint = t(hit.kind === 'snippet' ? 'action.quoteCodeHint' : 'action.quoteHint');

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
              pointerEvents: 'auto',
            },
          },
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-context-quote__button',
              title: hint,
              'aria-label': hint,
              // Keep the browser selection alive: without this the mousedown
              // collapses it before `click` reads the text.
              onMouseDown: (event) => {
                event.preventDefault();
                event.stopPropagation();
              },
              onClick: (event) => {
                event.preventDefault();
                // Drop the transcript highlight before the write, so the
                // composer restores its own caret last and it stays visible.
                window.getSelection()?.removeAllRanges();
                try {
                  if (hit.kind === 'snippet') {
                    hit.face.quote(hit.text);
                  } else if (current !== null) {
                    // The native quote node renders the shared quote preview and
                    // focuses the composer itself; submission then serializes the
                    // blockquote, so no hand-built `>` text enters the draft.
                    current.insertQuote(quoteTextOf(hit.text));
                  }
                } catch {
                  // The composer may have been disposed between paint and click;
                  // the draft is untouched and the action simply closes.
                } finally {
                  setHit(null);
                  setAnchor(null);
                }
              },
            },
            quoteGlyph(),
            h('span', null, t('action.quote')),
          ),
        ),
      );
    }

    /**
     * Build the shared menu rows for one captured file or directory target.
     * The row stays visible, disabled, while its Session composer is unmounted,
     * so the menu does not change shape between Sessions.
     * @param rootCtx - the plugin's client root context.
     * @param t - translate function bound to this plugin's dictionary.
     * @param kind - `file` or `folder`.
     * @param target - the path the host captured for the entry.
     * @param sessionId - Session that owns the composer and the workspace.
     * @returns the menu rows for the captured target.
     */
    function entryMenuActions(rootCtx, t, kind, target, sessionId) {
      const sessions = rootCtx.get('sessions');
      const cwd = sessions?.list?.getSnapshot?.()?.byId?.[sessionId]?.cwd;
      const folder = kind === 'folder';
      // Keep the mention workspace-relative like the shipped @ picker; entries
      // outside the workspace, and the workspace root itself, stay absolute.
      const mention = mentionPathOf(target, cwd) || slashPath(target);
      return [
        {
          id: MENU_KEY,
          icon: { key: MENU_KEY },
          label: t('menu.quote'),
          disabled: faceOf(sessionId) === undefined,
          run: () => {
            const face = faceOf(sessionId);
            if (face === undefined) return;
            const inserter = createInserter(rootCtx, sessionId, face.inputActions);
            if (folder) inserter.quoteFolder(mention);
            else inserter.quoteFile(mention);
          },
        },
      ];
    }

    /**
     * Build the invisible Session-scope bridge for one plugin instance: it
     * publishes the composer's public insert face, which both the root-scope
     * floating action and the context-menu rows resolve.
     * @returns the bridge component.
     */
    function createQuoteBridge() {
      return function QuoteBridge(props) {
        const { sessionId, inputActions } = props;
        React.useEffect(() => {
          if (inputActions === undefined) return undefined;
          const face = {
            sessionId,
            inputActions,
            // The shell owns phase, blank-text, and focus handling: a locked
            // composer refuses the insert and leaves the draft untouched.
            insertQuote: (text) => inputActions.insertQuote(text),
          };
          publishBridge(face);
          return () => {
            withdrawBridge(face);
          };
        }, [inputActions, sessionId]);
        return null;
      };
    }

    /**
     * Build the invisible bridge mounted in one document preview's header. It
     * publishes the preview root's quoting face (path plus insert callbacks)
     * for the floating action.
     * @param rootCtx - the plugin's client root context.
     * @returns the preview anchor component.
     */
    function createPreviewAnchor(rootCtx) {
      return function PreviewQuoteAnchor(props) {
        const { sessionId, inputActions, absolutePath, useSessions } = props;
        const cwd = useSessions((state) => state.byId[sessionId]?.cwd);
        const ref = React.useRef(null);

        React.useEffect(() => {
          const node = ref.current;
          if (node === null || inputActions === undefined) return undefined;
          if (absolutePath === undefined || absolutePath === '') return undefined;
          const root = node.closest(PREVIEW_ROOT);
          if (root === null) return undefined;
          // Keep the mention workspace-relative like the shipped @ picker;
          // files outside the workspace stay absolute.
          const mention = mentionPathOf(absolutePath, cwd) || slashPath(absolutePath);
          previewFaces.set(root, {
            quote(text) {
              createInserter(rootCtx, sessionId, inputActions).quoteSnippet(mention, text);
            },
          });
          return () => {
            previewFaces.delete(root);
          };
        }, [absolutePath, cwd, inputActions, sessionId]);

        return h('span', {
          ref,
          hidden: true,
          'aria-hidden': true,
          style: { display: 'none' },
        });
      };
    }

    return {
      inject: ['slots', 'locale', 'contextMenus', 'sessions'],
      /**
       * Register the dictionaries, the shared-menu rows, and every slot
       * contribution.
       * @param ctx - client root context.
       */
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'context-quote: dictionaries');
        const t = ctx.locale.bind(NS);
        // The host owns the file and directory menus; this plugin contributes one
        // `引用` row to each captured target family. A workspace tree row, the
        // `files` page directory bar, and a preview path bar all reach these
        // providers, so no host DOM contract has to be assumed.
        ctx.effect(
          () =>
            ctx.contextMenus.register({
              id: 'context-quote.file',
              target: 'file',
              order: 40,
              resolve: ({ sessionId, path }) => entryMenuActions(ctx, t, 'file', path, sessionId),
            }),
          'context-quote: file menu',
        );
        ctx.effect(
          () =>
            ctx.contextMenus.register({
              id: 'context-quote.directory',
              target: 'directory',
              order: 40,
              resolve: ({ sessionId, path }) => entryMenuActions(ctx, t, 'folder', path, sessionId),
            }),
          'context-quote: directory menu',
        );
        ctx.slots.inject('contextMenu.icon', () =>
          ctx.slots.register({ name: 'contextMenu.icon', key: MENU_KEY }, QuoteIcon),
        );
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'context-quote-action', order: 20, locale: NS },
            QuoteAction,
          ),
        );
        ctx.slots.inject('conversation.input.overlay', () =>
          ctx.slots.register(
            { name: 'conversation.input.overlay', id: 'context-quote-bridge', order: 90 },
            createQuoteBridge(),
          ),
        );
        ctx.slots.inject('sidebar.right.tab.document.actions', () =>
          ctx.slots.register(
            {
              name: 'sidebar.right.tab.document.actions',
              id: 'context-quote-document',
              locale: NS,
            },
            createPreviewAnchor(ctx),
          ),
        );
      },
    };
  },
});
