type RetryOptions = {
  retries?: number;
  baseMs?: number;
  jitterMs?: number;
  shouldRetry?: (res: Response) => boolean;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function defaultShouldRetry(res: Response): boolean {
  return res.status >= 500 && res.status < 600;
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: RetryOptions = {},
): Promise<Response> {
  const retries = opts.retries ?? 3;
  const baseMs = opts.baseMs ?? 500;
  const jitterMs = opts.jitterMs ?? 100;
  const shouldRetry = opts.shouldRetry ?? defaultShouldRetry;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok || !shouldRetry(res)) return res;
      lastError = new Error(`fetch ${url}: ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    if (attempt === retries) break;
    const backoff = baseMs * 2 ** attempt + Math.random() * jitterMs;
    await sleep(backoff);
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`fetch ${url} failed`);
}
