/**
 * 并发控制执行器，按指定并发度并发执行异步任务并保持返回结果顺序。
 *
 * @param items 输入项列表
 * @param concurrency 最大并发数
 * @param fn 针对每个输入项的异步映射函数
 * @returns 保持原始顺序的结果列表
 */
export async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  const worker = async () => {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      results[index] = await fn(items[index], index);
    }
  };

  const workers = Array.from({ length: limit }, () => worker());
  await Promise.all(workers);
  return results;
}
