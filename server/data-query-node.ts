import { lookup } from 'node:dns';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { dataSourceLimits } from '../shared/data-sources.mjs';
import type { DataConnection } from './data-socket.ts';

export function lookupNode(hostname: string): Promise<{ address: string }[]> {
  return new Promise((resolve, reject) => lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) reject(new Error('数据接口地址解析失败。'));
    else resolve(addresses);
  }));
}
export function fetchNodeData({ url, init, addresses }: DataConnection): Promise<Response> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => { headers[key] = value; });
    headers.Host = url.host; headers['Accept-Encoding'] = 'identity';
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)({
      hostname: addresses[0], port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
      path: `${url.pathname}${url.search}`, method: init.method ?? 'GET', headers,
      servername: url.hostname.replace(/^\[|\]$/g, ''), signal: init.signal,
    }, response => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.byteLength;
        if (size > dataSourceLimits.responseBytes) { response.destroy(new Error('接口响应超过 1 MiB。')); return; }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(response.headers)) for (const item of Array.isArray(value) ? value : [value]) if (item !== undefined) headers.append(key, String(item));
        resolve(new Response(new Uint8Array(Buffer.concat(chunks)), { status: response.statusCode ?? 500, statusText: response.statusMessage, headers }));
      });
    });
    request.on('error', reject);
    if (init.body !== undefined && init.body !== null) request.write(init.body);
    request.end();
  });
}
