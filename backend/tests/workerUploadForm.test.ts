import { describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import nodeFetch from 'node-fetch';
import { buildMultipartBody, createWorkerUploadForm } from '../src/services/deploy/uploadForm';

interface Received {
  contentType: string;
  contentLength: string;
  body: Buffer;
}

/** 起一个本地服务收一次请求，用于观察真实上线时的 header/body */
function captureOnce(): Promise<{ url: string; received: Promise<Received>; close: () => void }> {
  return new Promise((resolve) => {
    let settle: (r: Received) => void;
    const received = new Promise<Received>((res) => { settle = res; });
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        settle({
          contentType: String(req.headers['content-type'] || ''),
          contentLength: String(req.headers['content-length'] || ''),
          body: Buffer.concat(chunks),
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"success":true,"result":{}}');
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}/upload`, received, close: () => server.close() });
    });
  });
}

/** 按 boundary 切分 multipart body，返回 name → 内容（用于断言 part 可被还原） */
function parseParts(body: Buffer, boundary: string): Record<string, string> {
  const text = body.toString('utf-8');
  const out: Record<string, string> = {};
  for (const chunk of text.split(`--${boundary}`)) {
    const match = chunk.match(/name="([^"]+)"/);
    if (!match) continue;
    const sep = chunk.indexOf('\r\n\r\n');
    if (sep === -1) continue;
    out[match[1]] = chunk.slice(sep + 4).replace(/\r\n$/, '');
  }
  return out;
}

describe('buildMultipartBody', () => {
  it('声明的 boundary 与 body 中使用的 boundary 一致，并以结束边界收尾', () => {
    const { body, contentType } = buildMultipartBody([
      { name: 'metadata', contentType: 'application/json', content: '{"a":1}' },
      { name: 'worker.js', filename: 'worker.js', contentType: 'application/javascript+module', content: 'export default {}' },
    ]);

    expect(contentType).toMatch(/^multipart\/form-data; boundary=.+/);
    const boundary = contentType.split('boundary=')[1];
    const text = body.toString('utf-8');

    expect(text.startsWith(`--${boundary}\r\n`)).toBe(true);
    expect(text.endsWith(`--${boundary}--\r\n`)).toBe(true);
    // 非文件 part 不带 filename
    expect(text).toContain('Content-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n{"a":1}');
    expect(text).not.toContain('name="metadata"; filename=');
    expect(text).toContain('Content-Disposition: form-data; name="worker.js"; filename="worker.js"');
    expect(parseParts(body, boundary)).toEqual({ metadata: '{"a":1}', 'worker.js': 'export default {}' });
  });

  it('body 是 Buffer，Content-Length 可精确计算', () => {
    const { body } = buildMultipartBody([
      { name: 'worker.js', filename: 'worker.js', contentType: 'application/javascript+module', content: 'export default {}' },
    ]);
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body.byteLength).toBe(body.length);
  });

  /**
   * 回归用例：请求开启代理时 proxyFetch 会走 node-fetch@2，它无法序列化 undici 的 FormData
   * （body 变成 "[object FormData]"、Content-Type 变成 text/plain），Cloudflare 会以
   * 415 code 10001 拒收。手工拼 body 后必须仍是 multipart/form-data。
   */
  it('经 node-fetch 发送时保持 multipart/form-data，且各 part 可还原', async () => {
    const { url, received, close } = await captureOnce();
    try {
      const parts = [
        { name: 'metadata', contentType: 'application/json', content: JSON.stringify({ main_module: 'worker.js' }) },
        { name: 'worker.js', filename: 'worker.js', contentType: 'application/javascript+module', content: 'export default { async fetch() {} };' },
      ];
      const { body, contentType } = buildMultipartBody(parts);

      await nodeFetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': contentType, 'User-Agent': 'wrangler/4.112.0' },
        body,
      }).then((r) => r.text());

      const got = await received;
      expect(got.contentType).toBe(contentType);
      expect(got.contentType.startsWith('multipart/form-data; boundary=')).toBe(true);
      expect(Number(got.contentLength)).toBe(got.body.byteLength);
      expect(parseParts(got.body, contentType.split('boundary=')[1])).toEqual({
        metadata: JSON.stringify({ main_module: 'worker.js' }),
        'worker.js': 'export default { async fetch() {} };',
      });
    } finally {
      close();
    }
  });
});

describe('buildMultipartBody 与 undici 序列化对齐', () => {
  it('纯字符串字段不写 Content-Type 行（Pages 的 manifest/branch 等）', () => {
    const { body, boundary, contentType } = buildMultipartBody([{ name: 'manifest', content: '{"a":1}' }]);
    expect(contentType).toBe(`multipart/form-data; boundary=${boundary}`);
    expect(body.toString('utf-8')).toBe(
      `--${boundary}\r\nContent-Disposition: form-data; name="manifest"\r\n\r\n{"a":1}\r\n--${boundary}--\r\n`,
    );
  });

  it('文件 part 使用给定 MIME，可承载嵌套 multipart（Pages 的 _worker.js）', () => {
    const inner = buildMultipartBody([
      { name: 'metadata', content: '{"main_module":"_worker.js"}' },
      { name: '_worker.js', filename: '_worker.js', contentType: 'application/octet-stream', content: 'export default {}' },
    ]);
    const outer = buildMultipartBody([
      { name: '_worker.js', filename: '_worker.js', contentType: `multipart/form-data;boundary=${inner.boundary}`, content: inner.body },
    ]);

    const text = outer.body.toString('utf-8');
    expect(inner.boundary).not.toBe(outer.boundary);
    expect(text).toContain(`Content-Type: multipart/form-data;boundary=${inner.boundary}`);
    expect(text).toContain(inner.body.toString('utf-8'));
    // 内层是未经改写的一份完整 multipart：以结束边界收尾
    expect(text).toContain(`--${inner.boundary}--\r\n`);
    // 缺省 MIME 的文本文件按 octet-stream 发送（对齐 undici 对无 type File 的处理）
    const textFile = buildMultipartBody([{ name: '_routes.json', filename: '_routes.json', contentType: 'application/octet-stream', content: '{"version":1}' }]);
    expect(textFile.body.toString('utf-8')).toContain('Content-Type: application/octet-stream\r\n\r\n{"version":1}');
  });

  it('base64 资源 part（Workers Assets 桶上传）保持原始 MIME 与文件名', () => {
    const { body, boundary } = buildMultipartBody([
      { name: 'hash-a', filename: 'hash-a', contentType: 'text/javascript', content: 'ZXhwb3J0IGRlZmF1bHQge30=' },
    ]);
    const text = body.toString('utf-8');
    expect(text).toContain('Content-Disposition: form-data; name="hash-a"; filename="hash-a"');
    expect(text).toContain('Content-Type: text/javascript');
    expect(parseParts(body, boundary)['hash-a']).toBe('ZXhwb3J0IGRlZmF1bHQge30=');
  });
});

describe('createWorkerUploadForm', () => {
  it('metadata part 可解析且包含 main_module 与 bindings', () => {
    const { body, contentType } = createWorkerUploadForm({
      main: { name: 'index.js', type: 'esm', content: 'export default {}' },
      modules: [{ name: 'chunk.js', type: 'esm', content: 'export const a = 1;' }],
      sourceMaps: [],
      compatibility_date: '2025-01-01',
      compatibility_flags: ['nodejs_compat'],
    } as any, [{ type: 'plain_text', name: 'FOO', text: 'bar' }]);

    const parts = parseParts(body, contentType.split('boundary=')[1]);
    expect(JSON.parse(parts.metadata)).toMatchObject({
      main_module: 'index.js',
      compatibility_date: '2025-01-01',
      compatibility_flags: ['nodejs_compat'],
      bindings: [{ type: 'plain_text', name: 'FOO', text: 'bar' }],
    });
    expect(parts['chunk.js']).toBe('export const a = 1;');
    expect(parts['index.js']).toBe('export default {}');
  });
});
