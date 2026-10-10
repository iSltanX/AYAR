// Sandbox checks: no Node in the renderer world.
window.spike.ready({
  processType: typeof process,
  requireType: typeof require,
  bufferType: typeof Buffer,
  origin: location.origin,
  protocol: location.protocol,
});
window.spike.onReport((r) => {
  document.getElementById('report').textContent = JSON.stringify(r, null, 2);
});
