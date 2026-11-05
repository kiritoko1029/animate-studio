import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { HighlightStyle, StreamLanguage, syntaxHighlighting, type StringStream } from '@codemirror/language';
import { Decoration, type DecorationSet, ViewPlugin, type ViewUpdate, keymap } from '@codemirror/view';
import { Prec, RangeSetBuilder } from '@codemirror/state';
import { tags } from '@lezer/highlight';
import type { CodePanel } from '../../lib/custom-components/hints';
import { highlightCodeLine } from '../../lib/workspace/git-diff';

function buildLineHighlightDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  let lastLineFrom = -1;
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      if (line.from > lastLineFrom) {
        lastLineFrom = line.from;
        const tokens = highlightCodeLine(line.text);
        let offset = line.from;
        for (const tok of tokens) {
          const len = tok.text.length;
          if (len > 0 && tok.kind !== 'plain') {
            builder.add(offset, offset + len, Decoration.mark({ class: `hl-${tok.kind}` }));
          }
          offset += len;
        }
      }
      if (line.to >= to) break;
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

const lineSyntaxHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildLineHighlightDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildLineHighlightDecorations(update.view);
      }
    }
  },
  {
    decorations: instance => instance.decorations,
  },
);

/** Small stream highlighters: enough to read markup and styles, no extra packages. */
type HtmlState = { inTag: boolean; inComment: boolean };
const htmlLanguage = StreamLanguage.define<HtmlState>({
  name: 'html',
  startState: () => ({ inTag: false, inComment: false }),
  token(stream: StringStream, state: HtmlState) {
    if (state.inComment) {
      if (stream.skipTo('-->')) { stream.match('-->'); state.inComment = false; } else stream.skipToEnd();
      return 'comment';
    }
    if (stream.match('<!--')) { state.inComment = true; return 'comment'; }
    if (!state.inTag) {
      if (stream.match(/^<\/?[A-Za-z][\w-]*/)) { state.inTag = true; return 'tag'; }
      if (stream.match(/^&[#\w]+;/)) return 'atom';
      stream.next(); stream.eatWhile(/[^<&]/);
      return null;
    }
    if (stream.eatSpace()) return null;
    if (stream.match(/^\/?>/)) { state.inTag = false; return 'tag'; }
    if (stream.match(/^"[^"]*"?/) || stream.match(/^'[^']*'?/)) return 'string';
    if (stream.match(/^[^\s=>/"']+/)) return 'attribute';
    stream.next();
    return null;
  },
});
type CssState = { depth: number; inComment: boolean };
const cssLanguage = StreamLanguage.define<CssState>({
  name: 'css',
  startState: () => ({ depth: 0, inComment: false }),
  token(stream: StringStream, state: CssState) {
    if (state.inComment) {
      if (stream.skipTo('*/')) { stream.match('*/'); state.inComment = false; } else stream.skipToEnd();
      return 'comment';
    }
    if (stream.match('/*')) { state.inComment = true; return 'comment'; }
    if (stream.eatSpace()) return null;
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/) || stream.match(/^'(?:[^'\\]|\\.)*'?/)) return 'string';
    const next = stream.peek();
    if (next === '{') { stream.next(); state.depth++; return 'bracket'; }
    if (next === '}') { stream.next(); state.depth = Math.max(0, state.depth - 1); return 'bracket'; }
    if (stream.match(/^@[\w-]+/)) return 'keyword';
    if (stream.match(/^#[0-9a-fA-F]{3,8}\b/)) return 'number';
    if (stream.match(/^-?\d*\.?\d+(?:%|[a-zA-Z]+)?/)) return 'number';
    if (state.depth && stream.match(/^-{0,2}[\w-]+(?=\s*:)/)) return 'property';
    if (stream.match(/^[\w-]+(?=\()/)) return 'keyword';
    if (stream.match(/^[\w-]+/)) return state.depth ? 'atom' : 'tag';
    stream.next();
    return null;
  },
});

const highlighting = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier, tags.controlKeyword, tags.operatorKeyword, tags.moduleKeyword], color: 'var(--syntax-keyword, #7c3aed)', fontWeight: '650' },
  { tag: [tags.tagName, tags.typeName, tags.className, tags.namespace], color: 'var(--syntax-type, #0891b2)', fontWeight: '600' },
  { tag: [tags.string, tags.regexp, tags.attributeValue, tags.special(tags.string)], color: 'var(--syntax-string, #059669)' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom, tags.unit], color: 'var(--syntax-number, #d97706)', fontWeight: '500' },
  { tag: tags.comment, color: 'var(--syntax-comment, #64748b)', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--syntax-function, #2563eb)', fontWeight: '600' },
  { tag: [tags.propertyName, tags.attributeName, tags.definition(tags.variableName)], color: 'var(--syntax-attr, #0284c7)' },
  { tag: [tags.operator, tags.punctuation, tags.bracket], color: 'var(--syntax-operator, #475569)' },
]);
const editorTheme = EditorView.theme({
  '&': { height: '100%', minHeight: '0', fontSize: '13px', backgroundColor: 'var(--studio-0)', color: 'var(--studio-950)' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', minHeight: '0', overflow: 'auto' },
  '.cm-gutters': { backgroundColor: 'var(--studio-50)', border: 'none', color: 'var(--studio-500)' },
  '.cm-activeLine': { backgroundColor: 'var(--studio-50)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--studio-100)' },
  '.cm-cursor': { borderLeftColor: 'var(--studio-950)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'var(--studio-200)' },
  '.cm-content': { padding: '12px 0' },
  '.cm-content .hl-keyword, .cm-content .hl-keyword *': { color: 'var(--syntax-keyword, #7c3aed) !important', fontWeight: '650' },
  '.cm-content .hl-string, .cm-content .hl-string *': { color: 'var(--syntax-string, #059669) !important' },
  '.cm-content .hl-number, .cm-content .hl-number *': { color: 'var(--syntax-number, #d97706) !important', fontWeight: '500' },
  '.cm-content .hl-comment, .cm-content .hl-comment *': { color: 'var(--syntax-comment, #64748b) !important', fontStyle: 'italic' },
  '.cm-content .hl-function, .cm-content .hl-function *': { color: 'var(--syntax-function, #2563eb) !important', fontWeight: '600' },
  '.cm-content .hl-type, .cm-content .hl-type *, .cm-content .hl-tag, .cm-content .hl-tag *': { color: 'var(--syntax-type, #0891b2) !important', fontWeight: '600' },
  '.cm-content .hl-attr, .cm-content .hl-attr *': { color: 'var(--syntax-attr, #0284c7) !important' },
  '.cm-content .hl-operator, .cm-content .hl-operator *': { color: 'var(--syntax-operator, #475569) !important' },
  '&.cm-focused': { outline: 'none' },
  '.cm-tooltip': { border: '1px solid var(--studio-200)', borderRadius: '6px', backgroundColor: 'var(--studio-0)', color: 'var(--studio-950)' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--studio-100)', color: 'var(--studio-950)' },
});
const languages = { html: htmlLanguage, css: cssLanguage, js: javascript({ jsx: true, typescript: true }).language };
const labels: Record<CodePanel, string> = { html: 'HTML 代码编辑器', css: 'CSS 代码编辑器', js: 'JavaScript 代码编辑器' };

export type CodePanelHandle = { reveal: (line: number) => void; focus: () => void };

/**
 * One editor per code panel. The document is owned here while typing;
 * external replacements (templates, restored drafts) sync in through `value`.
 */
export const CodePanelEditor = forwardRef<CodePanelHandle, { panel: CodePanel; value: string; onChange: (value: string) => void; onRun: () => void; onSave: () => void; hidden?: boolean }>(function CodePanelEditor({ panel, value, onChange, onRun, onSave, hidden = false }, ref) {
  const parent = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const handlers = useRef({ onChange, onRun, onSave });
  handlers.current = { onChange, onRun, onSave };
  useImperativeHandle(ref, () => ({
    reveal(line) {
      const editor = view.current;
      if (!editor) return;
      const target = editor.state.doc.line(Math.max(1, Math.min(editor.state.doc.lines, line)));
      editor.dispatch({ selection: { anchor: target.from, head: target.to }, scrollIntoView: true });
      editor.focus();
    },
    focus() { view.current?.focus(); },
  }), []);
  useEffect(() => {
    const editor = new EditorView({
      parent: parent.current!, doc: value,
      extensions: [
        Prec.highest(keymap.of([
          { key: 'Mod-Enter', run: () => { handlers.current.onRun(); return true; } },
          { key: 'Mod-s', preventDefault: true, run: () => { handlers.current.onSave(); return true; } },
        ])),
        basicSetup, panel === 'js' ? javascript({ jsx: true, typescript: true }) : languages[panel], EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': labels[panel] }),
        EditorView.updateListener.of(update => { if (update.docChanged) handlers.current.onChange(update.state.doc.toString()); }),
        syntaxHighlighting(highlighting), lineSyntaxHighlightPlugin, editorTheme,
      ],
    });
    view.current = editor;
    return () => { editor.destroy(); view.current = null; };
  }, [panel]);
  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value) editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }, [value]);
  return <div className="component-code-editor" ref={parent} hidden={hidden} data-panel={panel}/>;
});
