-- 历史迁移：为早期 D1 库补齐 quota_usage.optimistic（乐观计数标记）。
ALTER TABLE quota_usage ADD COLUMN optimistic INTEGER DEFAULT 0;
