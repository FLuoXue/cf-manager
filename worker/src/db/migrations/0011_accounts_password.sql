-- 重新引入 accounts.password（登录密码）：仅作人工留存的备注字段，程序不参与任何鉴权。
--
-- 背景：上游 v2.2.0 曾用 0009_accounts_drop_password 删除该列，本实例需要保留它，
-- 故已删除那个删列迁移文件。此前已应用过 0009_accounts_drop_password 的库不受影响
-- （版本已记录在 _migrations，文件删除不会重放），由本迁移把列补回，列为空。
--
-- 幂等：全新库由 schema.sql 建表（已含该列），本迁移命中 duplicate column name，
-- migrate.mjs 已将其视为幂等成功并照常记录版本。
ALTER TABLE accounts ADD COLUMN password TEXT;
