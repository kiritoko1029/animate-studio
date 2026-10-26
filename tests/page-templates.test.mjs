import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument } from '../src/model.ts';
import { createTaskDocument } from '../src/lib/page-templates.ts';
import { validatePage } from '../server/validation.mjs';

const tasks = ['website', 'dashboard', 'internal'];

function contentShape(page) {
  return {
    name: page.name,
    settings: page.settings,
    blocks: page.blocks.map(({ type, props, frame }) => ({ type, props, frame })),
  };
}

test('all task documents pass strict validation on a 1080p free canvas with unique block IDs', () => {
  for (const task of tasks) {
    const page = createTaskDocument(task);
    assert.doesNotThrow(() => validatePage(page), task);
    assert.equal(page.version, 1);
    assert.equal(page.settings.layout, 'free');
    assert.equal(page.settings.maxWidth, 1920);
    assert.equal(page.settings.canvasHeight, 1080);
    assert.match(page.name, /[一-鿿]/);
    assert.ok(page.blocks.length > 0);
    assert.equal(new Set(page.blocks.map(block => block.id)).size, page.blocks.length, task);
  }
});

test('all task frames stay inside the canvas without overlapping', () => {
  for (const task of tasks) {
    const page = createTaskDocument(task);
    for (const block of page.blocks) {
      const frame = block.frame;
      assert.ok(frame, `${task}: ${block.id} has a frame`);
      for (const value of Object.values(frame)) assert.ok(Number.isFinite(value), `${task}: ${block.id}`);
      assert.ok(frame.x >= 0 && frame.y >= 0, `${task}: ${block.id} starts inside the canvas`);
      assert.ok(frame.width >= 40 && frame.height >= 32, `${task}: ${block.id} has a valid size`);
      assert.ok(frame.x + frame.width <= page.settings.maxWidth, `${task}: ${block.id} fits horizontally`);
      assert.ok(frame.y + frame.height <= page.settings.canvasHeight, `${task}: ${block.id} fits vertically`);
    }
    for (let i = 0; i < page.blocks.length; i++) {
      const a = page.blocks[i].frame;
      for (let j = i + 1; j < page.blocks.length; j++) {
        const b = page.blocks[j].frame;
        const overlaps = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
        assert.equal(overlaps, false, `${task}: ${page.blocks[i].id} overlaps ${page.blocks[j].id}`);
      }
    }
  }
});

test('website reuses the inspiration template and task templates contain their key example content', () => {
  assert.deepEqual(contentShape(createTaskDocument('website')), contentShape(createDocument()));

  const dashboard = createTaskDocument('dashboard');
  for (const type of ['heading', 'statistic', 'table', 'progress']) {
    assert.ok(dashboard.blocks.some(block => block.type === type), `dashboard includes ${type}`);
  }
  assert.ok(dashboard.blocks.some(block => block.type === 'statistic' && block.props.text === '12,840'));
  assert.match(dashboard.blocks.find(block => block.type === 'text').props.text, /静态示例数据/);
  assert.match(dashboard.blocks.find(block => block.type === 'table').props.items, /官网改版\|林晓\|开发中\|72%/);
  assert.ok(dashboard.blocks.some(block => block.type === 'progress' && block.props.value === 72));

  const internal = createTaskDocument('internal');
  for (const type of ['heading', 'input', 'select', 'button', 'table', 'pagination']) {
    assert.ok(internal.blocks.some(block => block.type === type), `internal includes ${type}`);
  }
  assert.equal(internal.blocks.find(block => block.type === 'input').props.label, '成员姓名或邮箱');
  assert.match(internal.blocks.find(block => block.type === 'select').props.items, /在职\n休假\n停用/);
  assert.match(internal.blocks.find(block => block.type === 'text').props.text, /不执行真实增删改查/);
  assert.match(internal.blocks.find(block => block.type === 'table').props.items, /陈默\|工程研发\|前端工程师\|在职/);
  assert.equal(internal.blocks.find(block => block.type === 'pagination').props.max, 5);
});

test('repeated creation never shares page or block IDs', () => {
  const pages = [...tasks, ...tasks].map(task => createTaskDocument(task));
  assert.equal(new Set(pages.map(page => page.id)).size, pages.length);
  const blockIds = pages.flatMap(page => page.blocks.map(block => block.id));
  assert.equal(new Set(blockIds).size, blockIds.length);
});
