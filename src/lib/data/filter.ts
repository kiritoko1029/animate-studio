import { readDataPath } from '../../../shared/data-sources.mjs';
import type { DataSource } from '../../../shared/data-sources.mjs';
import { chartRecords } from './chart.ts';
import type { JsonValue } from '../interactions/types.ts';
import type { SiteDocument } from '../../model.ts';

export function filterRecords<T extends Record<string, JsonValue>>(records: T[], field?: string, selected?: JsonValue): T[] {
  if (!field || selected === undefined || selected === null || selected === '') return records;
  return records.filter(record => {
    const value = readDataPath(record, field);
    return value !== undefined && value !== null && typeof value !== 'object' && String(value) === String(selected);
  });
}

type DataPage = { items: Record<string, JsonValue>[]; value: JsonValue; page: number; pageCount: number };
export function filteredDataPage<T extends DataPage>(result: T, source: DataSource | undefined, field?: string, selected?: JsonValue): T {
  const records = filterRecords(chartRecords(source, result.value, result.items), field, selected);
  if (!source || source.kind === 'rest') return { ...result, items: records };
  const pageSize = source.pageSize ?? 5, pageCount = Math.max(1, Math.ceil(records.length / pageSize)), page = Math.min(result.page, pageCount);
  return { ...result, items: records.slice((page - 1) * pageSize, page * pageSize), page, pageCount };
}

export function configureChartFilter(site: SiteDocument, pageId: string, chartId: string): { site: SiteDocument; variable: string; linked: number; skipped: number } {
  const entry = site.pages.find(page => page.id === pageId);
  if (!entry && Object.values(site.sharedLayout).some(layout => layout.id === pageId)) throw new Error('共享布局中的图表请在该布局内手动配置选择变量。');
  const chart = entry?.page.blocks.find(block => block.id === chartId);
  if (!entry || !chart || chart.type !== 'chart' || !chart.props.sourceId || !chart.props.categoryField) throw new Error('请先选择图表的数据源和分类字段。');
  if (!site.dataSources?.some(source => source.id === chart.props.sourceId && source.mode === 'collection')) throw new Error('请先在站点数据源中连接一个记录集合。');
  const variables = entry.page.variables ?? [];
  const explicit = chart.props.filterVariable ?? '';
  if (explicit && variables.some(item => item.name === explicit && item.type !== 'string')) throw new Error('分类筛选需要使用文本变量，请选择其他变量。');
  let variable = explicit;
  if (!variable) variable = entry.page.blocks.find(block => block.id !== chart.id && block.props.sourceId === chart.props.sourceId && block.props.filterVariable && variables.some(item => item.name === block.props.filterVariable && item.type === 'string'))?.props.filterVariable ?? '';
  if (!variable) {
    const base = 'chartCategory', existing = variables.find(item => item.name === base), usedElsewhere = entry.page.blocks.some(block => block.props.sourceId !== chart.props.sourceId && block.props.filterVariable === base);
    if ((!existing || existing.type === 'string') && !usedElsewhere) variable = base;
    else { let index = 2; do { variable = `${base}${index}`; index++; } while (variables.some(item => item.name === variable)); }
  }
  const existing = variables.find(item => item.name === variable);
  if (existing && existing.type !== 'string') throw new Error('分类筛选需要使用文本变量，请选择其他变量。');
  if (!existing && variables.length >= 50) throw new Error('页面变量已达到 50 个，请先整理变量后再配置筛选。');
  let linked = 0, skipped = 0;
  const blocks = entry.page.blocks.map(block => {
    if (!['chart', 'table', 'repeater'].includes(block.type) || block.props.sourceId !== chart.props.sourceId) return block;
    if (block.props.filterVariable && block.props.filterVariable !== variable) { skipped++; return block; }
    const filterField = block.type === 'chart' ? block.props.categoryField || chart.props.categoryField! : chart.props.categoryField!;
    if (block.props.filterField && block.props.filterField !== filterField) { skipped++; return block; }
    linked++;
    return { ...block, props: { ...block.props, filterVariable: variable, filterField } };
  });
  const next: SiteDocument = { ...site, pages: site.pages.map(page => page.id === pageId ? { ...page, page: { ...page.page, variables: existing ? variables : [...variables, { name: variable, type: 'string', initial: '', persistent: false }], blocks } } : page) };
  return { site: next, variable, linked, skipped };
}
