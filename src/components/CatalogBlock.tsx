import { createElement, lazy, Suspense, useId, type ReactNode } from 'react';
import { Copy, Layers, MessageSquare, MoreHorizontal, Star, Type, Sparkles } from 'lucide-react';
import { catalogContent } from '../lib/code-export/catalog-blocks';
import { bind, type Content, type Element } from '../lib/code-export/nodes';
import { extendedCatalog, safeUrl, type Block, type ExtendedComponentType } from '../model';
import '../catalog-blocks.css';
import { Button } from '@animate-ui/react/primitives/buttons/button';
const NativeCatalogBlock = lazy(() => import('./NativeCatalogBlock'));

function staticNode(content: Content, key = 0): ReactNode {
  if (typeof content !== 'object') return content;
  if ('expression' in content) return content.initial as ReactNode;
  const props: Record<string, unknown> = { key };
  const names: Record<string, string> = { class: 'className', for: 'htmlFor', tabindex: 'tabIndex', value: 'defaultValue', checked: 'defaultChecked', inputmode: 'inputMode', autocomplete: 'autoComplete', maxlength: 'maxLength' };
  for (const [name, raw] of Object.entries(content.attrs)) {
    const value = raw && typeof raw === 'object' && 'expression' in raw ? raw.initial : raw;
    props[names[name] || name] = name === 'class' ? String(value).replace(/\bpage-/g, 'as-page-') : value;
  }
  if ('popover' in props) props.hidden = true;
  if (content.tag === 'progress') { props.value = props.defaultValue; delete props.defaultValue; }
  return createElement(content.tag === 'button' ? Button : content.tag, props, ...content.children.map((child, index) => staticNode(child, index)));
}

/** Keep a portable initial fallback while the official v2 catalog loads on demand. */
export function CatalogBlock({ block, snapshot = false }: { block: Block & { type: ExtendedComponentType }; snapshot?: boolean }) {
  const uid = useId();
  const tree: Element = catalogContent({ type: block.type, p: block.props, field: initial => ({ initial, expression: 'undefined', set: () => '' }), id: suffix => bind('', uid + (suffix || '')), imageUrl: value => safeUrl(value) === '#' ? '' : safeUrl(value) });
  const fallback = staticNode(tree);
  return <Suspense fallback={fallback}><NativeCatalogBlock key={`${block.id}:${block.type}:${block.props.items || ''}:${JSON.stringify(block.props.motion ?? {})}`} block={block} snapshot={snapshot} /></Suspense>;
}

export function CatalogMiniature({ type }: { type: ExtendedComponentType }) {
  const item = extendedCatalog[type];
  if (item.group === '动态背景') return <span className={`catalog-mini-bg catalog-mini-bg--${type}`}><i/><i/><i/><Sparkles size={16}/></span>;
  if (item.group === '文字动效') return <span className={`catalog-mini-text catalog-mini-text--${type}`}>{type.endsWith('Number') ? '86' : 'Make it move'}</span>;
  if (item.group === '按钮') return <span className={`catalog-mini-button catalog-mini-button--${type}`}>{type === 'copyButton' ? <Copy size={11}/> : type === 'iconButton' ? <Star size={13}/> : 'Button'}<span>↗</span></span>;
  if (type === 'avatarGroup') return <span className="catalog-mini-avatars"><b>林</b><b>陈</b><b>雨</b></span>;
  if (type === 'codeBlock') return <span className="catalog-mini-code"><i>const idea =</i><b>"Hello";</b></span>;
  if (type === 'inputOtp') return <span className="catalog-mini-otp">{['1','2','3','·'].map((n,i)=><b key={i}>{n}</b>)}</span>;
  if (type === 'menubar') return <span className="catalog-mini-menubar"><span><b>文件</b><i>编辑</i><i>视图</i></span><small><i/><i/><i/></small></span>;
  const Icon = item.group === '浮层' ? MessageSquare : item.group === '导航' ? MoreHorizontal : item.group === '表单' ? Type : Layers;
  return <span className={`catalog-mini-panel catalog-mini-panel--${item.group}`}><Icon size={14}/><i/><i/><b/></span>;
}
