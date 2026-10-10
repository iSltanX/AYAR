/** ذاكرة مؤقتة بحد أقصى للعناصر (الأقدم استخدامًا يخرج أولًا). */
export class LruCache {
  #max;
  #map = new Map();

  constructor(max) {
    if (!Number.isInteger(max) || max < 1) throw new RangeError('max must be a positive integer');
    this.#max = max;
  }

  get(key) {
    if (!this.#map.has(key)) return undefined;
    const value = this.#map.get(key);
    this.#map.delete(key);
    this.#map.set(key, value);
    return value;
  }

  set(key, value) {
    this.#map.delete(key);
    this.#map.set(key, value);
    if (this.#map.size > this.#max) this.#map.delete(this.#map.keys().next().value);
  }
}
