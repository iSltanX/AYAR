/** مكدس LIFO بسيط. */
export class Stack {
  #items = [];

  push(item) {
    this.#items.push(item);
  }

  pop() {
    return this.#items.pop();
  }

  get size() {
    return this.#items.length;
  }

  peek() {
    return this.#items.at(-1);
  }
}
