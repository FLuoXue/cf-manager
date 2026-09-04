-- 历史迁移：为早期 D1 库补齐 quota_usage.exhausted（配额耗尽标记）。
ALTER TABLE quota_usage ADD COLUMN exhausted INTEGER DEFAULT 0;
