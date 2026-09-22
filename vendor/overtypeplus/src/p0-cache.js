/**
 * p0-cache - autosave draft to localStorage (keyed per instance) with debounce.
 * Also exposes getDraft/clearDraft on the shell. No dependency.
 */
export function p0Cache({ getValue, setValue }, { key, interval = 500, restore = true } = {}) {
  const storageKey = key || `overtype:draft:${defaultKey()}`;
  let timer = null;

  function save() {
    try {
      localStorage.setItem(storageKey, getValue());
    } catch { /* storage full/unavailable - skip */ }
  }

  function debouncedSave() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, interval);
  }

  function restore() {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved != null) {
        setValue(saved);
        return saved;
      }
    } catch { /* ignore */ }
    return null;
  }

  function clear() {
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    if (timer) { clearTimeout(timer); timer = null; }
  }

  if (restore) restore();

  return { onEdit: debouncedSave, restore, clear, save, key: storageKey };
}

let _counter = 0;
function defaultKey() {
  // Unique across instances in the same page
  return `inst-${++_counter}`;
}