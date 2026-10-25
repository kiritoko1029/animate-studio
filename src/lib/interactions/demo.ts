import { createBlock, createDocument } from '../../model.ts';
import type { Block, BuiltinComponentType } from '../../model.ts';

export function createInteractionDemo() {
  const page = createDocument(true);
  page.name = '组件联动 · 体验四个场景';
  page.variables = [
    { name: 'name', type: 'string', initial: '' }, { name: 'progress', type: 'number', initial: 30 },
    { name: 'agreed', type: 'boolean', initial: false }, { name: 'submitted', type: 'boolean', initial: false },
    { name: 'price', type: 'number', initial: 99 }, { name: 'quantity', type: 'number', initial: 2 }, { name: 'total', type: 'number', initial: 0 },
  ];
  page.scripts = [{ id: 'calculate-total', name: '计算订单金额', code: 'const price = Number(ctx.state.price || 0);\nconst quantity = Number(ctx.state.quantity || 0);\nctx.setState("total", price * quantity);\nctx.log("订单金额已更新：", price * quantity);' }];
  function block(type: BuiltinComponentType, x: number, y: number, width: number, height: number, props: Block['props'], extra: Partial<Block> = {}) {
    return { ...createBlock(type), props: { ...createBlock(type).props, ...props }, frame: { x, y, width, height }, ...extra };
  }
  page.blocks = [
    block('heading', 60, 80, 1800, 100, { title: '从组件，到会回应的页面', fontSize: 34 }),
    block('text', 60, 172, 1800, 80, { text: '输入姓名、拖动滑块、勾选协议，再运行你的第一段脚本。' }),
    block('input', 60, 300, 420, 130, { label: '01 · 你的名字', text: '试着输入一个名字' }, { bindings: { value: { kind: 'variable', value: 'name' } } }),
    block('text', 520, 310, 420, 110, { text: '欢迎你' }, { bindings: { text: { kind: 'expression', value: 'state.name ? "你好，" + state.name + "！" : "等待你的名字…"' } } }),
    block('slider', 980, 300, 270, 160, { label: '02 · 项目进度', value: 30 }, { bindings: { value: { kind: 'variable', value: 'progress' } } }),
    block('progress', 1270, 300, 270, 160, { label: '同步进度', value: 30 }, { bindings: { value: { kind: 'variable', value: 'progress' } } }),
    block('statistic', 1560, 300, 300, 160, { title: '当前完成度', text: '30%', label: '与滑块共享同一个变量' }, { bindings: { text: { kind: 'expression', value: 'state.progress + "%"' } } }),
    block('checkbox', 60, 580, 420, 120, { label: '03 · 我已阅读并同意协议', text: '勾选后，下面的提交按钮才可点击。' }, { bindings: { checked: { kind: 'variable', value: 'agreed' } } }),
    block('button', 60, 720, 420, 100, { label: '提交', url: '' }, { bindings: { disabled: { kind: 'expression', value: '!state.agreed' } }, events: { click: [{ type: 'set', variable: 'submitted', expression: 'true' }, { type: 'notify', expression: '"提交成功"' }] } }),
    block('alert', 520, 580, 420, 120, { title: '已收到你的确认', text: '这个提示由按钮事件控制显示。' }, { bindings: { visible: { kind: 'variable', value: 'submitted' } } }),
    block('input', 980, 580, 260, 130, { label: '04 · 单价', text: '单价' }, { bindings: { value: { kind: 'variable', value: 'price' } } }),
    block('input', 1260, 580, 260, 130, { label: '数量', text: '数量' }, { bindings: { value: { kind: 'variable', value: 'quantity' } } }),
    block('button', 980, 730, 540, 110, { label: '运行脚本，计算金额', url: '' }, { events: { click: [{ type: 'script', scriptId: 'calculate-total' }] } }),
    block('statistic', 1560, 580, 300, 260, { title: '订单金额', text: '¥0', label: '点击计算后更新' }, { bindings: { text: { kind: 'expression', value: '"¥" + state.total' } } }),
  ];
  return page;
}
