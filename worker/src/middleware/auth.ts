import { createMiddleware } from 'hono/factory';
import type { Env } from '../types';

export const authMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  // 未配置 API_SECRET 时跳过鉴权（开发/演示场景，向后兼容已有部署）。
  // 注意：这会导致所有管理接口处于无鉴权状态，存在安全风险，仅建议本地/内网使用。
  if (!c.env.API_SECRET) {
    await next();
    return;
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' } }, 401);
  }

  if (authHeader.substring(7) !== c.env.API_SECRET) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Invalid API secret' } }, 403);
  }

  await next();
});
