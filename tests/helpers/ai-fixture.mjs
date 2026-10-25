import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

/** Local, deterministic provider fixture for browser QA. It never forwards requests or uses credentials. */
export function createAiFixture() {
  return createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Headers', 'authorization,content-type,x-api-key,anthropic-version,anthropic-dangerous-direct-browser-access');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (request.method === 'OPTIONS') { response.writeHead(204).end(); return; }
    if (request.url === '/v1/models') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ data: [{ id: 'studio-ui-test' }], has_more: false })); return; }
    if (!['/v1/responses', '/v1/messages'].includes(request.url)) { response.writeHead(404).end(); return; }
    for await (const _chunk of request) { /* Discard request content, including test credentials. */ }
    const operations = [
      { op: 'message', text: '我会用大标题、留白和三张功能卡片组织这个产品页面。每个组件完成后立即显示。' },
      { op: 'page', name: 'Forma · 创作工具', settings: { maxWidth: 1200, canvasHeight: 1200, padding: 32, background: '#faf9f6', accent: '#252321' }, summary: '设置温暖的浅色画布' },
      { op: 'add', id: 'ai-nav', type: 'navbar', frame: { x: 32, y: 32, width: 1136, height: 80 }, props: { title: 'Forma', items: '产品 | #product,理念 | #about', label: '开始创作', brandIcon: 'none' }, summary: '新增品牌导航' },
      { op: 'add', id: 'ai-headline', type: 'heading', frame: { x: 80, y: 180, width: 1040, height: 160 }, props: { title: '少一点复杂，多一点创造。', fontSize: 64, color: '#252321', align: 'left', animation: 'fade' }, summary: '新增主视觉标题' },
      { op: 'add', id: 'ai-description', type: 'text', frame: { x: 80, y: 350, width: 800, height: 100 }, props: { text: '把灵感变成看得见的作品。一个清晰的画布，让内容、设计与交互自然相遇。', fontSize: 21, color: '#5a5651' }, summary: '补充产品介绍' },
      { op: 'add', id: 'ai-action', type: 'button', frame: { x: 80, y: 470, width: 240, height: 90 }, props: { label: '开始创造', url: '#product' }, summary: '新增行动按钮' },
      { op: 'add', id: 'ai-card-one', type: 'card', frame: { x: 80, y: 660, width: 490, height: 280 }, props: { title: '让布局更自由', text: '拖放组件、调整层次，把想法放在最合适的位置。', background: '#eeece6', radius: 18 }, summary: '新增布局功能卡片' },
      { op: 'add', id: 'ai-card-two', type: 'card', frame: { x: 610, y: 660, width: 490, height: 280 }, props: { title: '让细节动起来', text: '恰到好处的动画与反馈，让作品保持轻盈。', background: '#eeece6', radius: 18 }, summary: '新增动效功能卡片' },
      { op: 'update', id: 'ai-headline', props: { color: '#40322b' }, summary: '微调标题色彩，增强层次' },
      { op: 'done', summary: '页面已完成：品牌导航、主视觉、行动按钮和两张功能卡片。你可以继续描述想修改的部分。' },
    ].map((op, index) => ({ v: 1, seq: index + 1, ...op }));
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
    const anthropic = request.url === '/v1/messages';
    const send = event => response.write(`data: ${JSON.stringify(event)}\n\n`);
    if (anthropic) send({ type: 'message_start', message: { usage: { input_tokens: 1800 } } });
    const summaries = ['先确定页面的视觉层级。', '主视觉使用大标题与留白，功能区采用并排卡片。', '接着补齐导航和行动按钮，再检查颜色与间距。'];
    let index = -summaries.length;
    const timer = setInterval(() => {
      if (index < 0) {
        const summary = summaries[index++ + summaries.length];
        send(anthropic ? { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: summary } } : { type: 'response.reasoning_summary_text.delta', delta: summary });
        return;
      }
      if (index >= operations.length) {
        clearInterval(timer);
        const finish = () => {
          if (anthropic) { send({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 900 } }); send({ type: 'message_stop' }); }
          else send({ type: 'response.completed', response: { usage: { input_tokens: 1800, output_tokens: 900 } } });
          response.end();
        };
        const end = setTimeout(finish, 3000); response.once('close', () => clearTimeout(end));
        return;
      }
      const text = JSON.stringify(operations[index++]) + '\n';
      // Split each record to exercise the same buffering as a real model stream.
      for (const part of [text.slice(0, 23), text.slice(23)]) send(anthropic ? { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: part } } : { type: 'response.output_text.delta', delta: part });
    }, 350);
    response.once('close', () => clearInterval(timer));
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = createAiFixture(); server.listen(4186, '127.0.0.1', () => console.log('AI browser fixture: http://127.0.0.1:4186/v1'));
  process.once('SIGTERM', () => server.close());
}
