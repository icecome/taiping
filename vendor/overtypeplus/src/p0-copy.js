/**
 * p0-copy - "copy code" button on code blocks. Native Clipboard API with a
 * fallback to execCommand. Scans the core preview DOM on render.
 */
export function p0Copy() {
  return {
    /** Call after each render to add/refresh copy buttons on code blocks */
    attach(preview) {
      scan(preview);
    }
  };
}

function scan(preview) {
  if (!preview) return;
  preview.querySelectorAll('pre > code').forEach((code) => {
    const pre = code.parentElement;
    if (pre.querySelector('.ow-copy-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ow-copy-btn';
    btn.textContent = '复制';
    btn.setAttribute('aria-label', '复制代码块');
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      copyText(code.innerText || '');
      const old = btn.textContent;
      btn.textContent = '已复制';
      setTimeout(() => { btn.textContent = old; }, 1500);
    });
    pre.classList.add('ow-copyable');
    pre.appendChild(btn);
  });
}

async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  } catch { /* clipboard denied - ignore */ }
}