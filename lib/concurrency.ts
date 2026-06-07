/**
 * Runs `fn` over `items` with at most `concurrency` tasks in-flight at once.
 * Preserves input order in the returned results array.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const limit = Math.floor(concurrency);
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new RangeError(
      `runWithConcurrency: concurrency must be a positive integer, got ${concurrency}`,
    );
  }
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i] as T);
    }
  };
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    worker,
  );
  await Promise.all(workers);
  return results;
}
