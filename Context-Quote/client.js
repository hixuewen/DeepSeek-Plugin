/**
 * Context Quote — quote conversation text, workspace files, and previewed code
 * into the composer.
 *
 * Four slot contributions cooperate:
 *
 * - `conversation.input.overlay` (Session scope) mounts an invisible bridge that
 *   publishes this Session's stable `inputActions` face. That slot is the only
 *   sanctioned seat that hands a plugin the composer's public action face.
 * - `shell.overlay` (root scope, the frame-wide floating layer) mounts the
 *   visible `引用` action (conversation selections) and the file context menu.
 * - `sidebar.right.tab.files.actions` (Session scope) listens for a file row's
 *   native `contextmenu`, suppresses the browser menu, and publishes the file
 *   menu request for the floating layer.
 * - `sidebar.right.tab.document.actions` (Session scope) publishes the quoting
 *   face for one open preview (path plus insert callbacks), which the floating
 *   `引用` action uses while a code or plain-text selection is live.
 *
 * Inserts never overwrite the draft: an `@file` reference goes in as a real
 * composer chip through the Session input facade's `insertReference()`, and the
 * optional code fence follows through `insertText()`, both revision-guarded by
 * `captureInsertion()`. Keyboard focus then returns to the composer through
 * `SessionInput.focus()`, so the caret sits after the inserted block.
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
      'menu.quoteFile': '引用',
      'menu.quoteFileHint': '将该文件引用到输入框',
    };
    const en = {
      'action.quote': 'Quote',
      'action.quoteHint': 'Quote the selected text into the composer',
      'action.quoteCodeHint': 'Quote the selected code into the composer',
      'menu.quoteFile': 'Quote',
      'menu.quoteFileHint': 'Quote this file into the composer',
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
      '.dsh-context-quote__menu{',
      'box-sizing:border-box;min-width:168px;max-width:300px;padding:4px;',
      'background:var(--dsw-alias-bg-overlay);',
      'border:1px solid var(--dsw-alias-border-l2);',
      'border-radius:var(--dsw-radius-md,8px);',
      'box-shadow:var(--dsw-elevation-panel,0 8px 24px rgba(0,0,0,.18));',
      '}',
      '.dsh-context-quote__menuItem{',
      'display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;',
      'height:30px;padding:0 10px;',
      'font:var(--dsw-font-xs-strong-13,500 13px/18px var(--dsw-font-family,sans-serif));',
      'color:var(--dsw-alias-label-primary);background:transparent;border:0;',
      'border-radius:var(--dsw-radius-sm,6px);cursor:pointer;text-align:left;',
      '}',
      '.dsh-context-quote__menuItem:hover,.dsh-context-quote__menuItem:focus-visible{',
      'background:var(--dsw-alias-bg-layer-2);outline:none;',
      '}',
      '.dsh-context-quote__menuName{flex:none;}',
      '.dsh-context-quote__menuPath{',
      'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
      'color:var(--dsw-alias-label-secondary);font-weight:400;font-size:12px;',
      '}',
    ].join('');

    /** Source name owned by the shipped `@file` reference source. */
    const REFERENCE_SOURCE = 'reference';
    /** File rows published by the right Sidebar's workspace tree. */
    const FILE_ROW = '[data-files-entry="file"]';
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
     * Drop blank edge lines while preserving the code's own indentation.
     * @param raw - the browser selection text.
     * @returns the exact code body to quote.
     */
    function selectedCode(raw) {
      const lines = String(raw).replace(/\r\n?/g, '\n').split('\n');
      while (lines.length > 0 && lines[0].trim() === '') lines.shift();
      while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
      return lines.join('\n');
    }

    /**
     * Normalize one conversation selection into the Markdown quote block that
     * enters the composer.
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
       * Quote one whole file as an `@file` chip.
       * @param path - relative or absolute mention path.
       * @returns whether the chip landed.
       */
      function quoteFile(path) {
        const mention = formatFileMention(path);
        if (mention === null) return false;
        const reference = {
          source: REFERENCE_SOURCE,
          ref: mention,
          label: basenameOf(path),
          appearance: 'file',
          clipboardText: mention,
        };
        const applied = insertChip(reference);
        if (applied) focusComposer(rootCtx, sessionId);
        return applied;
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
        const code = selectedCode(raw);
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

      return { quoteFile, quoteSnippet };
    }

    /* ------------------------------------------------------------------ *
     * Session bridge store (conversation selections)
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

    /* ------------------------------------------------------------------ *
     * Preview faces and file menu requests
     *
     * Session-scoped anchors publish into these module stores; the root-scope
     * floating layer renders them. Neither store keeps React state of its own.
     * ------------------------------------------------------------------ */

    /** Live preview roots and the quoting face each one publishes. */
    const previewFaces = new WeakMap();

    /** Open file context menu request, or null. */
    let fileMenu = null;
    /** Render callbacks waiting for a file-menu change. */
    const fileMenuListeners = new Set();

    /**
     * Replace the published file-menu request and wake its reader.
     * @param next - the new request, or null when the menu is dismissed.
     */
    function publishFileMenu(next) {
      fileMenu = next;
      for (const listener of Array.from(fileMenuListeners)) listener();
    }

    /**
     * Close the menu only when it belongs to one unmounting tree.
     * @param owner - the tree root element that published the menu.
     */
    function closeFileMenuFor(owner) {
      if (fileMenu !== null && fileMenu.owner === owner) publishFileMenu(null);
    }

    /**
     * Subscribe a component to the published file-menu request.
     * @returns the current request, or null while the menu is closed.
     */
    function useFileMenu() {
      const [, bump] = React.useReducer((count) => count + 1, 0);
      React.useEffect(() => {
        fileMenuListeners.add(bump);
        return () => {
          fileMenuListeners.delete(bump);
        };
      }, []);
      return fileMenu;
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

    /** The quote glyph shared by the floating action and the file menu. */
    function quoteGlyph() {
      return h(
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
      );
    }

    /**
     * The floating `引用` action: appears beside a non-empty selection inside
     * the conversation transcript or inside a code/plain-text preview and
     * writes that selection into the composer draft.
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
                // Drop the highlight before focusing, so the composer restores
                // its own caret last and it stays visible.
                const selection = window.getSelection();
                if (selection !== null) selection.removeAllRanges();
                try {
                  if (hit.kind === 'snippet') {
                    hit.face.quote(hit.text);
                  } else if (current !== null) {
                    const draft = current.readDraft() ?? '';
                    current.insert(buildQuote(hit.text, draft.trim() !== ''));
                    current.focusComposer();
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
     * The file context menu published by the workspace tree. One row quotes
     * the file as an `@file` reference chip.
     * @param props - locale seat (`t`) for the visible label.
     * @returns the menu while a file row requested it; null otherwise.
     */
    function FileQuoteMenu(props) {
      const { t } = props;
      const request = useFileMenu();
      const menuRef = React.useRef(null);

      React.useEffect(() => {
        if (request === null) return undefined;
        const close = () => request.close();
        const onPointerDown = (event) => {
          const node = menuRef.current;
          if (node !== null && event.target instanceof Node && node.contains(event.target)) return;
          close();
        };
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          close();
        };
        const onViewportChange = () => close();
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('scroll', onViewportChange, true);
        window.addEventListener('resize', onViewportChange);
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true);
          document.removeEventListener('keydown', onKeyDown, true);
          window.removeEventListener('scroll', onViewportChange, true);
          window.removeEventListener('resize', onViewportChange);
        };
      }, [request]);

      if (request === null) return null;

      const width = 300;
      const height = 40;
      const x = Math.min(Math.max(request.x, 8), Math.max(8, window.innerWidth - width - 8));
      const y = Math.min(Math.max(request.y, 8), Math.max(8, window.innerHeight - height - 8));

      return h(
        React.Fragment,
        null,
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h(
          'div',
          {
            ref: menuRef,
            className: 'dsh-context-quote__menu',
            role: 'menu',
            'aria-label': t('menu.quoteFile'),
            style: {
              position: 'fixed',
              left: `${x}px`,
              top: `${y}px`,
              zIndex: 31,
              pointerEvents: 'auto',
            },
          },
          h(
            'button',
            {
              type: 'button',
              role: 'menuitem',
              className: 'dsh-context-quote__menuItem',
              title: t('menu.quoteFileHint'),
              autoFocus: true,
              onClick: () => {
                try {
                  request.quote();
                } finally {
                  request.close();
                }
              },
            },
            quoteGlyph(),
            h('span', { className: 'dsh-context-quote__menuName' }, t('menu.quoteFile')),
            h('span', { className: 'dsh-context-quote__menuPath' }, request.label),
          ),
        ),
      );
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
     * Build the invisible bridge mounted in a workspace tree's header. It owns
     * that tree's `contextmenu` handling and publishes the file menu request.
     * @param rootCtx - the plugin's client root context.
     * @returns the tree anchor component.
     */
    function createFilesAnchor(rootCtx) {
      return function FilesQuoteAnchor(props) {
        const { sessionId, inputActions } = props;
        const ref = React.useRef(null);

        React.useEffect(() => {
          const node = ref.current;
          if (node === null || inputActions === undefined) return undefined;
          const root = node.closest('[data-files-root]');
          if (root === null) return undefined;

          /** Turn one file-row right click into a floating menu request. */
          const onContextMenu = (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const row = target.closest(FILE_ROW);
            if (row === null) return;
            const absolutePath = row.getAttribute('data-files-path');
            if (absolutePath === null || absolutePath === '') return;
            event.preventDefault();
            event.stopPropagation();
            const treeRoot = root.getAttribute('data-files-root') ?? '';
            const mention = mentionPathOf(absolutePath, treeRoot) || slashPath(absolutePath);
            const rect = row.getBoundingClientRect();
            const x = event.clientX > 0 ? event.clientX + 2 : rect.left + 12;
            const y = event.clientY > 0 ? event.clientY + 2 : rect.top + rect.height;
            publishFileMenu({
              owner: root,
              x,
              y,
              label: basenameOf(absolutePath),
              quote: () => {
                createInserter(rootCtx, sessionId, inputActions).quoteFile(mention);
              },
              close: () => closeFileMenuFor(root),
            });
          };

          root.addEventListener('contextmenu', onContextMenu);
          return () => {
            root.removeEventListener('contextmenu', onContextMenu);
            closeFileMenuFor(root);
          };
        }, [inputActions, sessionId]);

        return h('span', {
          ref,
          hidden: true,
          'aria-hidden': true,
          style: { display: 'none' },
        });
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
      inject: ['slots', 'locale'],
      /**
       * Register the dictionaries and every slot contribution.
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
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'context-quote-file-menu', order: 21, locale: NS },
            FileQuoteMenu,
          ),
        );
        ctx.slots.inject('conversation.input.overlay', () =>
          ctx.slots.register(
            { name: 'conversation.input.overlay', id: 'context-quote-bridge', order: 90 },
            createQuoteBridge(ctx),
          ),
        );
        ctx.slots.inject('sidebar.right.tab.files.actions', () =>
          ctx.slots.register(
            {
              name: 'sidebar.right.tab.files.actions',
              id: 'context-quote-file-tree',
              locale: NS,
            },
            createFilesAnchor(ctx),
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
