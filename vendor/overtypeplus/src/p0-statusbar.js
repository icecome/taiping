/**
 * p0-statusbar - bottom status bar showing word/char count, line count,
 * and the current editor mode. Pure read-only display updated on change.
 */
export function p0StatusBar(containerEl) {
  const host = containerEl;
  host.innerHTML = '';

  const left = document.createElement('span');
  left.className = 'ow-status-item';
  const right = document.createElement('span');
  right.className = 'ow-status-item ow-status-mode';

  host.appendChild(left);
  host.appendChild(right);

  const modeLabel = {
    normal: '普通编辑',
    ir: '即时渲染',
    plain: '纯文本',
    preview: '预览'
  };

  return {
    el: host,
    update(inst) {
      if (!inst) return;
      const value = inst.getValue() || '';
      const chars = value.length;
      const words = (value.trim() ? value.trim().split(/\s+/).length : 0);
      const lines = value ? value.split('\n').length : 1;
      const mode = inst.container ? inst.container.dataset.mode || 'normal' : 'normal';
      left.textContent = `${words} 词 · ${chars} 字 · ${lines} 行`;
      right.textContent = modeLabel[mode] || mode;
    }
  };
}