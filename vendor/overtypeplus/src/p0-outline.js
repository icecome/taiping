/**
 * p0-outline - headings outline side panel + anchor ids.
 * Scans the core preview DOM for h1-h6, assigns stable anchor ids, and
 * renders a clickable outline. Clicking an item calls core.showNormalEditMode
 * / focuses the corresponding block, or scrolls the preview into view.
 */
export function p0Outline(containerEl, label = '大纲') {
  const host = containerEl;
  host.innerHTML = '';

  const heading = document.createElement('div');
  heading.className = 'ow-outline-title';
  heading.textContent = label;
  host.appendChild(heading);

  const list = document.createElement('ul');
  list.className = 'ow-outline-list';
  host.appendChild(list);

  const api = {
    el: host,
    /** Rebuild the outline from the core instance's preview DOM */
    update(inst) {
      list.innerHTML = '';
      if (!inst || !inst.preview) {
        const empty = document.createElement('li');
        empty.className = 'ow-outline-empty';
        empty.textContent = '暂无标题';
        list.appendChild(empty);
        return;
      }

      // Assign/refresh stable anchor ids on h1-h6
      const seen = new Map();
      const headings = inst.preview.querySelectorAll('h1, h2, h3, h4, h5, h6');
      headings.forEach((h, idx) => {
        const text = (h.textContent || '').trim() || `heading-${idx + 1}`;
        let id = slugify(text);
        const count = seen.get(id) || 0;
        seen.set(id, count + 1);
        if (count > 0) id = `${id}-${count}`;
        h.id = id;
        h.classList.add('ow-anchor');

        const li = document.createElement('li');
        const level = parseInt(h.tagName[1], 10);
        li.className = `ow-outline-item ow-outline-h${level}`;
        const a = document.createElement('a');
        a.href = `#${id}`;
        a.textContent = text;
        a.addEventListener('click', (e) => {
          e.preventDefault();
          scrollToHeading(inst, h, id);
        });
        li.appendChild(a);
        list.appendChild(li);
      });
    },
    destroy() { host.innerHTML = ''; }
  };

  return api;
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function scrollToHeading(inst, headingEl, id) {
  // In normal/preview mode the preview holds the heading.
  if (inst.preview && inst.preview.contains(headingEl)) {
    const preview = inst.preview;
    preview.scrollTo({ top: headingEl.offsetTop - preview.offsetTop - 8, behavior: 'smooth' });
    return;
  }
  // Fallback: place caret near the heading text in the textarea.
  if (inst.textarea) {
    const text = inst.getValue() || '';
    const lines = text.split('\n');
    let offset = 0;
    for (let i = 0; i < lines.length; i++) {
      const nextHasHeading = new RegExp(`^#{1,6}\\s+${escapeRegExp(headingEl.textContent)}`).test(lines[i]);
      if (nextHasHeading) {
        inst.textarea.focus();
        inst.textarea.setSelectionRange(offset, offset);
        return;
      }
      offset += lines[i].length + 1;
    }
    void id;
  }
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}