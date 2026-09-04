-- 历史迁移：为早期 D1 库补齐 accounts.available_features（账户级可选功能白名单）。
ALTER TABLE accounts ADD COLUMN available_features TEXT DEFAULT '';
