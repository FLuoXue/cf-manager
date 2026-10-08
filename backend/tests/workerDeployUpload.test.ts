import { describe, expect, it, vi } from 'vitest';

/**
 * 回归用例（走代理的部署通道）：
 * deployWorker 此前用 FormData 组装上传体，一旦账户走了代理，proxyFetch 会切到 node-fetch@2，
 * 它无法序列化 undici 的 FormData —— body 变成 "[object FormData]"、Content-Type 变成 text/plain，
 * Cloudflare 直接返回 415 code 10001。这里断言真实调用 proxyFetch 时下发的是手工拼的 Buffer +
 * multipart Content-Type。
 */
const { proxyFetchMock } = vi.hoisted(() => ({ proxyFetchMock: vi.fn() }));

vi.mock('../src/services/proxyService', () => ({
  proxyFetch: proxyFetchMock,
  buildCurlCommand: () => '',
  getHttpAgent: () => undefined,
  getHttpAgentForAccount: () => undefined,
  isProxyEnabled: () => true,
}));

function okJson(result: unknown = { version_id: 'v1' }) {
  return { ok: true, status: 200, json: async () => ({ success: true, result }), text: async () => '' };
}

describe('deployWorker 上传请求', () => {
  it('脚本上传使用 multipart Buffer 显式声明 Content-Type', async () => {
    const { deployWorker } = await import('../src/services/workerService');
    const { encrypt } = await import('../src/services/encryptionService');

    proxyFetchMock.mockReset();
    proxyFetchMock.mockImplementation(async (url: string, init: any) => {
      // 脚本存在性检查：返回 404 走「首次创建」分支
      if (!init || !init.method) return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
      // 可观测性等收尾请求
      return okJson();
    });

    const account = {
      id: 1, name: 'test', auth_type: 'token',
      api_token: encrypt('test-token'), api_key: null, email: null,
      account_id: 'acc-1', is_active: 1, enabled_features: 'ai,workers',
      available_features: '', worker_plan: 'free', proxy_url: '', proxy_enabled: 0,
      created_at: '', updated_at: '', password: null,
    } as any;

    const script = 'export default { async fetch() { return new Response("ok"); } };';
    await deployWorker(account, 'demo-worker', script, {} as any);

    const upload = proxyFetchMock.mock.calls.find(
      ([url, init]: any[]) => String(url).includes('/workers/scripts/demo-worker') && init?.method === 'PUT',
    );
    expect(upload, 'expected a PUT to /workers/scripts/demo-worker').toBeTruthy();

    const init = upload![1];
    expect(String(init.headers['Content-Type'])).toMatch(/^multipart\/form-data; boundary=.+/);
    expect(Buffer.isBuffer(init.body)).toBe(true);

    const text = (init.body as Buffer).toString('utf-8');
    const boundary = String(init.headers['Content-Type']).split('boundary=')[1];
    expect(text.startsWith(`--${boundary}\r\n`)).toBe(true);
    expect(text.endsWith(`--${boundary}--\r\n`)).toBe(true);
    // metadata part 与模块 part 都在，且内容正确
    expect(text).toContain('Content-Disposition: form-data; name="metadata"');
    expect(text).toContain('Content-Disposition: form-data; name="worker.js"; filename="worker.js"');
    expect(text).toContain(script);
    expect(text).not.toContain('[object FormData]');
  });
});
