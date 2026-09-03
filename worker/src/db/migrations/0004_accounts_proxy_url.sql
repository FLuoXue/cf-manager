-- 历史迁移：为早期 D1 库补齐 accounts.proxy_url。
ALTER TABLE accounts ADD COLUMN proxy_url TEXT DEFAULT '';
