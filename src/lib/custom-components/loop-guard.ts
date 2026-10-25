import { parser } from '@lezer/javascript';

/**
 * Component instrumentation: insert a `__asGuard()` call at the start of
 * every loop body so a runaway loop in a preview throws instead of freezing
 * the tab. The bootstrap defines `__asGuard` only for guarded runs.
 *
 * Code with syntax errors is returned unchanged so the browser reports the
 * real error. No newline is inserted, so reported line numbers still match the
 * JavaScript panel.
 */
export function guardLoops(code: string): string {
  if (!/\b(?:for|while|do)\b/.test(code)) return code;
  const tree = parser.parse(code);
  let invalid = false;
  tree.iterate({ enter(node) { if (node.type.isError) { invalid = true; return false; } return undefined; } });
  if (invalid) return code;
  const edits: { at: number; text: string }[] = [];
  tree.iterate({
    enter(node) {
      if (node.name !== 'ForStatement' && node.name !== 'WhileStatement' && node.name !== 'DoStatement') return;
      const body = node.name === 'DoStatement' ? node.node.firstChild?.nextSibling ?? null : node.node.lastChild;
      if (!body) return;
      if (body.name === 'Block') edits.push({ at: body.from + 1, text: '__asGuard();' });
      else if (body.name.endsWith('Statement')) edits.push({ at: body.from, text: '{__asGuard();' }, { at: body.to, text: '}' });
    },
  });
  if (!edits.length) return code;
  // Apply from the end so earlier offsets stay valid; equal offsets keep insertion order.
  let result = code;
  edits.map((edit, index) => ({ ...edit, index })).sort((a, b) => b.at - a.at || b.index - a.index).forEach(edit => { result = result.slice(0, edit.at) + edit.text + result.slice(edit.at); });
  return result;
}
