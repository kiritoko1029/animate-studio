import { createBlock, createDocument } from '../model.ts';
import type { Block, BlockFrame, BlockProps, BuiltinComponentType, PageDocument, SiteDocument } from '../model.ts';
import { createSiteDocument } from '../../shared/site-document.mjs';

export type PageTask = 'website' | 'dashboard' | 'internal';

function templateBlock(type: BuiltinComponentType, frame: BlockFrame, props: BlockProps): Block {
  const block = createBlock(type);
  return { ...block, props: { ...block.props, ...props }, frame };
}

function createDashboardDocument(): PageDocument {
  const page = createDocument(true);
  page.name = '运营数据概览 · 示例';
  page.settings = { ...page.settings, canvasHeight: 1220 };
  page.blocks = [
    templateBlock('heading', { x: 60, y: 40, width: 1800, height: 100 }, { title: '运营数据概览', fontSize: 34 }),
    templateBlock('text', { x: 60, y: 150, width: 1800, height: 72 }, { text: '本页使用可编辑的静态示例数据展示指标、图表、表格与进度，不连接真实业务接口。' }),
    templateBlock('statistic', { x: 60, y: 250, width: 420, height: 200 }, { title: '累计访问量', text: '12,840', label: '1–6 月静态示例' }),
    templateBlock('statistic', { x: 520, y: 250, width: 420, height: 200 }, { title: '累计订单量', text: '1,286', label: '1–6 月静态示例' }),
    templateBlock('statistic', { x: 980, y: 250, width: 420, height: 200 }, { title: '访问转化率', text: '4.8%', label: '静态示例指标' }),
    templateBlock('statistic', { x: 1440, y: 250, width: 420, height: 200 }, { title: '用户满意度', text: '96%', label: '静态示例指标' }),
    templateBlock('chart', { x: 60, y: 490, width: 1120, height: 460 }, { title: '访问趋势（静态示例）' }),
    templateBlock('table', { x: 1220, y: 490, width: 640, height: 460 }, {
      title: '项目进展（静态示例）',
      items: '项目名称|负责人|阶段|完成度\n官网改版|林晓|开发中|72%\n数据看板|陈默|设计中|45%\n帮助中心|许宁|已发布|100%',
    }),
    templateBlock('progress', { x: 60, y: 990, width: 870, height: 150 }, { label: '官网改版进度', text: '静态示例：已完成 72%', value: 72, max: 100 }),
    templateBlock('progress', { x: 990, y: 990, width: 870, height: 150 }, { label: '数据看板进度', text: '静态示例：已完成 45%', value: 45, max: 100 }),
  ];
  return page;
}

function createInternalDocument(): PageDocument {
  const page = createDocument(true);
  page.name = '内部成员目录 · 示例';
  page.blocks = [
    templateBlock('heading', { x: 60, y: 40, width: 1800, height: 100 }, { title: '团队成员目录', fontSize: 34 }),
    templateBlock('text', { x: 60, y: 150, width: 1800, height: 72 }, { text: '本页为静态内部工具示例，筛选与分页未连接业务数据，不执行真实增删改查。' }),
    templateBlock('input', { x: 60, y: 260, width: 560, height: 130 }, { label: '成员姓名或邮箱', text: '例如：林晓' }),
    templateBlock('select', { x: 660, y: 260, width: 560, height: 130 }, { label: '成员状态', text: '全部状态', items: '全部状态\n在职\n休假\n停用' }),
    templateBlock('button', { x: 1260, y: 260, width: 240, height: 130 }, { label: '查询', url: '', align: 'center' }),
    templateBlock('table', { x: 60, y: 440, width: 1800, height: 360 }, {
      title: '成员列表（静态示例）',
      items: '姓名|部门|角色|状态\n林晓|产品设计|设计师|在职\n陈默|工程研发|前端工程师|在职\n许宁|客户成功|客户经理|休假\n周宁|财务管理|财务专员|在职',
    }),
    templateBlock('pagination', { x: 740, y: 840, width: 440, height: 150 }, { label: '成员列表分页（示例）', value: 1, max: 5 }),
  ];
  return page;
}

export function createTaskDocument(task: PageTask): PageDocument {
  switch (task) {
    case 'website': return createDocument();
    case 'dashboard': return createDashboardDocument();
    case 'internal': return createInternalDocument();
    default: throw new Error(`不支持的页面任务：${String(task)}`);
  }
}

export function createTaskSiteDocument(task: PageTask): SiteDocument {
  const site = createSiteDocument(createTaskDocument(task));
  if (task !== 'dashboard') return site;
  const page = site.pages[0].page;
  site.pages[0].page = { ...page, blocks: page.blocks.map(block => {
    if (block.type === 'chart') return { ...block, props: { ...block.props, sourceId: 'sales', categoryField: 'month', dataColumns: [{ key: 'visitors', label: '访问量', path: 'visitors', aggregate: 'sum' }, { key: 'target', label: '目标', path: 'target', aggregate: 'sum' }] } };
    if (block.type !== 'table') return block;
    const props = { ...block.props, sourceId: 'sales', title: '月度数据（静态示例）', dataColumns: [{ key: 'month', label: '月份', path: 'month' }, { key: 'visitors', label: '访问量', path: 'visitors' }, { key: 'target', label: '目标', path: 'target' }, { key: 'orders', label: '订单量', path: 'orders' }] };
    delete props.items;
    return { ...block, props };
  }) };
  site.dataSources = [{ id: 'sales', name: '月度运营数据（示例）', kind: 'static', mode: 'collection', pageSize: 6, items: [
    { month: '1月', visitors: 1680, target: 1600, orders: 136 },
    { month: '2月', visitors: 1920, target: 1800, orders: 162 },
    { month: '3月', visitors: 2140, target: 2000, orders: 188 },
    { month: '4月', visitors: 2260, target: 2200, orders: 240 },
    { month: '5月', visitors: 2420, target: 2400, orders: 260 },
    { month: '6月', visitors: 2420, target: 2600, orders: 300 },
  ] }];
  return site;
}
