// Повтор попытки при сбое: 3 попытки с нарастающей паузой (1с → 2с → 4с).
// Повтор безопасен для идемпотентных операций (upsert, update по ключу).
export async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const delays = [1000, 2000, 4000];
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt >= 3) throw new Error(`${label}: не удалось после 3 попыток — ${msg}`);
      console.error(`[v0] ${label}: попытка ${attempt} упала (${msg}), повтор через ${delays[attempt - 1]} мс`);
      await new Promise((r) => setTimeout(r, delays[attempt - 1]));
    }
  }
}
