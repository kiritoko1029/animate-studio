import { inferDataFields, readDataPath } from '../../../shared/data-sources.mjs';
import type { DataSource } from '../../../shared/data-sources.mjs';
import type { JsonValue } from '../interactions/types.ts';

export const chartLimits = { series: 4, categories: 60 };
export type ChartType = 'line' | 'area' | 'column' | 'bar' | 'pie';
export type ChartAggregate = 'sum' | 'count' | 'avg' | 'min' | 'max';
export type ChartRecord = Record<string, JsonValue>;
export type ChartSeries = { key: string; label: string; path: string; aggregate?: ChartAggregate };
export type ChartRow = { category: string; values: (number | null)[] };
export type ChartData = { rows: ChartRow[]; series: ChartSeries[]; invalid: number; omitted: number; groups: number };
export type ChartPoint = { category: string; series: string; value: number; x: number; y: number; width?: number; height?: number };
export type ChartSegment = { line: string; area?: string };
export type CartesianGeometry = {
  horizontal: boolean;
  plot: { x: number; y: number; width: number; height: number };
  baseline: { x1: number; y1: number; x2: number; y2: number };
  ticks: { value: number; x: number; y: number }[];
  categories: { label: string; x: number; y: number; visible: boolean }[];
  series: { key: string; label: string; segments: ChartSegment[]; points: ChartPoint[] }[];
};
export type PieSlice = ChartPoint & { path: string; percent: number; labelX: number; labelY: number };

const numberFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const compactFormat = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 });
const round = (value: number) => Number(value.toFixed(3));
const finite = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim()) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : undefined; }
  return undefined;
};
const categoryText = (value: unknown) => value === undefined || value === null || value === '' ? '未分类' : typeof value === 'object' ? JSON.stringify(value) : String(value);

export function formatChartValue(value: number) { return Number.isFinite(value) ? numberFormat.format(Object.is(value, -0) ? 0 : value) : '—'; }
export function formatAxisValue(value: number) { return Math.abs(value) >= 10000 ? compactFormat.format(value) : formatChartValue(value); }
export function shortChartLabel(value: string, max = 12) { const characters = [...value]; return characters.length > max ? `${characters.slice(0, max - 1).join('')}…` : value; }
export function chartRecord(value: JsonValue): ChartRecord { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : { value }; }
export function chartRecords(source: DataSource | undefined, value: JsonValue, currentPage: ChartRecord[]): ChartRecord[] {
  return source?.kind === 'static' && Array.isArray(value) ? value.map(chartRecord) : currentPage;
}

export function recommendChartMapping(records: ChartRecord[]): { categoryField: string; dataColumns: ChartSeries[] } {
  if (!records.length) return { categoryField: '', dataColumns: [] };
  const fields = [...new Map(records.slice(0, 20).flatMap(record => inferDataFields(record)).map(field => [field.path, field])).values()];
  const numeric = (path: string) => {
    const values = records.map(record => readDataPath(record, path)).filter(value => value !== null && value !== undefined && value !== '');
    const valid = values.filter(value => finite(value) !== undefined);
    return values.length > 0 && valid.length / values.length >= 0.5;
  };
  const numericFields = fields.filter(field => numeric(field.path));
  const category = fields.find(field => !numeric(field.path)) ?? fields[0];
  const categoryField = category?.path ?? '';
  const measures = numericFields.filter(field => field.path !== categoryField).slice(0, 2).map((field, index): ChartSeries => ({ key: `metric${index + 1}`, label: field.path, path: field.path, aggregate: 'sum' }));
  return { categoryField, dataColumns: measures.length ? measures : categoryField ? [{ key: 'metric1', label: '记录数', path: categoryField, aggregate: 'count' }] : [] };
}

function aggregateValues(records: ChartRecord[], series: ChartSeries): { value: number | null; invalid: number } {
  if ((series.aggregate ?? 'sum') === 'count') return { value: records.length, invalid: 0 };
  const values = records.map(record => finite(readDataPath(record, series.path)));
  const numbers = values.filter((value): value is number => value !== undefined);
  const invalid = values.length - numbers.length;
  if (!numbers.length) return { value: null, invalid };
  let result: number;
  if (series.aggregate === 'avg') result = numbers.reduce((mean, value, index) => mean * (index / (index + 1)) + value / (index + 1), 0);
  else if (series.aggregate === 'min') result = Math.min(...numbers);
  else if (series.aggregate === 'max') result = Math.max(...numbers);
  else result = numbers.reduce((sum, value) => sum + value, 0);
  return Number.isFinite(result) ? { value: result, invalid } : { value: null, invalid: invalid + numbers.length };
}

export function buildChartData(records: ChartRecord[], categoryField: string, series: ChartSeries[]): ChartData {
  const groups = new Map<string, ChartRecord[]>();
  for (const record of records) {
    const category = categoryText(categoryField ? readDataPath(record, categoryField) : undefined);
    const group = groups.get(category) ?? [];
    group.push(record); groups.set(category, group);
  }
  let invalid = 0;
  const rows = [...groups.entries()].map(([category, items]): ChartRow => ({
    category,
    values: series.map(item => { const result = aggregateValues(items, item); invalid += result.invalid; return result.value; }),
  }));
  return { rows: rows.slice(0, chartLimits.categories), series: [...series], invalid, omitted: Math.max(0, rows.length - chartLimits.categories), groups: groups.size };
}

function chartDomain(data: ChartData) {
  const values = data.rows.flatMap(row => row.values.filter((value): value is number => value !== null && Number.isFinite(value)));
  let min = Math.min(0, ...values), max = Math.max(0, ...values);
  if (min === max) max = min + 1;
  const padding = (max - min) * 0.08;
  if (min < 0) min -= padding;
  if (max > 0) max += padding;
  return { min, max };
}

export function buildCartesian(data: ChartData, width: number, height: number, type: Exclude<ChartType, 'pie'>): CartesianGeometry {
  const horizontal = type === 'bar';
  const margins = horizontal ? { left: 112, right: 28, top: 16, bottom: 44 } : { left: 64, right: 20, top: 16, bottom: 48 };
  const plot = { x: margins.left, y: margins.top, width: Math.max(20, width - margins.left - margins.right), height: Math.max(20, height - margins.top - margins.bottom) };
  const { min, max } = chartDomain(data), span = max - min;
  const valueX = (value: number) => plot.x + (value - min) / span * plot.width;
  const valueY = (value: number) => plot.y + (max - value) / span * plot.height;
  const zeroX = valueX(0), zeroY = valueY(0);
  const band = (horizontal ? plot.height : plot.width) / Math.max(1, data.rows.length);
  const ticks = Array.from({ length: 5 }, (_, index) => {
    const value = min + span * index / 4;
    return { value, x: horizontal ? valueX(value) : plot.x, y: horizontal ? plot.y + plot.height : valueY(value) };
  });
  const categoryStep = Math.max(1, Math.ceil(data.rows.length / Math.max(1, Math.floor((horizontal ? plot.height : plot.width) / (horizontal ? 24 : 72)))));
  const categories = data.rows.map((row, index) => ({
    label: row.category,
    x: horizontal ? plot.x - 10 : plot.x + band * (index + 0.5),
    y: horizontal ? plot.y + band * (index + 0.5) : plot.y + plot.height + 24,
    visible: index % categoryStep === 0,
  }));
  const series = data.series.map((item, seriesIndex) => {
    const points: ChartPoint[] = [], segments: ChartSegment[] = [];
    let current: ChartPoint[] = [];
    const flush = () => {
      if (!current.length) return;
      const line = current.map((point, index) => `${index ? 'L' : 'M'}${round(point.x)},${round(point.y)}`).join(' ');
      segments.push({ line, ...(type === 'area' && current.length > 1 ? { area: `${line} L${round(current.at(-1)!.x)},${round(zeroY)} L${round(current[0].x)},${round(zeroY)} Z` } : {}) });
      points.push(...current);
      current = [];
    };
    data.rows.forEach((row, rowIndex) => {
      const value = row.values[seriesIndex];
      const groupSize = band * 0.72 / Math.max(1, data.series.length);
      const groupStart = band * rowIndex + (band - groupSize * data.series.length) / 2;
      if (type === 'column' && value !== null) {
        points.push({ category: row.category, series: item.label, value, x: plot.x + groupStart + seriesIndex * groupSize, y: Math.min(zeroY, valueY(value)), width: Math.max(1, groupSize * 0.9), height: Math.abs(zeroY - valueY(value)) });
      } else if (type === 'bar' && value !== null) {
        points.push({ category: row.category, series: item.label, value, x: Math.min(zeroX, valueX(value)), y: plot.y + groupStart + seriesIndex * groupSize, width: Math.abs(zeroX - valueX(value)), height: Math.max(1, groupSize * 0.9) });
      } else if (value !== null) {
        current.push({ category: row.category, series: item.label, value, x: plot.x + band * (rowIndex + 0.5), y: valueY(value) });
      } else flush();
    });
    flush();
    return { key: item.key, label: item.label, segments, points };
  });
  return {
    horizontal, plot, ticks, categories, series,
    baseline: horizontal ? { x1: zeroX, y1: plot.y, x2: zeroX, y2: plot.y + plot.height } : { x1: plot.x, y1: zeroY, x2: plot.x + plot.width, y2: zeroY },
  };
}

function arcPoint(cx: number, cy: number, radius: number, angle: number) { return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius }; }
function fullCirclePath(cx: number, cy: number, outer: number, inner: number) {
  const path = (radius: number, sweep: number) => `M${round(cx + radius)},${round(cy)} A${round(radius)},${round(radius)} 0 1 ${sweep} ${round(cx - radius)},${round(cy)} A${round(radius)},${round(radius)} 0 1 ${sweep} ${round(cx + radius)},${round(cy)} Z`;
  return `${path(outer, 1)}${inner > 0 ? ` ${path(inner, 0)}` : ''}`;
}
export function sectorPath(cx: number, cy: number, outer: number, inner: number, start: number, end: number) {
  if (end - start >= Math.PI * 2 - 0.000001) return fullCirclePath(cx, cy, outer, inner);
  const a = arcPoint(cx, cy, outer, start), b = arcPoint(cx, cy, outer, end), large = end - start > Math.PI ? 1 : 0;
  const path = [`M${round(a.x)},${round(a.y)}`, `A${round(outer)},${round(outer)} 0 ${large} 1 ${round(b.x)},${round(b.y)}`];
  if (inner > 0) {
    const c = arcPoint(cx, cy, inner, end), d = arcPoint(cx, cy, inner, start);
    path.push(`L${round(c.x)},${round(c.y)}`, `A${round(inner)},${round(inner)} 0 ${large} 0 ${round(d.x)},${round(d.y)}`, 'Z');
  } else path.push(`L${round(cx)},${round(cy)} Z`);
  return path.join(' ');
}

export function buildPie(data: ChartData, width: number, height: number, innerRadius: number): { slices: PieSlice[]; excluded: number } {
  const metric = data.series[0]?.label ?? '指标';
  const rows = data.rows.map(row => ({ category: row.category, value: row.values[0] }));
  const total = rows.reduce((sum, row) => sum + (row.value !== null && row.value > 0 ? row.value : 0), 0);
  const cx = width / 2, cy = height / 2, outer = Math.max(24, Math.min(width, height) / 2 - 24), inner = outer * Math.max(0, Math.min(80, innerRadius)) / 100;
  let angle = -Math.PI / 2;
  const slices: PieSlice[] = [];
  for (const row of rows) {
    if (row.value === null || row.value <= 0) continue;
    const percent = total ? row.value / total : 0, end = angle + percent * Math.PI * 2, middle = (angle + end) / 2, labelRadius = inner + (outer - inner) * 0.62;
    const label = arcPoint(cx, cy, labelRadius, middle);
    slices.push({ category: row.category, series: metric, value: row.value, percent: percent * 100, path: sectorPath(cx, cy, outer, inner, angle, end), x: label.x, y: label.y, labelX: label.x, labelY: label.y });
    angle = end;
  }
  return { slices, excluded: rows.filter(row => row.value === null || row.value <= 0).length };
}
