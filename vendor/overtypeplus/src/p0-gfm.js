/**
 * p0-gfm - GFM extensions.
 *
 * Scope decision (alignment-safe only):
 *  - The overlay-alignment engine requires the preview DOM to stay
 *    character-for-character aligned with the textarea, so extensions that
 *    change visible line count/width (footnotes, super/subscripts) are NOT
 *    injected into the overlay preview.
 *  - TOC (table of contents) is provided structurally: the outline panel
 *    already renders heading hierarchy from the rendered preview, and this
 *    module exposes the same hierarchy as an array for external use.
 *
 * Returns { headings(): Array<{level,text,anchor}> }
 */
export function p0Gfm() {
  return {
    /**
     * Extract heading structure directly from raw markdown source (regex).
     * Alignment-safe and independent of the DOM preview.
     * @param {string} source
     * @returns {Array<{level:number,text:string,anchor:string}>}
     */
    headings(source = '') {
      const out = [];
      const seen = new Map();
      const re = /^(#{1,6})\s+(.+)$/gm;
      let m;
      while ((m = re.exec(source)) !== null) {
        const level = m[1].length;
        // Strip inline formatting to get plain text + anchor
        const text = m[2].replace(/[*_~`]/g, '');
        const base = slugify(text);
        const n = seen.get(base) || 0;
        seen.set(base, n + 1);
        const anchor = n > 0 ? `${base}-${n}` : base;
        out.push({ level, text, anchor });
      }
      return out;
    }
  };
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}