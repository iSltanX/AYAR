// يجلب قائمة العناصر من /api/items. في الاختبار تُحاكى الشبكة (design/states.json).
export async function fetchItems() {
  const response = await fetch('/api/items');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
