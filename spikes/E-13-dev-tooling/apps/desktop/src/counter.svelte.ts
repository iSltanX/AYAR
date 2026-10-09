// Svelte 5 runes in a .svelte.ts module.
export function createCounter(initial: number) {
  let count = $state(initial);
  const doubled = $derived(count * 2);
  return {
    get count() { return count; },
    get doubled() { return doubled; },
    increment() { count += 1; },
  };
}
