import { createMiddleware } from 'hono/factory';
import type { Env } from '../types';

export const errorHandler = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  try {
    await next();
  } catch (err: any) {
    const status = err.statusCode || err.status || 500;
    const message = err.message || 'Internal server error';
    const code = err.code || 'INTERNAL_ERROR';
    console.error(`[Error] ${c.req.method} ${c.req.path}: ${message}`);
    // P1-11: 与 backend responseWrapper 对齐；OpenAI 兼容路径用 OpenAI 错误体，内部 /api 用 {success:false,error}
    const path = c.req.path;
    if (path.startsWith('/v1') || path.startsWith('/api/v1')) {
      return c.json(
        { error: { message, type: status >= 500 ? 'server_error' : 'invalid_request_error', code } },
        status,
      );
    }
    return c.json({ success: false, error: { code, message } }, status);
  }
});
