-- 为 accounts 表新增 worker_plan 字段，记录 Cloudflare 计划类型（如 "Workers Free"、"Workers Paid"、"Enterprise"）。
-- 每次测试连接时从 CF API 获取并更新。CREATE COLUMN IF NOT EXISTS 保证幂等。
ALTER TABLE accounts ADD COLUMN worker_plan TEXT DEFAULT '';
