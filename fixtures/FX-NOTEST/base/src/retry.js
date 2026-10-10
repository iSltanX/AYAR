/** يعيد المحاولة عند الرفض حتى عدد أقصى. */
export async function retry(task, { attempts = 3, delayMs = 0 } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await task(i);
    } catch (error) {
      lastError = error;
      if (delayMs > 0 && i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}
