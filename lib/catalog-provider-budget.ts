/** Bound the entire provider operation, not only its individual HTTP calls. */
export async function withCatalogProviderBudget<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new DOMException('Catalog provider deadline exceeded', 'TimeoutError');
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try { return await Promise.race([run(controller.signal), deadline]); }
  finally { clearTimeout(timer); }
}
