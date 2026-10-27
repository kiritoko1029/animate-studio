import { useContext } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import type { Block, PageDocument } from '../../model';
import { readDataPath } from '../../../shared/data-sources.mjs';
import type { JsonValue } from '../../lib/interactions/types';
import { NativeRuntimeContext } from '../NativeInteractions';
import { BlockRenderer } from '../PageRenderer';
import { useDataSource } from './DataRuntime';
import { itemField } from '../../lib/data/item';
import { filteredDataPage } from '../../lib/data/filter';

function text(value: JsonValue | undefined) { return value === undefined || value === null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value); }
export function DataCollectionState({ result, interactive, pagination = true, children }: { result: ReturnType<typeof useDataSource>; interactive: boolean; pagination?: boolean; children: React.ReactNode }) {
  if (result.status === 'loading') return <div className="data-state" role="status" aria-busy="true"><span className="data-loading-dot"/>正在读取数据…</div>;
  if (result.status === 'error') return <div className="data-state data-state--error" role="alert"><span>{result.error}</span><button type="button" disabled={!interactive} onClick={result.refresh}><RefreshCw size={13}/>重试</button></div>;
  const navigation = pagination && <nav className="data-pagination" aria-label="数据分页"><button type="button" aria-label="上一页数据" disabled={!interactive || result.page <= 1} onClick={() => result.setPage(result.page - 1)}><ChevronLeft size={14}/></button><span>第 {result.page} 页{result.pageCount > result.page ? ` / ${result.pageCount}` : ''}</span><button type="button" aria-label="下一页数据" disabled={!interactive || result.page >= result.pageCount} onClick={() => result.setPage(result.page + 1)}><ChevronRight size={14}/></button></nav>;
  if (!result.items.length) return <><div className="data-state" role="status">暂无数据。可以调整筛选条件，或先添加一条记录。</div>{navigation}</>;
  return <>{children}{navigation}</>;
}
export function RepeaterBlock({ block, settings, interactive }: { block: Block; settings: PageDocument['settings']; interactive: boolean }) {
  const data = useDataSource(block.props.sourceId), context = useContext(NativeRuntimeContext);
  const selected = block.props.filterVariable ? context?.state[block.props.filterVariable] : undefined;
  const result = filteredDataPage(data, data.source, block.props.filterField, selected);
  return <section className="data-repeater" aria-label={block.props.title || '动态列表'}>{block.props.title && <h3>{block.props.title}</h3>}<DataCollectionState result={result} interactive={interactive}><div className="data-repeater-list">{result.items.map((item, index) => {
    const id = item.id === undefined || item.id === null ? index : String(item.id);
    return <article className="data-repeater-item" data-repeater-item={id} key={id} onClick={() => { if (interactive) void context?.runtime.dispatch(block.id, 'click', item); }}>{(block.children ?? []).map(child => {
      const fields = block.props.dataFields?.[child.id] ?? {};
      const props = { ...child.props };
      for (const [key, template] of Object.entries(fields)) {
        const value = itemField(template, item, index);
        if (key === 'url') props.url = value === undefined ? '#' : text(value);
        else if (['title', 'text', 'label', 'imageUrl'].includes(key)) props[key as 'title' | 'text' | 'label' | 'imageUrl'] = text(value);
      }
      return <BlockRenderer key={child.id} block={{ ...child, id: `${block.id}-${id}-${child.id}`, props, frame: undefined }} settings={settings} interactive={interactive}/>;
    })}</article>;
  })}</div></DataCollectionState></section>;
}
export function DataTableBlock({ block, interactive }: { block: Block; interactive: boolean }) {
  const data = useDataSource(block.props.sourceId), context = useContext(NativeRuntimeContext);
  const selected = block.props.filterVariable ? context?.state[block.props.filterVariable] : undefined;
  const result = filteredDataPage(data, data.source, block.props.filterField, selected);
  const columns = block.props.dataColumns ?? [];
  return <div className="data-table-wrap"><DataCollectionState result={result} interactive={interactive}><div className="page-table-scroll" tabIndex={interactive ? 0 : -1} role="region" aria-label={block.props.title || '数据表格'}><table className="page-data-table">{block.props.title && <caption>{block.props.title}</caption>}<thead><tr>{columns.map(column => <th scope="col" key={column.key}>{column.label}</th>)}</tr></thead><tbody>{result.items.map((item, index) => <tr key={String(item.id ?? index)}>{columns.map(column => <td key={column.key}>{text(readDataPath(item, column.path))}</td>)}</tr>)}</tbody></table></div></DataCollectionState></div>;
}
