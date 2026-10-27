import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChartData, buildCartesian, buildPie, chartLimits, chartRecords, recommendChartMapping, shortChartLabel } from '../src/lib/data/chart.ts';
import { configureChartFilter, filterRecords, filteredDataPage } from '../src/lib/data/filter.ts';
import { createBlock, createDocument } from '../src/model.ts';
import { createSiteDocument } from '../shared/site-document.mjs';
import { variableIsUsed } from '../shared/interaction-schema.mjs';
import { validatePage, validateSite } from '../server/validation.mjs';

const rows = [
  { month: '1月', visitors: 10, orders: 2 },
  { month: '1月', visitors: '20', orders: 3 },
  { month: '2月', visitors: -5, orders: 0 },
  { month: '3月', visitors: 'not-a-number', orders: 4 },
];

test('chart mapping recommends real dimensions, numeric measures and count fallback', () => {
  const mapping = recommendChartMapping(rows);
  assert.equal(mapping.categoryField, 'month');
  assert.deepEqual(mapping.dataColumns.map(column => column.path), ['visitors', 'orders']);
  assert.deepEqual(recommendChartMapping([{ name: '文字记录' }]).dataColumns, [{ key: 'metric1', label: '记录数', path: 'name', aggregate: 'count' }]);
  assert.equal(shortChartLabel('很长的分类名称', 5), '很长的分…');
});

test('aggregation groups duplicate categories and handles count, average, negative and invalid values', () => {
  const data = buildChartData(rows, 'month', [
    { key: 'sum', label: '访问', path: 'visitors', aggregate: 'sum' },
    { key: 'count', label: '记录', path: 'month', aggregate: 'count' },
    { key: 'avg', label: '平均', path: 'visitors', aggregate: 'avg' },
  ]);
  assert.deepEqual(data.rows.map(row => row.category), ['1月', '2月', '3月']);
  assert.deepEqual(data.rows[0].values, [30, 2, 15]);
  assert.deepEqual(data.rows[1].values, [-5, 1, -5]);
  assert.deepEqual(data.rows[2].values, [null, 1, null]);
  assert.equal(data.invalid, 2, 'invalid values are counted for each numeric metric');
  const positive = buildChartData([{ month: '1月', visitors: 5 }], 'month', [{ key: 'sum', label: '访问', path: 'visitors' }]);
  assert.equal(positive.rows[0].values[0], 5);
});

test('cartesian geometry keeps zero, negative and all-negative scales on the correct side', () => {
  const data = buildChartData([{ name: '亏损', amount: -10 }, { name: '盈利', amount: 20 }, { name: '持平', amount: 0 }], 'name', [{ key: 'amount', label: '金额', path: 'amount' }]);
  const chart = buildCartesian(data, 720, 360, 'column');
  const [loss, profit, zero] = chart.series[0].points;
  assert.equal(loss.y, chart.baseline.y1);
  assert.ok(profit.y < chart.baseline.y1);
  assert.equal(zero.height, 0);
  const horizontal = buildCartesian(data, 720, 360, 'bar');
  const [horizontalLoss, horizontalProfit] = horizontal.series[0].points;
  assert.ok(horizontalLoss.x < horizontal.baseline.x1);
  assert.equal(horizontalLoss.x + horizontalLoss.width, horizontal.baseline.x1);
  assert.equal(horizontalProfit.x, horizontal.baseline.x1);
  const negative = buildCartesian(buildChartData([{ name: '亏损', amount: -10 }], 'name', [{ key: 'amount', label: '金额', path: 'amount' }]), 720, 360, 'column');
  assert.equal(negative.baseline.y1, negative.plot.y);
});

test('pie geometry supports a full circle and a ring without pretending negative values are proportions', () => {
  const one = buildChartData([{ name: '全部', value: 10 }], 'name', [{ key: 'value', label: '数值', path: 'value' }]);
  const pie = buildPie(one, 400, 320, 50);
  assert.equal(pie.slices.length, 1);
  assert.equal(pie.slices[0].percent, 100);
  assert.equal((pie.slices[0].path.match(/A/g) ?? []).length, 4);
  assert.ok(buildPie(one, 400, 320, 0).slices[0].path.length > 30);
  const mixed = buildPie(buildChartData([{ name: '正数', value: 10 }, { name: '负数', value: -5 }, { name: '零', value: 0 }], 'name', [{ key: 'value', label: '数值', path: 'value' }]), 400, 320, 0);
  assert.equal(mixed.slices.length, 1);
  assert.equal(mixed.excluded, 2);
});

test('chart data bounds and source scope are explicit', () => {
  const data = buildChartData(Array.from({ length: chartLimits.categories + 1 }, (_, index) => ({ name: `分类${index}`, value: index })), 'name', [{ key: 'value', label: '数值', path: 'value' }]);
  assert.equal(data.rows.length, chartLimits.categories);
  assert.equal(data.omitted, 1);
  assert.deepEqual(chartRecords({ id: 'values', name: '值', kind: 'static', mode: 'collection' }, [1, '2'], []), [{ value: 1 }, { value: '2' }]);
  const current = [{ value: 1 }];
  assert.equal(chartRecords({ id: 'values', name: '值', kind: 'rest', mode: 'collection', url: '/values' }, [1, 2], current), current);
});

test('chart schema accepts display options and rejects unsafe fields, series and colors', () => {
  const page = createDocument(true), chart = createBlock('chart');
  page.blocks = [chart];
  validatePage(page);
  for (const patch of [{ chartType: 'scatter' }, { innerRadius: 100 }, { chartColors: ['red'] }, { categoryField: '__proto__.admin' }, { dataColumns: [{ key: 'bad', label: '坏', path: 'value', aggregate: 'median' }] }]) {
    assert.throws(() => validatePage({ ...page, blocks: [{ ...chart, props: { ...chart.props, ...patch } }] }));
  }
  assert.throws(() => validatePage({ ...page, blocks: [{ ...chart, props: { ...chart.props, dataColumns: Array.from({ length: 5 }, (_, index) => ({ key: `m${index}`, label: '指标', path: 'value' })) } }] }), /最多包含 4 个指标/);
});

test('local filters preserve an empty selection and never traverse prototypes', () => {
  assert.equal(filterRecords(rows, 'month', ''), rows);
  assert.equal(filterRecords(rows, 'month', '1月').length, 2);
  assert.deepEqual(filterRecords(rows, '__proto__.admin', 'x'), []);
});

test('one-step chart filtering preserves existing events and unrelated pages', () => {
  const page = createDocument(true), chart = createBlock('chart'), table = createBlock('table');
  chart.id = 'chart'; chart.props = { ...chart.props, sourceId: 'sales', categoryField: 'month' };
  chart.events = { click: [{ type: 'notify', expression: '"保留"' }] };
  table.props = { ...table.props, sourceId: 'sales', dataColumns: [{ key: 'month', label: '月份', path: 'month' }] };
  page.blocks = [chart, table];
  const site = createSiteDocument(page);
  site.dataSources = [{ id: 'sales', name: '静态数据', kind: 'static', mode: 'collection', items: [] }, { id: 'books', name: '公开数据', kind: 'rest', mode: 'collection', url: 'https://api.example.com/sales' }];
  const original = structuredClone(site);
  const result = configureChartFilter(site, site.homePageId, 'chart');
  assert.equal(result.linked, 2);
  assert.equal(result.variable, 'chartCategory');
  assert.equal(result.site.pages[0].page.variables[0].persistent, false);
  assert.equal(result.site.pages[0].page.blocks[0].events, chart.events);
  assert.equal(result.site.pages[0].page.blocks[1].props.filterVariable, 'chartCategory');
  assert.deepEqual(site, original);
  validateSite(result.site);
});

test('changing a chart source reuses the existing collection filter instead of creating a split state', () => {
  const first = createSiteDocument(createDocument(true)), chart = createBlock('chart'), table = createBlock('table');
  chart.id = 'chart'; chart.props = { ...chart.props, sourceId: 'sales', categoryField: 'month' };
  table.props = { ...table.props, sourceId: 'sales' };
  first.pages[0].page.blocks = [chart, table];
  first.dataSources = [{ id: 'sales', name: '静态数据', kind: 'static', mode: 'collection', items: [] }, { id: 'books', name: '公开数据', kind: 'rest', mode: 'collection', url: 'https://api.example.com/sales' }];
  const initial = configureChartFilter(first, first.homePageId, 'chart');
  assert.equal(initial.variable, 'chartCategory');
  const changed = structuredClone(initial.site);
  const nextChart = changed.pages[0].page.blocks.find(block => block.id === 'chart');
  const nextTable = changed.pages[0].page.blocks.find(block => block.type === 'table');
  nextChart.props.sourceId = 'books'; nextChart.props.filterVariable = '';
  nextTable.props.sourceId = 'books';
  const result = configureChartFilter(changed, changed.homePageId, 'chart');
  assert.equal(result.variable, 'chartCategory');
  assert.equal(result.skipped, 0);
  assert.equal(result.site.pages[0].page.blocks.find(block => block.id === 'chart').props.filterVariable, 'chartCategory');
  assert.equal(result.site.pages[0].page.blocks.find(block => block.type === 'table').props.filterVariable, 'chartCategory');
  assert.equal(result.site.pages[0].page.variables.some(variable => variable.name === 'chartCategory2'), false);
  assert.equal(result.site.pages[0].page.blocks[0].events, chart.events);
  validateSite(result.site);
});

test('static collection filtering recalculates local pages while REST filters only the loaded page', () => {
  const items = [{ month: '1月' }, { month: '2月' }, { month: '1月' }];
  const source = { id: 'sales', name: '销售', kind: 'static', mode: 'collection', items, pageSize: 2 };
  const result = { items: items.slice(2), value: items, page: 2, pageCount: 2 };
  const filtered = filteredDataPage(result, source, 'month', '1月');
  assert.equal(filtered.page, 1);
  assert.equal(filtered.pageCount, 1);
  assert.deepEqual(filtered.items, [items[0], items[2]]);
  assert.deepEqual(filteredDataPage(result, source, 'month', '').items, [items[2]]);
  const rest = { ...result, items: items.slice(0, 2) };
  assert.deepEqual(filteredDataPage(rest, { ...source, kind: 'rest', url: '/sales' }, 'month', '1月').items, [items[0]]);
});

test('chart selection variables are validated, protected from deletion and allow change events', () => {
  const chart = createBlock('chart');
  chart.props.filterVariable = 'category';
  const page = { ...createDocument(true), blocks: [chart] };
  assert.throws(() => validatePage(page), /文本变量/);
  page.variables = [{ name: 'category', type: 'number', initial: 0 }];
  assert.throws(() => validatePage(page), /文本变量/);
  page.variables = [{ name: 'category', type: 'string', initial: '', persistent: false }];
  chart.events = { change: [] };
  validatePage(page);
  assert.equal(variableIsUsed(page, 'category'), true);
});
