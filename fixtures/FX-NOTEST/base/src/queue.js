/** طابور FIFO بسيط. */
export class Queue {
  #items = [];

  push(item) {
    this.#items.push(item);
  }

  shift() {
    return this.#items.shift();
  }

  get size() {
    return this.#items.length;
  }

  peek() {
    return this.#items[0];
  }
}
