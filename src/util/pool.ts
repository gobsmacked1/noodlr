// Run a list of jobs with a bounded number in flight.
//
// Lifted in shape from the corpus miner, where it turned a multi-hour sequential run into a
// tolerable one at identical cost: these jobs are network-bound, so overlapping the waiting is very
// nearly free. Settles rather than rejects — one feature that will not compile must not throw away
// the other nineteen the scene already paid to send.

export interface PoolResult<T> {
  index: number;
  value?: T;
  error?: unknown;
}

export async function runPool<In, Out>(
  items: In[],
  limit: number,
  worker: (item: In, index: number) => Promise<Out>,
): Promise<PoolResult<Out>[]> {
  const results: PoolResult<Out>[] = new Array(items.length);
  let next = 0;
  const width = Math.max(1, Math.min(limit, items.length));

  const run = async (): Promise<void> => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      try {
        results[index] = { index, value: await worker(items[index], index) };
      } catch (error) {
        results[index] = { index, error };
      }
    }
  };

  await Promise.all(Array.from({ length: width }, run));
  return results;
}
