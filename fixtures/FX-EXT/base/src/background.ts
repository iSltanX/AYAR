chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.set({ installedAt: Date.now() });
});
