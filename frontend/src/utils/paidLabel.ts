import { h } from 'vue';

/**
 * 渲染模型选项 label。naive-ui `n-select` 的 `render-label` 是函数 prop（不是 slot），
 * 返回 VNode 或字符串均可；付费模型在 label 后追加"付费"徽标。
 */
export function renderPaidModelLabel(option: { label?: string; value?: string | number }, isPaid: boolean) {
  if (!isPaid) return option.label ?? '';
  return h('span', { style: 'display:inline-flex;align-items:center;gap:6px;' }, [
    option.label ?? '',
    h(
      'span',
      {
        style:
          'margin-left:2px;font-size:11px;line-height:1;padding:1px 5px;border-radius:4px;background:rgba(250,173,20,0.18);color:#faad14;border:1px solid rgba(250,173,20,0.4);',
      },
      '付费'
    ),
  ]);
}
