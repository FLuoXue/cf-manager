import { Context, Next } from 'hono';

/**
 * 路径规范化（P1-4）：
 * 1. 折叠连续斜杠（/api//ai -> /api/ai，所有路径）
 * 2. 仅对 /api 与 /v1 前缀：小写化（/API/AI -> /api/ai）+ 去除尾部斜杠（根路径 / 保留）
 *
 * 目的：消除 Docker(Express) 与 Worker(Hono) 两端对变形路径（双斜杠、尾部斜杠、大小写）
 * 的路由匹配结果不一致，避免路径绕过或 404/500 差异。
 * 非 API 路径（如 /admin 静态资源、SPA 路由）仅折叠双斜杠、保持原样——
 * 例如 /admin/ 不可改为 /admin，否则会与 /admin 的 302 重定向形成死循环。
 */
export function normalizePath(pathname: string): string {
  let p = pathname.replace(/\/+/g, '/');
  // 大小写不敏感地识别 API 路径（/API、/V1 等大写变体也要小写归一化）
  const isApi = p.toLowerCase().startsWith('/api') || p.toLowerCase().startsWith('/v1');
  if (isApi) {
    p = p.toLowerCase();
  }
  if (isApi && p.length > 1 && p.endsWith('/')) {
    p = p.slice(0, -1);
  }
  return p;
}

export async function canonicalizeMiddleware(c: Context, next: Next): Promise<void> {
  const url = new URL(c.req.url);
  const normalized = normalizePath(url.pathname);
  if (normalized !== url.pathname) {
    // c.rewrite 保留原始 query string（URL 构造器基于相对路径 + 原 url 保留 ?xxx）。
    // Hono v4 Context 提供 rewrite；用可选链兜底，避免极旧版本缺失该方法时让所有请求崩溃。
    (c as unknown as { rewrite?: (path: string) => void }).rewrite?.(normalized + url.search);
  }
  await next();
}
