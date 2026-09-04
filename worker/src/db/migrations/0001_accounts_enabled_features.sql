-- 历史迁移：为早于 v2.0.0 的 D1 库补齐 accounts.enabled_features。
-- 全新库已由 schema.sql 包含，运行时 _migrations 会标记本迁移为已应用并跳过。
-- D1 不支持 ADD COLUMN IF NOT EXISTS，故由 migrate.mjs 按「列已存在」幂等跳过。
ALTER TABLE accounts ADD COLUMN enabled_features TEXT DEFAULT 'ai,workers,browser_render,dns,storage';
