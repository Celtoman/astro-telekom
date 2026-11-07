// Bound filesystem pressure and drain in-flight work before a failed build cleans up.
export async function mapFiles(items, visit, concurrency = 8) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) throw new Error('Invalid file concurrency');
  const result = new Array(items.length);
  let next = 0, failure;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!failure && next < items.length) {
      const index = next++;
      try { result[index] = await visit(items[index], index); }
      catch (error) { failure ??= { error }; }
    }
  }));
  if (failure) throw failure.error;
  return result;
}
