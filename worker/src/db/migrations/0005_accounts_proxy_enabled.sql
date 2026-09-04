-- 历史迁移：为早期 D1 库补齐 accounts.proxy_enabled。
ALTER TABLE accounts ADD COLUMN proxy_enabled INTEGER DEFAULT 0;
