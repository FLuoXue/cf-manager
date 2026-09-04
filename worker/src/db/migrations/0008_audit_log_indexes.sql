-- 历史迁移（P1-14）：为 audit_log 补齐时间/动作复合索引，避免大账户审计查询慢查询。
-- CREATE INDEX IF NOT EXISTS 天然幂等，全新库与旧库均安全。
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_action_created ON audit_log(action, created_at);
