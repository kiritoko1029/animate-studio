import { useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Download, RefreshCw, Table2, X } from 'lucide-react';
import type { Block } from '../../model';
import type { ChartType, ChartData, ChartPoint, PieSlice } from '../../lib/data/chart';
import { buildCartesian, buildChartData, buildPie, chartRecords, formatAxisValue, formatChartValue, shortChartLabel } from '../../lib/data/chart';
import { downloadChart, type ChartExportFormat } from '../../lib/data/chart-export';
import { filterRecords } from '../../lib/data/filter';
import type { JsonValue } from '../../lib/interactions/types';
import { NativeRuntimeContext } from '../NativeInteractions';
import { PageBlockTheme } from '../PagePreviewTheme';
import { DataCollectionState } from './RepeaterBlock';
import { useDataSource } from './DataRuntime';
import './chart.css';

const sample = [
  { category: '1月', value: 120, target: 100 }, { category: '2月', value: 168, target: 130 },
  { category: '3月', value: 145, target: 150 }, { category: '4月', value: 210, target: 180 },
  { category: '5月', value: 236, target: 220 }, { category: '6月', value: 280, target: 250 },
];
const paletteDefaults = ['var(--page-accent)', '#6D7FCC', '#C27B4A', '#5A8A9E', '#B45F84', '#8D7A46', '#7D6AAC', '#5E8B6A'];
type Selection = { category: string; series: string; value: number | null };
type CanvasProps = {
  block: Block; data: ChartData; type: ChartType; interactive: boolean; expanded: boolean; compact: boolean;
  selected: string; onSelect: (point: Selection) => void; onExpand?: () => void;
  view: 'chart' | 'table'; setView: (view: 'chart' | 'table') => void;
  scope: string; refresh: () => void; hasSource: boolean;
};

function usePlotSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 640, height: 300 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const resize = () => { if (element.clientWidth > 0 && element.clientHeight > 0) setSize({ width: element.clientWidth, height: element.clientHeight }); };
    resize();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(resize); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, ...size };
}

function ChartCanvas({ block, data, type, interactive, expanded, compact, selected, onSelect, onExpand, view, setView, scope, refresh, hasSource }: CanvasProps) {
  const { ref, width, height } = usePlotSize();
  const svgRef = useRef<SVGSVGElement>(null), exportRef = useRef<HTMLDetailsElement>(null);
  const [tooltip, setTooltip] = useState<(ChartPoint & { percent?: number }) | null>(null);
  const [exporting, setExporting] = useState(''), [exportError, setExportError] = useState('');
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const typeIsPie = type === 'pie', cartesian = useMemo(() => typeIsPie ? null : buildCartesian(data, width, height, type), [data, width, height, type, typeIsPie]);
  const pie = useMemo(() => typeIsPie ? buildPie(data, width, height, block.props.innerRadius ?? 50) : null, [data, width, height, block.props.innerRadius, typeIsPie]);
  const palette = Array.from({ length: 8 }, (_, index) => block.props.chartColors?.[index] ?? (index === 0 && block.props.accent ? block.props.accent : paletteDefaults[index]));
  const hasValues = data.rows.some(row => row.values.some(value => value !== null)) && (!pie || pie.slices.length > 0);
  const select = (point: Selection) => { if (!interactive) return; if (compact && !expanded) onExpand?.(); else onSelect(point); };
  const exportFile = async (format: ChartExportFormat) => {
    if (!svgRef.current || exporting) return;
    setExporting(format); setExportError(''); exportRef.current?.removeAttribute('open');
    try { await downloadChart(svgRef.current, format, block.props.title || '数据图表'); }
    catch (error) { setExportError(error instanceof Error ? error.message : '图表导出失败，请稍后重试。'); }
    finally { setExporting(''); }
  };
  const mark = (point: ChartPoint & { percent?: number }, index: number, color: string, shape: ReactNode, hit: ReactNode) => {
    const isSelected = !!selected && selected === point.category;
    return <g key={`${point.series}-${point.category}-${index}`} data-chart-mark data-category={point.category} data-series={point.series} className={`chart-mark${selected && !isSelected ? ' is-muted' : ''}${isSelected ? ' is-selected' : ''}`} role="button" tabIndex={interactive ? 0 : -1} aria-label={`${point.category}，${point.series}：${formatChartValue(point.value)}${point.percent === undefined ? '' : `，占比 ${point.percent.toFixed(1)}%`}`} aria-pressed={isSelected}
      onClick={event => { event.stopPropagation(); select(point); }}
      onKeyDown={event => { if (interactive && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); select(point); } }}
      onMouseEnter={() => setTooltip(point)} onMouseLeave={() => setTooltip(null)} onFocus={() => setTooltip(point)} onBlur={() => setTooltip(null)}>
      {shape}{hit}<title>{point.category} · {point.series}：{formatChartValue(point.value)}</title>
    </g>;
  };
  const graph = typeIsPie ? <>{pie?.slices.map((slice: PieSlice, index) => mark(slice, index, palette[index % palette.length], <path d={slice.path} fill={palette[index % palette.length]} fillRule="evenodd" stroke="var(--page-surface)" strokeWidth={1}/>, <path className="chart-hit" d={slice.path} fillRule="evenodd"/>))}{block.props.showValues && pie?.slices.filter(slice => slice.percent >= 8 && Math.min(width, height) / 2 * (1 - (block.props.innerRadius ?? 50) / 100) >= 28).map(slice => <text key={`label-${slice.category}`} className="chart-value-text" x={slice.labelX} y={slice.labelY} textAnchor="middle" dominantBaseline="central">{slice.percent.toFixed(0)}%</text>)}</> : <>
    {block.props.showGrid !== false && cartesian?.ticks.map((tick, index) => <line key={`grid-${index}`} className="chart-grid" x1={cartesian.horizontal ? tick.x : cartesian.plot.x} y1={cartesian.horizontal ? cartesian.plot.y : tick.y} x2={cartesian.horizontal ? tick.x : cartesian.plot.x + cartesian.plot.width} y2={cartesian.horizontal ? cartesian.plot.y + cartesian.plot.height : tick.y}/>) }
    {cartesian && <line className="chart-baseline" {...cartesian.baseline}/>}
    {cartesian?.series.map((series, seriesIndex) => <g key={series.key}>
      {series.segments.map((segment, index) => <g key={`segment-${index}`}>{segment.area && <path d={segment.area} fill={palette[seriesIndex % palette.length]} opacity={0.14}/>}<path d={segment.line} fill="none" stroke={palette[seriesIndex % palette.length]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></g>)}
      {series.points.map((point, pointIndex) => {
        const color = palette[seriesIndex % palette.length];
        if (type === 'line' || type === 'area') return mark(point, pointIndex, color, <circle cx={point.x} cy={point.y} r={3.5} fill={color}/>, <circle className="chart-hit" cx={point.x} cy={point.y} r={12}/>);
        return mark(point, pointIndex, color, <rect x={point.x} y={point.y} width={point.width} height={point.height} rx={Math.min(3, ((type === 'bar' ? point.height : point.width) ?? 0) / 3)} fill={color}/>, <rect className="chart-hit" x={type === 'bar' ? cartesian.plot.x : point.x - 3} y={type === 'bar' ? point.y - 4 : Math.min(point.y, cartesian.baseline.y1) - 4} width={type === 'bar' ? cartesian.plot.width : (point.width ?? 0) + 6} height={type === 'bar' ? (point.height ?? 0) + 8 : (point.height ?? 0) + 8}/>);
      })}
    </g>)}
    {cartesian?.categories.map((category, index) => category.visible && <text key={`category-${index}`} className="chart-axis-text" x={category.x} y={category.y} textAnchor={cartesian.horizontal ? 'end' : 'middle'} dominantBaseline={cartesian.horizontal ? 'central' : undefined}><title>{category.label}</title>{shortChartLabel(category.label, cartesian.horizontal ? 12 : 10)}</text>)}
    {cartesian?.ticks.map((tick, index) => <text key={`tick-${index}`} className="chart-axis-text" x={cartesian.horizontal ? tick.x : tick.x - 8} y={cartesian.horizontal ? tick.y + 20 : tick.y + 3} textAnchor={cartesian.horizontal ? 'middle' : 'end'}>{formatAxisValue(tick.value)}</text>)}
    {block.props.showValues && cartesian?.series.flatMap((series, seriesIndex) => series.points.filter((_, index) => cartesian.categories[index]?.visible).map((point, pointIndex) => <text key={`value-${seriesIndex}-${pointIndex}`} className="chart-value-text" x={cartesian.horizontal ? point.x + (point.width ?? 0) / 2 : point.x + (point.width ?? 0) / 2} y={cartesian.horizontal ? point.y + (point.height ?? 0) / 2 + 3 : point.y - 7} textAnchor="middle">{formatChartValue(point.value)}</text>))}
  </>;
  const legend = block.props.showLegend === false ? [] : typeIsPie ? (pie?.slices ?? []).map((slice, index) => ({ label: slice.category, color: palette[index % palette.length] })) : data.series.map((series, index) => ({ label: series.label, color: palette[index % palette.length] }));
  return <div className="chart-canvas">
    <div className="chart-toolbar">
      <button type="button" disabled={!interactive || !hasSource} title={hasSource ? '重新读取当前数据源' : '连接数据源后可刷新'} aria-label="刷新图表数据" onClick={refresh}><RefreshCw size={13}/><span>刷新</span></button>
      <button type="button" disabled={!interactive} aria-pressed={view === 'table'} aria-label={view === 'table' ? '返回图表' : '查看数据表'} onClick={() => setView(view === 'table' ? 'chart' : 'table')}><Table2 size={13}/><span>{view === 'table' ? '返回图表' : '数据表'}</span></button>
      {view === 'chart' && hasValues && <details className="chart-export" ref={exportRef}><summary aria-label="导出图表"><Download size={13}/>{exporting ? '正在导出' : '导出'}</summary><div><button type="button" disabled={!interactive || !!exporting} onClick={() => void exportFile('svg')}>SVG<span>矢量文件</span></button><button type="button" disabled={!interactive || !!exporting} onClick={() => void exportFile('png')}>PNG<span>2 倍像素</span></button></div></details>}
      {onExpand && hasValues && <button type="button" data-chart-expand disabled={!interactive} onClick={onExpand}>放大</button>}
    </div>
    {view === 'table' ? <div className="data-chart-table" tabIndex={0} role="region" aria-label="图表数据表"><table><thead><tr><th scope="col">{block.props.categoryField || '分类'}</th>{data.series.map(series => <th scope="col" key={series.key}>{series.label}</th>)}</tr></thead><tbody>{data.rows.map(row => <tr key={row.category}><th scope="row">{row.category}</th>{row.values.map((value, index) => <td key={data.series[index]?.key}>{value === null ? '—' : formatChartValue(value)}</td>)}</tr>)}</tbody></table></div> : <div className="data-chart-plot" ref={ref} onClick={() => { if (compact && !expanded && interactive) onExpand?.(); }}>
      {!data.series.length ? <div className="data-state" role="status">请选择一个指标字段。</div> : !hasValues ? <div className="data-state" role="status">{typeIsPie && data.rows.length ? '饼图需要至少一个大于 0 的数值。' : '这些字段没有可汇总的数值，请调整指标或聚合方式。'}</div> : <svg ref={svgRef} data-chart-svg data-chart-type={type} viewBox={`0 0 ${width} ${height}`} role="group" aria-labelledby={`${id}-title ${id}-description`}>
        <title id={`${id}-title`}>{block.props.title || '数据图表'}</title><desc id={`${id}-description`}>{scope}。使用 Tab 选择数据点，按 Enter 点选；也可查看等价数据表。</desc>{graph}
      </svg>}
      {interactive && block.props.showTooltip !== false && tooltip && <div className="chart-tooltip" role="status" style={{ left: Math.max(75, Math.min(width - 75, tooltip.x + (tooltip.width ?? 0) / 2)), top: Math.max(42, tooltip.y - 10) }}><strong>{tooltip.category}</strong><small>{tooltip.series}：{formatChartValue(tooltip.value)}{tooltip.percent === undefined ? '' : ` · ${tooltip.percent.toFixed(1)}%`}</small></div>}
    </div>}
    {view === 'chart' && !!legend?.length && <div className="chart-legend" aria-label="图例">{legend.map(item => <span key={item.label}><i style={{ background: item.color }}/>{item.label}</span>)}</div>}
    <div className="chart-meta"><span>{scope}</span>{data.invalid > 0 && <span>已忽略 {data.invalid} 个无效指标值</span>}{data.omitted > 0 && <span>分类过多，仅绘制前 {data.rows.length} 组（共 {data.groups} 组）</span>}{typeIsPie && !!pie?.excluded && <span>{pie.excluded} 个非正分类未绘制</span>}{typeIsPie && block.props.dataColumns!.length > 1 && <span>饼图使用第一个指标，其他指标已保留</span>}</div>
    {exportError && <p className="chart-export-error" role="alert">{exportError}</p>}
  </div>;
}

function FocusChart({ title, theme, returnFocus, onClose, children }: { title: string; theme?: CSSProperties; returnFocus: HTMLElement | SVGElement | null; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    try { dialog.showModal(); } catch { dialog.setAttribute('open', ''); }
    return () => {
      if (dialog.open) dialog.close();
      window.requestAnimationFrame(() => { if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); });
    };
  }, []);
  return createPortal(<dialog ref={ref} className="chart-focus-dialog" style={theme} aria-label={`${title} · 放大视图`} onCancel={event => { event.preventDefault(); onClose(); }} onClose={onClose}><button type="button" autoFocus className="chart-focus-close" aria-label="关闭放大视图" onClick={() => ref.current?.close()}><X size={18}/></button>{children}</dialog>, document.body);
}

export function ChartBlock({ block, interactive }: { block: Block; interactive: boolean }) {
  const p = block.props, result = useDataSource(p.sourceId), runtimeContext = useContext(NativeRuntimeContext), theme = useContext(PageBlockTheme);
  const type = p.chartType ?? 'line', demo = !p.sourceId;
  const [expanded, setExpanded] = useState(false), [view, setView] = useState<'chart' | 'table'>('chart'), [localSelection, setLocalSelection] = useState('');
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches);
  useEffect(() => { const query = window.matchMedia('(max-width: 640px)'), update = () => setCompact(query.matches); query.addEventListener('change', update); return () => query.removeEventListener('change', update); }, []);
  const linked = p.filterVariable ? runtimeContext?.state[p.filterVariable] : undefined;
  useEffect(() => { if (linked !== undefined) setLocalSelection(String(linked)); }, [linked]);
  const selected = linked === undefined ? localSelection : String(linked);
  const records = useMemo(() => chartRecords(result.source, result.value, demo ? sample : result.items), [result.source, result.value, result.items, demo]);
  const filtered = useMemo(() => filterRecords(records, p.filterField || (p.filterVariable ? p.categoryField : ''), selected), [records, p.filterField, p.filterVariable, p.categoryField, selected]);
  const data = useMemo(() => buildChartData(filtered, p.categoryField ?? '', (p.dataColumns ?? []).slice(0, type === 'pie' ? 1 : 4)), [filtered, p.categoryField, p.dataColumns, type]);
  const scope = demo ? '内置示例 · 选择数据源后替换' : result.source?.kind === 'collection' ? `全部 ${records.length} 条集合记录${filtered.length !== records.length ? ` · 筛选后 ${filtered.length} 条` : ''}` : result.source?.kind === 'static' ? `全部 ${records.length} 条静态记录${filtered.length !== records.length ? ` · 筛选后 ${filtered.length} 条` : ''}` : `第 ${result.page} 页 · ${records.length} 条记录${filtered.length !== records.length ? ` · 筛选后 ${filtered.length} 条` : ''}`;
  const select = (point: Selection) => {
    const category = selected === point.category ? '' : point.category;
    setLocalSelection(category);
    if (p.filterVariable && runtimeContext && Object.hasOwn(runtimeContext.state, p.filterVariable)) runtimeContext.runtime.setState(p.filterVariable, category);
    if (runtimeContext) void runtimeContext.runtime.dispatch(block.id, 'change', { category, series: category ? point.series : '', value: category ? point.value : null });
  };
  const returnFocus = useRef<HTMLElement | SVGElement | null>(null);
  const openFocus = () => {
    const active = document.activeElement;
    returnFocus.current = active instanceof HTMLElement || active instanceof SVGElement ? active : null;
    setExpanded(true);
  };
  const widget = (isExpanded: boolean) => {
    const canvas = <ChartCanvas block={block} data={data} type={type} interactive={interactive} expanded={isExpanded} compact={compact} selected={selected} onSelect={select} onExpand={isExpanded ? undefined : openFocus} view={view} setView={setView} scope={scope} refresh={result.refresh} hasSource={!!result.source}/>;
    return <div className="chart-widget"><div className="data-chart-heading"><h3>{p.title || '数据图表'}</h3>{demo ? <span>示例数据</span> : selected && <button type="button" data-chart-clear className="chart-filter" disabled={!interactive} onClick={() => select({ category: selected, series: '', value: null })}>清除筛选：{selected}</button>}</div>{demo ? canvas : <DataCollectionState result={{ ...result, items: filtered }} interactive={interactive} pagination={result.source?.kind === 'rest'}>{canvas}</DataCollectionState>}</div>;
  };
  return <><section className="data-chart" inert={expanded}>{widget(false)}</section>{expanded && <FocusChart title={p.title || '数据图表'} theme={theme} returnFocus={returnFocus.current} onClose={() => setExpanded(false)}>{widget(true)}</FocusChart>}</>;
}
