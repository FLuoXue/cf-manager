<template>
  <div
    class="autofit-table-wrapper"
    :class="{
      'autofit-table--fit': autoHeight,
      'autofit-table--glass': glass,
    }"
  >
    <!-- 可选表格顶栏工具区 -->
    <div v-if="$slots.header || title" class="autofit-table__header">
      <slot name="header">
        <span class="autofit-table__title">{{ title }}</span>
      </slot>
    </div>

    <!-- 表格主体容器：自适应撑满与内部滚动 -->
    <div class="autofit-table__body">
      <n-data-table
        ref="tableRef"
        v-bind="$attrs"
        :scroll-x="scrollX"
        :size="size"
        :bordered="bordered"
        :flex-height="autoHeight"
      >
        <!-- 透传 n-data-table 支持的所有具名插槽 -->
        <template v-for="(_, slotName) in $slots" #[slotName]="slotProps">
          <slot :name="slotName" v-bind="slotProps" />
        </template>
      </n-data-table>
    </div>

    <!-- 可选固底栏：用于统计汇总、批量选中提示、分页等 -->
    <div v-if="$slots.footer" class="autofit-table__footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useAttrs } from 'vue';
import type { DataTableInst } from 'naive-ui';

interface AutoFitTableProps {
  /** 是否开启自动吸收父容器剩余高度（开启后 flex-height 且表头吸顶固定） */
  autoHeight?: boolean;
  /** 是否应用磨砂玻璃背景容器 */
  glass?: boolean;
  /** 表格尺寸，默认 small */
  size?: 'small' | 'medium' | 'large';
  /** 是否显示内部边框，默认 false */
  bordered?: boolean;
  /** 表格标题 */
  title?: string;
}

withDefaults(defineProps<AutoFitTableProps>(), {
  autoHeight: true,
  glass: true,
  size: 'small',
  bordered: false,
  title: '',
});

const tableRef = ref<DataTableInst | null>(null);

const attrs = useAttrs();

/**
 * 横向滚动宽度 = max(显式传入的 scroll-x, 列宽合计)。
 * Naive 会用 scroll-x 作为横向滚动内容宽度：一旦列宽合计超过它，
 * 表格实际比内容容器更宽，最右侧的列会被裁掉且无法滚动到（移动端尤为明显）。
 */
const scrollX = computed<number | undefined>(() => {
  const raw = (attrs as Record<string, unknown>)['scroll-x'] ?? (attrs as Record<string, unknown>).scrollX;
  const provided = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10) || 0;

  const columns = (attrs as Record<string, unknown>).columns;
  if (!Array.isArray(columns)) return provided || undefined;

  const total = columns.reduce((sum, column) => {
    const width = (column as { width?: number | string } | null)?.width;
    if (typeof width === 'number') return sum + width;
    if (typeof width === 'string') {
      const parsed = Number.parseInt(width, 10);
      return Number.isNaN(parsed) ? sum : sum + parsed;
    }
    return sum;
  }, 0);

  return Math.max(provided, total) || undefined;
});

defineExpose({
  tableRef,
});
</script>

<style scoped>
.autofit-table-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  box-sizing: border-box;
  margin-top: 14px;
  position: relative;
}

/* 自适应撑满父级剩余空间 */
.autofit-table--fit {
  flex: 1 1 0%;
  min-height: 0;
}

/* 磨砂玻璃容器风格（数据密集区使用近实心底色，避免透出底层内容） */
.autofit-table--glass {
  background: var(--glass-surface-solid, var(--glass-card-bg));
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
  border-radius: 12px;
  overflow: hidden;
}

.autofit-table__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--app-border-light, rgba(226, 232, 240, 0.6));
  flex-shrink: 0;
}

.autofit-table__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text-heading);
}

.autofit-table__body {
  flex: 1 1 0%;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.autofit-table__body :deep(.n-data-table) {
  flex: 1 1 0%;
  min-height: 0;
  height: 100% !important;
  display: flex;
  flex-direction: column;
}

.autofit-table__body :deep(.n-data-table-wrapper) {
  flex: 1 1 0%;
  min-height: 0;
  display: flex !important;
  flex-direction: column !important;
}

.autofit-table__body :deep(.n-data-table-base-table) {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  height: 100% !important;
  display: flex !important;
  flex-direction: column !important;
}

.autofit-table__body :deep(.n-data-table-base-table-body) {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  overflow-y: auto !important;
}

/* 空状态居中撑开 */
.autofit-table__body :deep(.n-data-table-empty) {
  flex: 1 1 0% !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

/* 去掉内层自带的重叠背景，让毛玻璃质感纯净透出 */
.autofit-table--glass :deep(.n-data-table-base-table) {
  background: transparent !important;
}

.autofit-table--glass :deep(.n-data-table-base-table-body) {
  background: transparent !important;
}

/* 分页栏区域内边距与磨砂顶线 */
.autofit-table--glass :deep(.n-data-table__pagination) {
  margin: auto 0 0 0 !important;
  flex-shrink: 0 !important;
  padding: 12px 16px !important;
  border-top: 1px solid var(--app-border-light, rgba(226, 232, 240, 0.6));
  background: var(--glass-surface-solid, var(--app-bg-secondary));
}

.autofit-table--glass :deep(.n-data-table-td) {
  border-bottom: 1px solid var(--app-border-light, rgba(226, 232, 240, 0.4)) !important;
}

/* 固定列（sticky 列）必须使用完全不透明底色：
   表格 td 默认底色是半透明的，横向滚动时被固定列遮住的单元格会透出来，形成文字重叠 */
.autofit-table--glass :deep(.n-data-table-td--fixed-left),
.autofit-table--glass :deep(.n-data-table-td--fixed-right) {
  background-color: var(--glass-surface-opaque, #ffffff) !important;
}

/* 行 hover：整行统一使用同一种不透明底色。
   固定列必须不透明（见上），如果只给固定列设底色、中间列仍走全局的半透明 hover 色，
   整行就会在固定列与滚动列的交界处出现色差，看起来「只有最左/最右两列有底色」 */
.autofit-table--glass :deep(.n-data-table-tbody .n-data-table-tr:hover > .n-data-table-td) {
  background-color: var(--glass-surface-opaque-hover, #f4f6fa) !important;
}

/* 可选固底栏 */
.autofit-table__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-top: 1px solid var(--app-border-light, rgba(226, 232, 240, 0.6));
  background: var(--glass-surface-solid, var(--app-bg-secondary));
  flex-shrink: 0;
  min-height: 38px;
}
</style>
