﻿import { Hono } from 'hono';
import type { Env } from '../types';
import { getAccountById, addAuditLog } from '../db/models';
import { getAuthHeaders } from '../services/cfApi';
import { trackUsage } from '../services/quotaTracker';
import { acquireToken, markAccountExhausted, getBrowserRenderStatus } from '../services/browserRateLimiter';
import { logger } from '../services/logger';
import { assertRenderUrlSafe } from '../services/ssrfGuard';

type RenderMode = 'screenshot' | 'content' | 'markdown' | 'pdf' | 'links';
const VALID_MODES: RenderMode[] = ['screenshot', 'content', 'markdown', 'pdf', 'links'];
// 浏览器引擎：chrome（默认 Chromium）或 kitesurf（Cloudflare 新一代引擎）
type BrowserEngine = 'chrome' | 'kitesurf';
const VALID_BROWSERS: BrowserEngine[] = ['chrome', 'kitesurf'];

/** 当 retry-after 超过此阈值（秒）时，判定为 CF 日限额用尽，而非短时速率限制。 */
const DAILY_LIMIT_RETRY_AFTER_THRESHOLD = 60;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

interface RenderOutcome {
  status: number;
  body: any;
}

/** 判断 CF 返回的错误是否为日限额耗尽（需要切换账户）。 */
function isDailyLimitError(message: string, retryAfter: number): boolean {
  if (message.includes('Browser time limit exceeded') || message.includes('browser limit')) {
    return true;
  }
  if (retryAfter > DAILY_LIMIT_RETRY_AFTER_THRESHOLD) {
    return true;
  }
  return false;
}

/** 提取 CF 响应里的 retry-after 头（秒）。 */
function parseRetryAfter(resp: Response): number {
  const raw = resp.headers.get('retry-after') || '0';
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** 实际调用 CF browser-rendering（Browser Run）API 并解析响应。失败时抛出带 statusCode/retryAfter 的错误。 */
async function callCfRender(account: any, url: string, mode: RenderMode, env: Env, browser: BrowserEngine = 'chrome'): Promise<any> {
  const headers = await getAuthHeaders(account, env.ENCRYPTION_KEY);
  // Kitesurf 引擎通过向 Quick Action 端点追加 ?browser=kitesurf 启用
  const query = browser === 'kitesurf' ? '?browser=kitesurf' : '';
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account.account_id}/browser-rendering/${mode}${query}`;
  const startTime = Date.now();

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });

  // 错误响应：记录用量后抛出
  if (!resp.ok) {
    const browserMs = parseInt(resp.headers.get('x-browser-ms-used') || '0', 10);
    if (browserMs > 0) {
      await trackUsage(env.DB, account.id, 'browser_render_seconds', Math.ceil(browserMs / 1000));
    }
    const retryAfter = parseRetryAfter(resp);
    const text = await resp.text();
    const err: any = new Error(`${mode} failed (${resp.status}): ${text}`);
    err.statusCode = resp.status;
    err.retryAfter = retryAfter;
    throw err;
  }

  // 成功响应：记录用量并解析结果
  const browserMsUsed = parseInt(resp.headers.get('x-browser-ms-used') || '0', 10);
  const duration = browserMsUsed > 0 ? browserMsUsed / 1000 : (Date.now() - startTime) / 1000;
  await trackUsage(env.DB, account.id, 'browser_render_seconds', Math.ceil(duration));

  const contentType = resp.headers.get('content-type') || '';
  const result: any = { mode, duration, browserMsUsed };

  switch (mode) {
    case 'screenshot': {
      const buf = await resp.arrayBuffer();
      result.screenshot = `data:image/png;base64,${arrayBufferToBase64(buf)}`;
      break;
    }
    case 'pdf': {
      const buf = await resp.arrayBuffer();
      result.pdf = `data:application/pdf;base64,${arrayBufferToBase64(buf)}`;
      break;
    }
    case 'content': {
      if (contentType.includes('application/json')) {
        const json = await resp.json() as any;
        result.html = json.result || JSON.stringify(json);
      } else {
        result.html = await resp.text();
      }
      break;
    }
    case 'markdown': {
      if (contentType.includes('application/json')) {
        const json = await resp.json() as any;
        result.markdown = json.result || JSON.stringify(json);
      } else {
        result.markdown = await resp.text();
      }
      break;
    }
    case 'links': {
      const json = await resp.json() as any;
      result.links = json.result ?? json;
      break;
    }
  }

  await addAuditLog(env.DB, {
    account_id: account.id,
    action: 'browser_render',
    target: url,
    detail: `mode=${mode} browser=${browser} ${browserMsUsed}ms`,
    status: 'success',
  });

  return result;
}

/** 处理一次渲染请求，包含日限额故障转移。 */
async function handleRender(url: string, mode: RenderMode, env: Env, specifiedAccountId?: number, browser: BrowserEngine = 'chrome'): Promise<RenderOutcome> {
  let account: any;

  // 1. 选账户：指定 accountId 直接用；未指定走令牌桶
  if (specifiedAccountId) {
    const found = await getAccountById(env.DB, specifiedAccountId);
    if (!found) {
      return {
        status: 404,
        body: { error: { message: `Account ${specifiedAccountId} not found`, code: 'ACCOUNT_NOT_FOUND' } },
      };
    }
    account = found;
  } else {
    const tokenResult = await acquireToken(env);
    if (tokenResult.type === 'all_exhausted') {
      return {
        status: 429,
        body: { error: { message: '所有账户今日浏览器渲染配额已耗尽', code: 'ALL_ACCOUNTS_EXHAUSTED' } },
      };
    }
    if (tokenResult.type === 'rate_limited') {
      return {
        status: 429,
        body: {
          error: {
            message: `请求过于频繁，请等待 ${Math.ceil(tokenResult.waitMs / 1000)} 秒后重试`,
            code: 'RATE_LIMITED',
            waitMs: tokenResult.waitMs,
          },
        },
      };
    }
    account = tokenResult.account;
  }

  // 2. 第一次尝试
  try {
    const result = await callCfRender(account, url, mode, env, browser);
    return { status: 200, body: result };
  } catch (err: any) {
    const message = err?.message || '';
    const statusCode = err?.statusCode || 500;
    const retryAfter: number = err?.retryAfter || 0;

    // 3. 日限额耗尽：标记账户并尝试切换（仅未指定 accountId 时自动转移）
    if (isDailyLimitError(message, retryAfter)) {
      await markAccountExhausted(env, account.id);
      await addAuditLog(env.DB, {
        account_id: account.id,
        action: 'browser_render',
        target: url,
        detail: 'daily limit exceeded',
        status: 'error',
      });
      logger.warn('BrowserRender', `account ${account.id} daily limit exceeded, trying fallback`);

      if (!specifiedAccountId) {
        const retry = await acquireToken(env);
        if (retry.type === 'ok') {
          try {
            const result = await callCfRender(retry.account, url, mode, env, browser);
            return { status: 200, body: result };
          } catch (retryErr: any) {
            return {
              status: retryErr?.statusCode || 500,
              body: { error: { message: retryErr.message, code: 'RENDER_FAILED' } },
            };
          }
        }
        if (retry.type === 'rate_limited') {
          return {
            status: 429,
            body: {
              error: {
                message: `当前账户已耗尽，备用账户冷却中，请等待 ${Math.ceil(retry.waitMs / 1000)} 秒`,
                code: 'RATE_LIMITED',
                waitMs: retry.waitMs,
              },
            },
          };
        }
        return {
          status: 429,
          body: { error: { message: '所有账户今日浏览器渲染配额已耗尽', code: 'ALL_ACCOUNTS_EXHAUSTED' } },
        };
      }
      // 指定了 accountId 的情况：不自动切换，直接返回错误
    }

    // 4. 短时 429：透传 retry-after
    if (statusCode === 429) {
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : 10_000;
      return {
        status: 429,
        body: { error: { message, code: 'RATE_LIMITED', waitMs } },
      };
    }

    return {
      status: statusCode,
      body: { error: { message, code: 'RENDER_FAILED' } },
    };
  }
}

const app = new Hono<{ Bindings: Env }>();

app.post('/', async (c) => {
  const { url, mode = 'screenshot', browser = 'chrome', accountId } = await c.req.json();

  if (!url || typeof url !== 'string') {
    return c.json({ error: { message: 'url is required', code: 'INVALID_REQUEST' } }, 400);
  }
  try {
    assertRenderUrlSafe(url, c.env);
  } catch (e: any) {
    return c.json({ error: { message: e?.message || 'Invalid URL', code: 'INVALID_URL' } }, e?.statusCode || 400);
  }
  if (!VALID_MODES.includes(mode)) {
    return c.json({ error: { message: `Invalid mode: ${mode}. Supported: ${VALID_MODES.join(', ')}`, code: 'INVALID_MODE' } }, 400);
  }
  if (browser && !VALID_BROWSERS.includes(browser)) {
    return c.json({ error: { message: `Invalid browser: ${browser}. Supported: ${VALID_BROWSERS.join(', ')}`, code: 'INVALID_BROWSER' } }, 400);
  }

  const outcome = await handleRender(url, mode, c.env, accountId, browser);
  return c.json(outcome.body, outcome.status as any);
});

// ============ 外部 API 端点（与 backend externalBrowserRender 对称） ============

// POST /render — 外部渲染请求（不经过 responseWrapper）
app.post('/render', async (c) => {
  const { url, mode = 'screenshot', browser = 'chrome', accountId } = await c.req.json();

  if (!url || typeof url !== 'string') {
    return c.json({ error: { message: 'url is required', code: 'INVALID_REQUEST' } }, 400);
  }
  try {
    assertRenderUrlSafe(url, c.env);
  } catch (e: any) {
    return c.json({ error: { message: e?.message || 'Invalid URL', code: 'INVALID_URL' } }, e?.statusCode || 400);
  }
  if (!VALID_MODES.includes(mode)) {
    return c.json({ error: { message: `Invalid mode: ${mode}. Supported: ${VALID_MODES.join(', ')}`, code: 'INVALID_MODE' } }, 400);
  }
  if (browser && !VALID_BROWSERS.includes(browser)) {
    return c.json({ error: { message: `Invalid browser: ${browser}. Supported: ${VALID_BROWSERS.join(', ')}`, code: 'INVALID_BROWSER' } }, 400);
  }

  const outcome = await handleRender(url, mode, c.env, accountId, browser);
  return c.json(outcome.body, outcome.status as any);
});

// GET /status — 浏览器渲染配额状态
app.get('/status', async (c) => {
  const status = await getBrowserRenderStatus(c.env);
  return c.json(status);
});

export default app;
