import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { config } from '../src/config';
import { encrypt, decrypt } from '../src/services/encryptionService';

// backend 加密模块使用全局 config.encryptionKey（默认 'feiyu'），
// 与 worker deriveKey('feiyu') 的 SHA-256 派生一致，因此两端可互解。

describe('encryption (backend) — P0-3 统一线格式', () => {
  let originalKey: string;

  beforeAll(() => {
    originalKey = config.encryptionKey;
    config.encryptionKey = 'feiyu';
  });

  afterAll(() => {
    config.encryptionKey = originalKey;
  });

  it('明文可加密后还原', () => {
    const plain = 'sk-example-abc123';
    const token = encrypt(plain);
    expect(decrypt(token)).toBe(plain);
  });

  it('输出为统一的 2 段格式 iv:enc（与 worker 兼容）', () => {
    const token = encrypt('hello-world');
    expect(token.split(':')).toHaveLength(2);
  });

  it('可解密旧 3 段格式 iv:tag:enc（历史数据平滑读取）', () => {
    const key = crypto.createHash('sha256').update('feiyu').digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update('legacy-secret'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const legacy = `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
    expect(decrypt(legacy)).toBe('legacy-secret');
  });

  it('可解密 worker 产出的 2 段 token（跨端迁移互操作）', () => {
    // 用 node crypto 构造与 worker（Web Crypto，12B IV + tag 内联）完全一致的 token
    const key = crypto.createHash('sha256').update('feiyu').digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update('cross-secret'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const token = `${iv.toString('hex')}:${Buffer.concat([enc, tag]).toString('hex')}`;
    expect(decrypt(token)).toBe('cross-secret');
  });
});
