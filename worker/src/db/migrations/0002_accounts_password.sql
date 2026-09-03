-- 历史迁移：为早期 D1 库补齐 accounts.password（明文密钥已停用，存加密后的密码）。
ALTER TABLE accounts ADD COLUMN password TEXT;
