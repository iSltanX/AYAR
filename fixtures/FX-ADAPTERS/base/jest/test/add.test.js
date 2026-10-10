const { add } = require('../src/add.js');

test('يجمع عددين', () => {
  expect(add(2, 3)).toBe(5);
});
