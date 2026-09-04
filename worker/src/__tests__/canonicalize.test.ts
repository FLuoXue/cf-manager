import { describe, it, expect } from 'vitest';
import { normalizePath } from '../middleware/canonicalize';

describe('normalizePath (worker, P1-4)', () => {
  it('折叠连续斜杠', () => {
    expect(normalizePath('/api//ai')).toBe('/api/ai');
    expect(normalizePath('/api///dns')).toBe('/api/dns');
    expect(normalizePath('//api//ai//')).toBe('/api/ai');
  });

  it('去除尾部斜杠（根路径保留）', () => {
    expect(normalizePath('/api/ai/')).toBe('/api/ai');
    expect(normalizePath('/')).toBe('/');
    expect(normalizePath('//')).toBe('/');
  });

  it('对 /api 与 /v1 路径小写化', () => {
    expect(normalizePath('/API/AI')).toBe('/api/ai');
    expect(normalizePath('/V1/CHAT/COMPLETIONS')).toBe('/v1/chat/completions');
    expect(normalizePath('/api/V1/Models')).toBe('/api/v1/models');
  });

  it('不 lowercase 非 API 路径（保护 /admin 静态资源大小写）', () => {
    expect(normalizePath('/admin/Index.html')).toBe('/admin/Index.html');
    expect(normalizePath('/SomeAsset.JS')).toBe('/SomeAsset.JS');
  });

  it('非 API 路径保留尾部斜杠（避免 /admin/ 重定向死循环）', () => {
    expect(normalizePath('/admin/')).toBe('/admin/');
    expect(normalizePath('/admin//assets/app.js')).toBe('/admin/assets/app.js');
  });
});
