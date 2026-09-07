/** Serialize account and billing operations; one rejection must not poison the queue. */
export function createQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation);
    tail = result.catch(() => undefined);
    return result;
  };
}

/** A deadline does not cancel the underlying SDK call. Only use for optional work. */
export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
