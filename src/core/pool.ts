// Runs fn over items with at most `concurrency` in flight. Preserves order. Stops starting new items on failure or abort.

export async function pool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>, signal?: AbortSignal): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  let failure: unknown = null;
  const worker = async () => {
    while (next < items.length && failure === null && !signal?.aborted) {
      const i = next++;
      try {
        out[i] = await fn(items[i]);
      } catch (e) {
        failure = e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker));
  if (failure !== null) throw failure;
  if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
  return out;
}
