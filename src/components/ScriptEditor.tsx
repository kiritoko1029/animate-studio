import { t, translateMessage } from '../i18n';
import { useLocale } from '../i18n/react';
import { StudioButton } from './StudioUI';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { javascript, javascriptLanguage, scopeCompletionSource } from '@codemirror/lang-javascript';
import { acceptCompletion, startCompletion, closeCompletion, completionStatus, type CompletionContext } from '@codemirror/autocomplete';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Prec, Compartment } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { scriptCompletionSource, scriptGlobals } from '../lib/interactions/script-assistance';
import type { Variable } from '../lib/interactions/types';

export type ScriptEditorHandle = { insert: (code: string) => void };
const highlighting = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier], color: 'var(--studio-950)', fontWeight: '700' },
  { tag: [tags.string, tags.regexp], color: 'var(--studio-600)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--studio-950)' },
  { tag: tags.comment, color: 'var(--studio-500)', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--studio-950)', fontWeight: '600' },
  { tag: [tags.propertyName, tags.definition(tags.variableName)], color: 'var(--studio-600)' },
  { tag: [tags.operator, tags.punctuation], color: 'var(--studio-600)' },
]);

const ScriptEditor = forwardRef<ScriptEditorHandle, { value: string; variables: Variable[]; onChange: (value: string) => void }>(function ScriptEditor({ value, variables, onChange }, ref) {
  const locale = useLocale();
  const languageAttributes = useRef(new Compartment());
  const parent = useRef<HTMLDivElement>(null), editor = useRef<EditorView | null>(null);
  const update = useRef(onChange); update.current = onChange;
  const availableVariables = useRef(variables); availableVariables.current = variables;
  useImperativeHandle(ref, () => ({ insert(code) {
    const view = editor.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const insert = (from > 0 && view.state.sliceDoc(from - 1, from) !== '\n' ? '\n' : '') + code + '\n';
    view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length }, scrollIntoView: true });
    view.focus();
  } }), []);
  useEffect(() => {
    const view = new EditorView({ parent: parent.current!, doc: value, extensions: [basicSetup, javascript(), EditorView.lineWrapping,
      languageAttributes.current.of(EditorView.contentAttributes.of({ 'aria-label': t("JavaScript 脚本编辑器") })),
      EditorView.updateListener.of(updateEvent => { if (updateEvent.docChanged) update.current(updateEvent.state.doc.toString()); }),
      // Add sources to JavaScript's language data so local-variable/keyword completion remains available.
      javascriptLanguage.data.of({ autocomplete: (context: CompletionContext) => { const result = scriptCompletionSource(() => availableVariables.current)(context); if (!result || 'then' in result) return result; return { ...result, options: result.options.map(option => ({ ...option, detail: option.detail && t(option.detail), info: typeof option.info === 'string' ? translateMessage(option.info) : option.info })) }; } }),
      javascriptLanguage.data.of({ autocomplete: scopeCompletionSource(scriptGlobals) }),
      Prec.highest(keymap.of([{ key: 'Tab', run: acceptCompletion }])),
      syntaxHighlighting(highlighting),
      EditorView.theme({ '&': { height: '100%', minHeight: '0', fontSize: '13px', backgroundColor: 'var(--studio-0)', color: 'var(--studio-950)' }, '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', minHeight: '0', overflow: 'auto' }, '.cm-gutters': { backgroundColor: 'var(--studio-50)', border: 'none', color: 'var(--studio-500)' }, '.cm-activeLine': { backgroundColor: 'var(--studio-50)' }, '.cm-activeLineGutter': { backgroundColor: 'var(--studio-100)' }, '.cm-cursor': { borderLeftColor: 'var(--studio-950)' }, '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'var(--studio-200)' }, '.cm-content': { padding: '14px 0' }, '&.cm-focused': { outline: 'none' }, '.cm-tooltip': { border: '1px solid var(--studio-200)', borderRadius: '6px', backgroundColor: 'var(--studio-0)', color: 'var(--studio-950)', boxShadow: '0 6px 20px #00000020' }, '.cm-tooltip-autocomplete > ul > li': { padding: '5px 8px' }, '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--studio-100)', color: 'var(--studio-950)' }, '.cm-completionDetail': { fontSize: '11px', color: 'var(--studio-500)' }, '.cm-completionInfo': { padding: '10px', fontFamily: 'system-ui, sans-serif', lineHeight: '1.7', maxWidth: '300px' } }),
    ] });
    editor.current = view;
    return () => { view.destroy(); editor.current = null; };
  }, []);
  useEffect(() => { editor.current?.dispatch({ effects: languageAttributes.current.reconfigure(EditorView.contentAttributes.of({ 'aria-label': t('JavaScript 脚本编辑器') })) }); }, [locale]);
  useEffect(() => { const view = editor.current; if (view && view.state.doc.toString() !== value) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } }); }, [value]);
  return <><div className="script-editor-tools"><span>JavaScript · async / await</span><StudioButton type="button" onMouseDown={event => event.preventDefault()} onClick={() => { const view = editor.current; if (view) { view.focus(); view.dispatch({ scrollIntoView: true }); startCompletion(view); } }}>{t("代码补全")}</StudioButton></div><div className="script-code-editor" ref={parent} onKeyDownCapture={event => {
    const view = editor.current;
    if (event.key === 'Escape' && view && completionStatus(view.state)) {
      // The dialog reserves Escape in capture phase; CodeMirror still owns closing its completion UI.
      closeCompletion(view); event.preventDefault(); event.stopPropagation();
    }
  }} /><p className="script-editor-shortcuts">{t("输入时自动补全 · Ctrl + Space 手动触发 · Enter / Tab 选用 · Tab 切换代码片段参数")}</p></>;
});
export default ScriptEditor;
