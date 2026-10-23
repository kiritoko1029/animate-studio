import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { HighlightStyle, StreamLanguage, syntaxHighlighting, type StringStream } from '@codemirror/language';
import { keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { tags } from '@lezer/highlight';
import type { CodePanel } from '../../lib/custom-components/hints';

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
  { tag: [tags.keyword, tags.modifier, tags.tagName], color: 'var(--studio-950)', fontWeight: '700' },
  { tag: [tags.string, tags.regexp, tags.attributeValue], color: 'var(--studio-600)' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: 'var(--studio-950)' },
  { tag: tags.comment, color: 'var(--studio-500)', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--studio-950)', fontWeight: '600' },
  { tag: [tags.propertyName, tags.attributeName, tags.definition(tags.variableName)], color: 'var(--studio-600)' },
  { tag: [tags.operator, tags.punctuation, tags.bracket], color: 'var(--studio-600)' },
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
  '&.cm-focused': { outline: 'none' },
  '.cm-tooltip': { border: '1px solid var(--studio-200)', borderRadius: '6px', backgroundColor: 'var(--studio-0)', color: 'var(--studio-950)' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--studio-100)', color: 'var(--studio-950)' },
});
const languages = { html: htmlLanguage, css: cssLanguage, js: javascript().language };
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
        basicSetup, panel === 'js' ? javascript() : languages[panel], EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': labels[panel] }),
        EditorView.updateListener.of(update => { if (update.docChanged) handlers.current.onChange(update.state.doc.toString()); }),
        syntaxHighlighting(highlighting), editorTheme,
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
