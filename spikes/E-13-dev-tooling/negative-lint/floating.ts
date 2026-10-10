// Deliberate type-aware lint error: @typescript-eslint/no-floating-promises.
async function work(): Promise<number> { return 1; }
export function run(): void {
  work();
}
