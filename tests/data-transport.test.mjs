import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { executeDataQuery } from '../server/data-query.ts';
import { fetchNodeData } from '../server/data-query-node.ts';
import { fetchSocket } from '../server/data-socket.ts';

test('validated addresses are used for the actual connection without losing the original host', async () => {
  let connection;
  const value = await executeDataQuery({
    source: { id: 'books', name: '图书', kind: 'rest', mode: 'collection', url: 'https://api.example.com/books' },
    origin: 'https://studio.test', lookup: async () => [{ address: '93.184.216.34' }],
    connect: async input => { connection = input; return Response.json([{ id: 'a1' }]); },
    fetcher: async () => { throw new Error('must not resolve again with fetch'); },
  });
  assert.deepEqual(value, [{ id: 'a1' }]);
  assert.deepEqual(connection.addresses, ['93.184.216.34']);
  assert.equal(connection.url.hostname, 'api.example.com');
  assert.equal(connection.init.headers.get('host'), 'api.example.com');
});

test('Node HTTP connects to a validated address and preserves Host, path and response JSON', async t => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ host: req.headers.host, path: req.url }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const { port } = server.address();
  const response = await fetchNodeData({ url: new URL(`http://books.example:${port}/books?q=design`), init: { method: 'GET', headers: { Accept: 'application/json' } }, addresses: ['127.0.0.1'] });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { host: `books.example:${port}`, path: '/books?q=design' });
});

test('socket transport validates TLS host and parses a split chunked response', async () => {
  const body = JSON.stringify([{ id: 'a1' }]);
  const responseText = `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n${body.length.toString(16)}\r\n${body}\r\n0\r\n\r\n`;
  const requests = [], addresses = [], tls = [];
  let closed = false;
  const response = await fetchSocket({ url: new URL('https://api.example.com/books'), init: { method: 'GET', headers: { Accept: 'application/json' } }, addresses: ['93.184.216.34'] }, (address, options) => {
    addresses.push({ address, options });
    return {
      opened: Promise.resolve(),
      writable: new WritableStream({ write(chunk) { requests.push(new TextDecoder().decode(chunk)); } }),
      readable: new ReadableStream({ start(controller) {
        const bytes = new TextEncoder().encode(responseText);
        controller.enqueue(bytes.slice(0, 41)); controller.enqueue(bytes.slice(41, 70)); controller.enqueue(bytes.slice(70)); controller.close();
      } }),
      startTls(options) { tls.push(options); return this; },
      async close() { closed = true; },
    };
  });
  assert.deepEqual(await response.json(), [{ id: 'a1' }]);
  assert.deepEqual(addresses, [{ address: { hostname: '93.184.216.34', port: 443 }, options: { secureTransport: 'starttls', allowHalfOpen: false } }]);
  assert.deepEqual(tls, [{ expectedServerHostname: 'api.example.com' }]);
  assert.match(requests.join(''), /GET \/books HTTP\/1\.1/);
  assert.match(requests.join(''), /host: api\.example\.com/i);
  assert.equal(closed, true);
});

test('socket returns a complete content-length response without waiting for EOF', async () => {
  const body = JSON.stringify({ id: 'a1' });
  const payload = `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
  let closed = false;
  const response = await fetchSocket({ url: new URL('https://api.example.com/books/a1'), init: {}, addresses: ['93.184.216.34'] }, () => ({
    opened: Promise.resolve(), writable: new WritableStream(),
    readable: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(payload)); } }),
    startTls() { return this; }, async close() { closed = true; },
  }));
  assert.deepEqual(await response.json(), { id: 'a1' });
  assert.equal(closed, true);
});

test('cancellation closes a pending socket instead of leaving it active', async () => {
  let closed = false;
  const controller = new AbortController();
  const pending = fetchSocket({ url: new URL('https://api.example.com/slow'), init: { signal: controller.signal }, addresses: ['93.184.216.34'] }, () => ({
    opened: new Promise(() => {}),
    writable: new WritableStream(),
    readable: new ReadableStream(),
    startTls() { return this; },
    async close() { closed = true; },
  }));
  controller.abort(new Error('cancelled'));
  await assert.rejects(pending, /cancelled/);
  assert.equal(closed, true);
});
