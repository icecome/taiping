/**
 * OverType v2.4.0
 * A lightweight markdown editor library with perfect WYSIWYG alignment
 * @license MIT
 * @author David Miranda
 * https://github.com/panphora/overtype
 */
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};

// src/parser.js
var MarkdownParser = class {
  /**
   * Reset link index (call before parsing a new document)
   */
  static resetLinkIndex() {
    this.linkIndex = 0;
  }
  /**
   * Set global code highlighter function
   * @param {Function|null} highlighter - Function that takes (code, language) and returns highlighted HTML
   */
  static setCodeHighlighter(highlighter) {
    this.codeHighlighter = highlighter;
  }
  /**
   * Set custom syntax processor function
   * @param {Function|null} processor - Function that takes (html) and returns modified HTML
   */
  static setCustomSyntax(processor) {
    this.customSyntax = processor;
  }
  /**
   * Apply custom syntax processor to parsed HTML
   * @param {string} html - Parsed HTML line
   * @returns {string} HTML with custom syntax applied
   */
  static applyCustomSyntax(html) {
    if (this.customSyntax) {
      return this.customSyntax(html);
    }
    return html;
  }
  /**
   * Escape HTML special characters
   * @param {string} text - Raw text to escape
   * @returns {string} Escaped HTML-safe text
   */
  static escapeHtml(text) {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
  /**
   * Preserve leading spaces as non-breaking spaces
   * @param {string} html - HTML string
   * @param {string} originalLine - Original line with spaces
   * @returns {string} HTML with preserved indentation
   */
  static preserveIndentation(html, originalLine) {
    const leadingSpaces = originalLine.match(/^(\s*)/)[1];
    const indentation = leadingSpaces.replace(/ /g, "&nbsp;");
    return html.replace(/^\s*/, indentation);
  }
  /**
   * Parse headers (h1-h3 only)
   * @param {string} html - HTML line to parse
   * @returns {string} Parsed HTML with header styling
   */
  static parseHeader(html) {
    return html.replace(/^(#{1,3})\s(.+)$/, (match, hashes, content) => {
      const level = hashes.length;
      content = this.parseInlineElements(content);
      return `<h${level}><span class="syntax-marker">${hashes} </span>${content}</h${level}>`;
    });
  }
  /**
   * Parse horizontal rules
   * @param {string} html - HTML line to parse
   * @returns {string|null} Parsed horizontal rule or null
   */
  static parseHorizontalRule(html) {
    if (html.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
      return `<div><span class="hr-marker">${html}</span></div>`;
    }
    return null;
  }
  /**
   * Parse blockquotes
   * @param {string} html - HTML line to parse
   * @returns {string} Parsed blockquote
   */
  static parseBlockquote(html) {
    return html.replace(/^&gt; (.+)$/, (match, content) => {
      return `<span class="blockquote"><span class="syntax-marker">&gt;</span> ${content}</span>`;
    });
  }
  /**
   * Parse bullet lists
   * @param {string} html - HTML line to parse
   * @returns {string} Parsed bullet list item
   */
  static parseBulletList(html) {
    return html.replace(/^((?:&nbsp;)*)([-*+])\s(.+)$/, (match, indent, marker, content) => {
      content = this.parseInlineElements(content);
      return `${indent}<li class="bullet-list"><span class="syntax-marker">${marker} </span>${content}</li>`;
    });
  }
  /**
   * Parse task lists (GitHub Flavored Markdown checkboxes)
   * @param {string} html - HTML line to parse
   * @param {boolean} isPreviewMode - Whether to render actual checkboxes (preview) or keep syntax visible (normal)
   * @returns {string} Parsed task list item
   */
  static parseTaskList(html, isPreviewMode = false) {
    return html.replace(/^((?:&nbsp;)*)-(\s+)\[([ xX])\](\s*)(.*)$/, (match, indent, spacingBeforeBox, checked, spacingAfterBox, content) => {
      content = this.parseInlineElements(content);
      if (isPreviewMode) {
        const isChecked = checked.toLowerCase() === "x";
        return `${indent}<li class="task-list"><input type="checkbox" ${isChecked ? "checked" : ""}> ${content}</li>`;
      } else {
        return `${indent}<li class="task-list"><span class="syntax-marker">-${spacingBeforeBox}[${checked}]${spacingAfterBox}</span>${content}</li>`;
      }
    });
  }
  /**
   * Parse numbered lists
   * @param {string} html - HTML line to parse
   * @returns {string} Parsed numbered list item
   */
  static parseNumberedList(html) {
    return html.replace(/^((?:&nbsp;)*)(\d+\.)\s(.+)$/, (match, indent, marker, content) => {
      content = this.parseInlineElements(content);
      return `${indent}<li class="ordered-list"><span class="syntax-marker">${marker} </span>${content}</li>`;
    });
  }
  /**
   * Parse code blocks (markers only)
   * @param {string} html - HTML line to parse
   * @returns {string|null} Parsed code fence or null
   */
  static parseCodeBlock(html) {
    const codeFenceRegex = /^`{3}[^`]*$/;
    if (codeFenceRegex.test(html)) {
      return `<div><span class="code-fence">${html}</span></div>`;
    }
    return null;
  }
  /**
   * Parse bold text
   * @param {string} html - HTML with potential bold markdown
   * @returns {string} HTML with bold styling
   */
  static parseBold(html) {
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong><span class="syntax-marker">**</span>$1<span class="syntax-marker">**</span></strong>');
    html = html.replace(/__(.+?)__/g, '<strong><span class="syntax-marker">__</span>$1<span class="syntax-marker">__</span></strong>');
    return html;
  }
  /**
   * Parse italic text
   * Note: Uses lookbehind assertions - requires modern browsers
   * @param {string} html - HTML with potential italic markdown
   * @returns {string} HTML with italic styling
   */
  static parseItalic(html) {
    html = html.replace(new RegExp("(?<![\\*>])\\*(?!\\*)(.+?)(?<!\\*)\\*(?!\\*)", "g"), '<em><span class="syntax-marker">*</span>$1<span class="syntax-marker">*</span></em>');
    html = html.replace(new RegExp("(?<=^|\\s)_(?!_)(.+?)(?<!_)_(?!_)(?=\\s|$)", "g"), '<em><span class="syntax-marker">_</span>$1<span class="syntax-marker">_</span></em>');
    return html;
  }
  /**
   * Parse strikethrough text
   * Supports both single (~) and double (~~) tildes, but rejects 3+ tildes
   * @param {string} html - HTML with potential strikethrough markdown
   * @returns {string} HTML with strikethrough styling
   */
  static parseStrikethrough(html) {
    html = html.replace(new RegExp("(?<!~)~~(?!~)(.+?)(?<!~)~~(?!~)", "g"), '<del><span class="syntax-marker">~~</span>$1<span class="syntax-marker">~~</span></del>');
    html = html.replace(new RegExp("(?<!~)~(?!~)(.+?)(?<!~)~(?!~)", "g"), '<del><span class="syntax-marker">~</span>$1<span class="syntax-marker">~</span></del>');
    return html;
  }
  /**
   * Parse inline code
   * @param {string} html - HTML with potential code markdown
   * @returns {string} HTML with code styling
   */
  static parseInlineCode(html) {
    return html.replace(new RegExp("(?<!`)(`+)(?!`)((?:(?!\\1).)+?)(\\1)(?!`)", "g"), '<code><span class="syntax-marker">$1</span>$2<span class="syntax-marker">$3</span></code>');
  }
  /**
   * Sanitize URL to prevent XSS attacks
   * @param {string} url - URL to sanitize
   * @returns {string} Safe URL or '#' if dangerous
   */
  static sanitizeUrl(url) {
    const trimmed = url.trim();
    const lower = trimmed.toLowerCase();
    const safeProtocols = [
      "http://",
      "https://",
      "mailto:",
      "ftp://",
      "ftps://"
    ];
    const hasSafeProtocol = safeProtocols.some((protocol) => lower.startsWith(protocol));
    const isRelative = trimmed.startsWith("/") || trimmed.startsWith("#") || trimmed.startsWith("?") || trimmed.startsWith(".") || !trimmed.includes(":") && !trimmed.includes("//");
    if (hasSafeProtocol || isRelative) {
      return url;
    }
    return "#";
  }
  /**
   * Parse links
   * @param {string} html - HTML with potential link markdown
   * @returns {string} HTML with link styling
   */
  static parseLinks(html) {
    return html.replace(/\[(.+?)\]\((.+?)\)/g, (match, text, url) => {
      const anchorName = `--link-${this.linkIndex++}`;
      const safeUrl = this.sanitizeUrl(url);
      return `<a href="${safeUrl}" style="anchor-name: ${anchorName}"><span class="syntax-marker">[</span>${text}<span class="syntax-marker url-part">](${url})</span></a>`;
    });
  }
  /**
   * Identify and protect sanctuaries (code and links) before parsing
   * @param {string} text - Text with potential markdown
   * @returns {Object} Object with protected text and sanctuary map
   */
  static identifyAndProtectSanctuaries(text) {
    const sanctuaries = /* @__PURE__ */ new Map();
    let sanctuaryCounter = 0;
    let protectedText = text;
    const protectedRegions = [];
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(text)) !== null) {
      const bracketPos = linkMatch.index + linkMatch[0].indexOf("](");
      const urlStart = bracketPos + 2;
      const urlEnd = urlStart + linkMatch[2].length;
      protectedRegions.push({ start: urlStart, end: urlEnd });
    }
    const codeRegex = new RegExp("(?<!`)(`+)(?!`)((?:(?!\\1).)+?)(\\1)(?!`)", "g");
    let codeMatch;
    const codeMatches = [];
    while ((codeMatch = codeRegex.exec(text)) !== null) {
      const codeStart = codeMatch.index;
      const codeEnd = codeMatch.index + codeMatch[0].length;
      const inProtectedRegion = protectedRegions.some(
        (region) => codeStart >= region.start && codeEnd <= region.end
      );
      if (!inProtectedRegion) {
        codeMatches.push({
          match: codeMatch[0],
          index: codeMatch.index,
          openTicks: codeMatch[1],
          content: codeMatch[2],
          closeTicks: codeMatch[3]
        });
      }
    }
    codeMatches.sort((a, b) => b.index - a.index);
    codeMatches.forEach((codeInfo) => {
      const placeholder = `\uE000${sanctuaryCounter++}\uE001`;
      sanctuaries.set(placeholder, {
        type: "code",
        original: codeInfo.match,
        openTicks: codeInfo.openTicks,
        content: codeInfo.content,
        closeTicks: codeInfo.closeTicks
      });
      protectedText = protectedText.substring(0, codeInfo.index) + placeholder + protectedText.substring(codeInfo.index + codeInfo.match.length);
    });
    protectedText = protectedText.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, url) => {
      const placeholder = `\uE000${sanctuaryCounter++}\uE001`;
      sanctuaries.set(placeholder, {
        type: "link",
        original: match,
        linkText,
        url
      });
      return placeholder;
    });
    return { protectedText, sanctuaries };
  }
  /**
   * Restore and transform sanctuaries back to HTML
   * @param {string} html - HTML with sanctuary placeholders
   * @param {Map} sanctuaries - Map of sanctuaries to restore
   * @returns {string} HTML with sanctuaries restored and transformed
   */
  static restoreAndTransformSanctuaries(html, sanctuaries) {
    const placeholders = Array.from(sanctuaries.keys()).sort((a, b) => {
      const indexA = html.indexOf(a);
      const indexB = html.indexOf(b);
      return indexA - indexB;
    });
    placeholders.forEach((placeholder) => {
      const sanctuary = sanctuaries.get(placeholder);
      let replacement;
      if (sanctuary.type === "code") {
        replacement = `<code><span class="syntax-marker">${sanctuary.openTicks}</span>${sanctuary.content}<span class="syntax-marker">${sanctuary.closeTicks}</span></code>`;
      } else if (sanctuary.type === "link") {
        let processedLinkText = sanctuary.linkText;
        sanctuaries.forEach((innerSanctuary, innerPlaceholder) => {
          if (processedLinkText.includes(innerPlaceholder)) {
            if (innerSanctuary.type === "code") {
              const codeHtml = `<code><span class="syntax-marker">${innerSanctuary.openTicks}</span>${innerSanctuary.content}<span class="syntax-marker">${innerSanctuary.closeTicks}</span></code>`;
              processedLinkText = processedLinkText.replace(innerPlaceholder, codeHtml);
            }
          }
        });
        processedLinkText = this.parseStrikethrough(processedLinkText);
        processedLinkText = this.parseBold(processedLinkText);
        processedLinkText = this.parseItalic(processedLinkText);
        const anchorName = `--link-${this.linkIndex++}`;
        const safeUrl = this.sanitizeUrl(sanctuary.url);
        replacement = `<a href="${safeUrl}" style="anchor-name: ${anchorName}"><span class="syntax-marker">[</span>${processedLinkText}<span class="syntax-marker url-part">](${sanctuary.url})</span></a>`;
      }
      html = html.replace(placeholder, replacement);
    });
    return html;
  }
  /**
   * Parse all inline elements in correct order
   * @param {string} text - Text with potential inline markdown
   * @returns {string} HTML with all inline styling
   */
  static parseInlineElements(text) {
    const { protectedText, sanctuaries } = this.identifyAndProtectSanctuaries(text);
    let html = protectedText;
    html = this.parseStrikethrough(html);
    html = this.parseBold(html);
    html = this.parseItalic(html);
    html = this.restoreAndTransformSanctuaries(html, sanctuaries);
    return html;
  }
  /**
   * Parse a single line of markdown
   * @param {string} line - Raw markdown line
   * @returns {string} Parsed HTML line
   */
  static parseLine(line, isPreviewMode = false) {
    let html = this.escapeHtml(line);
    html = this.preserveIndentation(html, line);
    const horizontalRule = this.parseHorizontalRule(html);
    if (horizontalRule)
      return horizontalRule;
    const codeBlock = this.parseCodeBlock(html);
    if (codeBlock)
      return codeBlock;
    html = this.parseHeader(html);
    html = this.parseBlockquote(html);
    html = this.parseTaskList(html, isPreviewMode);
    html = this.parseBulletList(html);
    html = this.parseNumberedList(html);
    if (!html.includes("<li") && !html.includes("<h")) {
      html = this.parseInlineElements(html);
    }
    if (html.trim() === "") {
      return "<div>&nbsp;</div>";
    }
    return `<div>${html}</div>`;
  }
  /**
   * Parse full markdown text
   * @param {string} text - Full markdown text
   * @param {number} activeLine - Currently active line index (optional)
   * @param {boolean} showActiveLineRaw - Show raw markdown on active line
   * @param {Function} instanceHighlighter - Instance-specific code highlighter (optional, overrides global if provided)
   * @returns {string} Parsed HTML
   */
  static parse(text, activeLine = -1, showActiveLineRaw = false, instanceHighlighter, isPreviewMode = false) {
    this.resetLinkIndex();
    const lines = text.split("\n");
    let inCodeBlock = false;
    const parsedLines = lines.map((line, index) => {
      if (showActiveLineRaw && index === activeLine) {
        const content = this.escapeHtml(line) || "&nbsp;";
        return `<div class="raw-line">${content}</div>`;
      }
      const codeFenceRegex = /^```[^`]*$/;
      if (codeFenceRegex.test(line)) {
        inCodeBlock = !inCodeBlock;
        return this.applyCustomSyntax(this.parseLine(line, isPreviewMode));
      }
      if (inCodeBlock) {
        const escaped = this.escapeHtml(line);
        const indented = this.preserveIndentation(escaped, line);
        return `<div>${indented || "&nbsp;"}</div>`;
      }
      return this.applyCustomSyntax(this.parseLine(line, isPreviewMode));
    });
    const html = parsedLines.join("");
    return this.postProcessHTML(html, instanceHighlighter);
  }
  /**
   * Post-process HTML to consolidate lists and code blocks
   * @param {string} html - HTML to post-process
   * @param {Function} instanceHighlighter - Instance-specific code highlighter (optional, overrides global if provided)
   * @returns {string} Post-processed HTML with consolidated lists and code blocks
   */
  static postProcessHTML(html, instanceHighlighter) {
    if (typeof document === "undefined" || !document) {
      return this.postProcessHTMLManual(html, instanceHighlighter);
    }
    const container = document.createElement("div");
    container.innerHTML = html;
    let currentList = null;
    let listType = null;
    let currentCodeBlock = null;
    let inCodeBlock = false;
    const children = Array.from(container.children);
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (!child.parentNode)
        continue;
      const codeFence = child.querySelector(".code-fence");
      if (codeFence) {
        const fenceText = codeFence.textContent;
        if (fenceText.startsWith("```")) {
          if (!inCodeBlock) {
            inCodeBlock = true;
            currentCodeBlock = document.createElement("pre");
            const codeElement = document.createElement("code");
            currentCodeBlock.appendChild(codeElement);
            currentCodeBlock.className = "code-block";
            const lang = fenceText.slice(3).trim();
            if (lang) {
              codeElement.className = `language-${lang}`;
            }
            container.insertBefore(currentCodeBlock, child.nextSibling);
            currentCodeBlock._codeElement = codeElement;
            currentCodeBlock._language = lang;
            currentCodeBlock._codeContent = "";
            continue;
          } else {
            const highlighter = instanceHighlighter || this.codeHighlighter;
            if (currentCodeBlock && highlighter && currentCodeBlock._codeContent) {
              try {
                const result = highlighter(
                  currentCodeBlock._codeContent,
                  currentCodeBlock._language || ""
                );
                if (result && typeof result.then === "function") {
                  console.warn("Async highlighters are not supported in parse() because it returns an HTML string. The caller creates new DOM elements from that string, breaking references to the elements we would update. Use synchronous highlighters only.");
                } else {
                  if (result && typeof result === "string" && result.trim()) {
                    currentCodeBlock._codeElement.innerHTML = result;
                  }
                }
              } catch (error) {
                console.warn("Code highlighting failed:", error);
              }
            }
            inCodeBlock = false;
            currentCodeBlock = null;
            continue;
          }
        }
      }
      if (inCodeBlock && currentCodeBlock && child.tagName === "DIV" && !child.querySelector(".code-fence")) {
        const codeElement = currentCodeBlock._codeElement || currentCodeBlock.querySelector("code");
        if (currentCodeBlock._codeContent.length > 0) {
          currentCodeBlock._codeContent += "\n";
        }
        const lineText = child.textContent.replace(/\u00A0/g, " ");
        currentCodeBlock._codeContent += lineText;
        if (codeElement.textContent.length > 0) {
          codeElement.textContent += "\n";
        }
        codeElement.textContent += lineText;
        child.remove();
        continue;
      }
      let listItem = null;
      if (child.tagName === "DIV") {
        listItem = child.querySelector("li");
      }
      if (listItem) {
        const isBullet = listItem.classList.contains("bullet-list");
        const isOrdered = listItem.classList.contains("ordered-list");
        if (!isBullet && !isOrdered) {
          currentList = null;
          listType = null;
          continue;
        }
        const newType = isBullet ? "ul" : "ol";
        if (!currentList || listType !== newType) {
          currentList = document.createElement(newType);
          container.insertBefore(currentList, child);
          listType = newType;
        }
        const indentationNodes = [];
        for (const node of child.childNodes) {
          if (node.nodeType === 3 && node.textContent.match(/^\u00A0+$/)) {
            indentationNodes.push(node.cloneNode(true));
          } else if (node === listItem) {
            break;
          }
        }
        indentationNodes.forEach((node) => {
          listItem.insertBefore(node, listItem.firstChild);
        });
        currentList.appendChild(listItem);
        child.remove();
      } else {
        currentList = null;
        listType = null;
      }
    }
    return container.innerHTML;
  }
  /**
   * Manual post-processing for Node.js environments (without DOM)
   * @param {string} html - HTML to post-process
   * @param {Function} instanceHighlighter - Instance-specific code highlighter (optional, overrides global if provided)
   * @returns {string} Post-processed HTML
   */
  static postProcessHTMLManual(html, instanceHighlighter) {
    let processed = html;
    processed = processed.replace(/((?:<div>(?:&nbsp;)*<li class="bullet-list">.*?<\/li><\/div>\s*)+)/gs, (match) => {
      const divs = match.match(/<div>(?:&nbsp;)*<li class="bullet-list">.*?<\/li><\/div>/gs) || [];
      if (divs.length > 0) {
        const items = divs.map((div) => {
          const indentMatch = div.match(/<div>((?:&nbsp;)*)<li/);
          const listItemMatch = div.match(/<li class="bullet-list">.*?<\/li>/);
          if (indentMatch && listItemMatch) {
            const indentation = indentMatch[1];
            const listItem = listItemMatch[0];
            return listItem.replace(/<li class="bullet-list">/, `<li class="bullet-list">${indentation}`);
          }
          return listItemMatch ? listItemMatch[0] : "";
        }).filter(Boolean);
        return "<ul>" + items.join("") + "</ul>";
      }
      return match;
    });
    processed = processed.replace(/((?:<div>(?:&nbsp;)*<li class="ordered-list">.*?<\/li><\/div>\s*)+)/gs, (match) => {
      const divs = match.match(/<div>(?:&nbsp;)*<li class="ordered-list">.*?<\/li><\/div>/gs) || [];
      if (divs.length > 0) {
        const items = divs.map((div) => {
          const indentMatch = div.match(/<div>((?:&nbsp;)*)<li/);
          const listItemMatch = div.match(/<li class="ordered-list">.*?<\/li>/);
          if (indentMatch && listItemMatch) {
            const indentation = indentMatch[1];
            const listItem = listItemMatch[0];
            return listItem.replace(/<li class="ordered-list">/, `<li class="ordered-list">${indentation}`);
          }
          return listItemMatch ? listItemMatch[0] : "";
        }).filter(Boolean);
        return "<ol>" + items.join("") + "</ol>";
      }
      return match;
    });
    const codeBlockRegex = /<div><span class="code-fence">(```[^<]*)<\/span><\/div>(.*?)<div><span class="code-fence">(```)<\/span><\/div>/gs;
    processed = processed.replace(codeBlockRegex, (match, openFence, content, closeFence) => {
      const lines = content.match(/<div>(.*?)<\/div>/gs) || [];
      const codeContent = lines.map((line) => {
        const text = line.replace(/<div>(.*?)<\/div>/s, "$1").replace(/&nbsp;/g, " ");
        return text;
      }).join("\n");
      const lang = openFence.slice(3).trim();
      const langClass = lang ? ` class="language-${lang}"` : "";
      let highlightedContent = codeContent;
      const highlighter = instanceHighlighter || this.codeHighlighter;
      if (highlighter) {
        try {
          const decodedCode = codeContent.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
          const result2 = highlighter(decodedCode, lang);
          if (result2 && typeof result2.then === "function") {
            console.warn("Async highlighters are not supported in Node.js (non-DOM) context. Use synchronous highlighters for server-side rendering.");
          } else {
            if (result2 && typeof result2 === "string" && result2.trim()) {
              highlightedContent = result2;
            }
          }
        } catch (error) {
          console.warn("Code highlighting failed:", error);
        }
      }
      let result = `<div><span class="code-fence">${openFence}</span></div>`;
      result += `<pre class="code-block"><code${langClass}>${highlightedContent}</code></pre>`;
      result += `<div><span class="code-fence">${closeFence}</span></div>`;
      return result;
    });
    return processed;
  }
  /**
   * Get list context at cursor position
   * @param {string} text - Full text content
   * @param {number} cursorPosition - Current cursor position
   * @returns {Object} List context information
   */
  static getListContext(text, cursorPosition) {
    const lines = text.split("\n");
    let currentPos = 0;
    let lineIndex = 0;
    let lineStart = 0;
    for (let i = 0; i < lines.length; i++) {
      const lineLength = lines[i].length;
      if (currentPos + lineLength >= cursorPosition) {
        lineIndex = i;
        lineStart = currentPos;
        break;
      }
      currentPos += lineLength + 1;
    }
    const currentLine = lines[lineIndex];
    const lineEnd = lineStart + currentLine.length;
    const checkboxMatch = currentLine.match(this.LIST_PATTERNS.checkbox);
    if (checkboxMatch) {
      return {
        inList: true,
        listType: "checkbox",
        indent: checkboxMatch[1],
        marker: "-",
        checked: checkboxMatch[2] === "x",
        content: checkboxMatch[3],
        lineStart,
        lineEnd,
        markerEndPos: lineStart + checkboxMatch[1].length + checkboxMatch[2].length + 5
        // indent + "- [ ] "
      };
    }
    const bulletMatch = currentLine.match(this.LIST_PATTERNS.bullet);
    if (bulletMatch) {
      return {
        inList: true,
        listType: "bullet",
        indent: bulletMatch[1],
        marker: bulletMatch[2],
        content: bulletMatch[3],
        lineStart,
        lineEnd,
        markerEndPos: lineStart + bulletMatch[1].length + bulletMatch[2].length + 1
        // indent + marker + space
      };
    }
    const numberedMatch = currentLine.match(this.LIST_PATTERNS.numbered);
    if (numberedMatch) {
      return {
        inList: true,
        listType: "numbered",
        indent: numberedMatch[1],
        marker: parseInt(numberedMatch[2]),
        content: numberedMatch[3],
        lineStart,
        lineEnd,
        markerEndPos: lineStart + numberedMatch[1].length + numberedMatch[2].length + 2
        // indent + number + ". "
      };
    }
    return {
      inList: false,
      listType: null,
      indent: "",
      marker: null,
      content: currentLine,
      lineStart,
      lineEnd,
      markerEndPos: lineStart
    };
  }
  /**
   * Create a new list item based on context
   * @param {Object} context - List context from getListContext
   * @returns {string} New list item text
   */
  static createNewListItem(context) {
    switch (context.listType) {
      case "bullet":
        return `${context.indent}${context.marker} `;
      case "numbered":
        return `${context.indent}${context.marker + 1}. `;
      case "checkbox":
        return `${context.indent}- [ ] `;
      default:
        return "";
    }
  }
  /**
   * Renumber all numbered lists in text
   * @param {string} text - Text containing numbered lists
   * @returns {string} Text with renumbered lists
   */
  static renumberLists(text) {
    const lines = text.split("\n");
    const numbersByIndent = /* @__PURE__ */ new Map();
    let inList = false;
    const result = lines.map((line) => {
      const match = line.match(this.LIST_PATTERNS.numbered);
      if (match) {
        const indent = match[1];
        const indentLevel = indent.length;
        const content = match[3];
        if (!inList) {
          numbersByIndent.clear();
        }
        const currentNumber = (numbersByIndent.get(indentLevel) || 0) + 1;
        numbersByIndent.set(indentLevel, currentNumber);
        for (const [level] of numbersByIndent) {
          if (level > indentLevel) {
            numbersByIndent.delete(level);
          }
        }
        inList = true;
        return `${indent}${currentNumber}. ${content}`;
      } else {
        if (line.trim() === "" || !line.match(/^\s/)) {
          inList = false;
          numbersByIndent.clear();
        }
        return line;
      }
    });
    return result.join("\n");
  }
  /**
   * Parse inline markdown into an ordered array of span descriptors.
   * @param {string} raw - raw (unescaped) inline text
   * @returns {Array<object>} spans: {text} | {type, ...}
   */
  static parseInlineSpans(raw) {
    const spans = [];
    let rest = String(raw || "");
    const tokenRe = /!\[([^\]]*)\]\(([^)]*)\)|\[([^\]]*)\]\(([^)]*)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|~~([^~]+)~~/;
    while (rest) {
      const m = tokenRe.exec(rest);
      if (!m) {
        if (rest)
          spans.push({ text: rest });
        break;
      }
      if (m.index > 0) {
        spans.push({ text: rest.slice(0, m.index) });
      }
      if (m[1] !== void 0) {
        spans.push({ type: "image", alt: m[1], src: m[2] });
      } else if (m[3] !== void 0) {
        spans.push({ type: "link", text: m[3], href: m[4] });
      } else if (m[5] !== void 0) {
        spans.push({ type: "code", text: m[5] });
      } else if (m[6] !== void 0) {
        spans.push({ type: "bold", text: m[6] });
      } else if (m[7] !== void 0) {
        spans.push({ type: "italic", text: m[7] });
      } else if (m[8] !== void 0) {
        spans.push({ type: "strikethrough", text: m[8] });
      }
      rest = rest.slice(m.index + m[0].length);
    }
    return spans;
  }
  /**
   * Build a read-only syntax tree (AST) from markdown text.
   * Line-based and lightweight — for inspection/integration, not rendering.
   * @param {string} text - raw markdown source
   * @returns {object} { type:'document', children: [...] }
   */
  static buildTree(text) {
    const lines = String(text || "").split("\n");
    const children = [];
    let i = 0;
    const listItemLine = /^(\s*)([-*+]|\d+\.)\s+(.+)$/;
    const taskLine = /^(\s*)-(\s+)\[([ xX])\](\s*)(.*)$/;
    const quoteLine = /^>\s?(.*)$/;
    const headerLine = /^(#{1,6})\s+(.+)$/;
    const hrLine = /^(-{3,}|\*{3,}|_{3,})$/;
    const pipeCell = /^(\s*)\|.*\|\s*$/;
    const alignRow = /^(\s*)\|[\s:|-]+\|\s*$/;
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === "") {
        i++;
        continue;
      }
      const fence = line.match(/^(\s*)```(\S*)/);
      if (fence) {
        const lang = fence[2] || "";
        const buf2 = [];
        i++;
        while (i < lines.length && !/^(\s*)```/.test(lines[i])) {
          buf2.push(lines[i]);
          i++;
        }
        i++;
        children.push({ type: "code", lang, text: buf2.join("\n") });
        continue;
      }
      if (line.trim().match(hrLine)) {
        children.push({ type: "hr", line: i });
        i++;
        continue;
      }
      const h = line.match(headerLine);
      if (h) {
        children.push({ type: "heading", level: h[1].length, text: h[2], inline: this.parseInlineSpans(h[2]), line: i });
        i++;
        continue;
      }
      if (quoteLine.test(line)) {
        const q = [];
        while (i < lines.length) {
          const m = lines[i].match(quoteLine);
          if (!m)
            break;
          q.push(m[1]);
          i++;
        }
        const text3 = q.join("\n");
        children.push({ type: "blockquote", text: text3, inline: this.parseInlineSpans(text3) });
        continue;
      }
      if (pipeCell.test(line) && i + 1 < lines.length && alignRow.test(lines[i + 1])) {
        const header = line.split("|").slice(1, -1).map((s) => s.trim());
        i += 2;
        const rows = [];
        while (i < lines.length && pipeCell.test(lines[i])) {
          rows.push(lines[i].split("|").slice(1, -1).map((s) => s.trim()));
          i++;
        }
        children.push({ type: "table", header, rows });
        continue;
      }
      if (listItemLine.test(line)) {
        const ordered = /\d+\./.test(line);
        const items = [];
        while (i < lines.length && listItemLine.test(lines[i])) {
          const li = lines[i].match(listItemLine);
          const isTask = !!lines[i].match(taskLine);
          let content = li[3];
          if (isTask) {
            const t2 = lines[i].match(taskLine);
            items.push({ ordered, marker: li[2], task: true, checked: t2[3].toLowerCase() === "x", text: t2[5], inline: this.parseInlineSpans(t2[5]) });
          } else {
            items.push({ ordered, marker: li[2], task: false, text: content, inline: this.parseInlineSpans(content) });
          }
          i++;
        }
        children.push({ type: "list", ordered, items, start: ordered && /^\d+\./.test(lines[i - items.length]) ? parseInt(lines[i - items.length].match(/\d+/)[0], 10) : 1 });
        continue;
      }
      const buf = [];
      while (i < lines.length && lines[i].trim() !== "" && !headerLine.test(lines[i]) && !listItemLine.test(lines[i]) && !quoteLine.test(lines[i]) && !hrLine.test(lines[i].trim()) && !pipeCell.test(lines[i]) && !/^(\s*)```/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      const text2 = buf.join("\n");
      children.push({ type: "paragraph", text: text2, inline: this.parseInlineSpans(text2) });
    }
    return { type: "document", children };
  }
};
// Track link index for anchor naming
__publicField(MarkdownParser, "linkIndex", 0);
// Global code highlighter function
__publicField(MarkdownParser, "codeHighlighter", null);
// Custom syntax processor function
__publicField(MarkdownParser, "customSyntax", null);
/**
 * List pattern definitions
 */
__publicField(MarkdownParser, "LIST_PATTERNS", {
  bullet: /^(\s*)([-*+])\s+(.*)$/,
  numbered: /^(\s*)(\d+)\.\s+(.*)$/,
  checkbox: /^(\s*)-\s+\[([ x])\]\s+(.*)$/
});

// src/shortcuts.js
var ShortcutsManager = class {
  constructor(editor) {
    this.editor = editor;
  }
  /**
   * Handle keydown events - called by OverType
   * @param {KeyboardEvent} event - The keyboard event
   * @returns {boolean} Whether the event was handled
   */
  handleKeydown(event) {
    const isMac = navigator.platform.toLowerCase().includes("mac");
    const modKey = isMac ? event.metaKey : event.ctrlKey;
    if (!modKey)
      return false;
    if (event.key === "]") {
      event.preventDefault();
      this.editor.indentSelection();
      return true;
    }
    if (event.key === "[") {
      event.preventDefault();
      this.editor.outdentSelection();
      return true;
    }
    const headingMatch = event.code && /^Digit([1-6])$/.exec(event.code);
    if (headingMatch) {
      event.preventDefault();
      this.editor.performAction("toggleH" + headingMatch[1], event);
      return true;
    }
    if (event.key.toLowerCase() === "e") {
      event.preventDefault();
      this.editor.performAction("toggleCode", event);
      return true;
    }
    if (event.key === "'" || event.key === '"') {
      event.preventDefault();
      this.editor.performAction("toggleQuote", event);
      return true;
    }
    let actionId = null;
    switch (event.key.toLowerCase()) {
      case "b":
        if (!event.shiftKey)
          actionId = "toggleBold";
        break;
      case "i":
        if (!event.shiftKey)
          actionId = "toggleItalic";
        break;
      case "k":
        if (!event.shiftKey)
          actionId = "insertLink";
        break;
      case "7":
        if (event.shiftKey)
          actionId = "toggleNumberedList";
        break;
      case "8":
        if (event.shiftKey)
          actionId = "toggleBulletList";
        break;
    }
    if (actionId) {
      event.preventDefault();
      this.editor.performAction(actionId, event);
      return true;
    }
    return false;
  }
  /**
   * Cleanup
   */
  destroy() {
  }
};

// src/themes.js
var solar = {
  name: "solar",
  colors: {
    bgPrimary: "#faf0ca",
    // Lemon Chiffon - main background
    bgSecondary: "#ffffff",
    // White - editor background
    text: "#0d3b66",
    // Yale Blue - main text
    textPrimary: "#0d3b66",
    // Yale Blue - primary text (same as text)
    textSecondary: "#5a7a9b",
    // Muted blue - secondary text
    h1: "#f95738",
    // Tomato - h1 headers
    h2: "#ee964b",
    // Sandy Brown - h2 headers
    h3: "#3d8a51",
    // Forest green - h3 headers
    strong: "#ee964b",
    // Sandy Brown - bold text
    em: "#f95738",
    // Tomato - italic text
    del: "#ee964b",
    // Sandy Brown - deleted text (same as strong)
    link: "#0d3b66",
    // Yale Blue - links
    code: "#0d3b66",
    // Yale Blue - inline code
    codeBg: "rgba(244, 211, 94, 0.4)",
    // Naples Yellow with transparency
    blockquote: "#5a7a9b",
    // Muted blue - blockquotes
    hr: "#5a7a9b",
    // Muted blue - horizontal rules
    syntaxMarker: "rgba(13, 59, 102, 0.52)",
    // Yale Blue with transparency
    syntax: "#999999",
    // Gray - syntax highlighting fallback
    cursor: "#f95738",
    // Tomato - cursor
    selection: "rgba(244, 211, 94, 0.4)",
    // Naples Yellow with transparency
    listMarker: "#ee964b",
    // Sandy Brown - list markers
    rawLine: "#5a7a9b",
    // Muted blue - raw line indicators
    border: "#e0e0e0",
    // Light gray - borders
    hoverBg: "#f0f0f0",
    // Very light gray - hover backgrounds
    primary: "#0d3b66",
    // Yale Blue - primary accent
    // Toolbar colors
    toolbarBg: "#ffffff",
    // White - toolbar background
    toolbarIcon: "#0d3b66",
    // Yale Blue - icon color
    toolbarHover: "#f5f5f5",
    // Light gray - hover background
    toolbarActive: "#faf0ca",
    // Lemon Chiffon - active button background
    placeholder: "#999999"
    // Gray - placeholder text
  },
  previewColors: {
    text: "#0d3b66",
    h1: "inherit",
    h2: "inherit",
    h3: "inherit",
    strong: "inherit",
    em: "inherit",
    link: "#0d3b66",
    code: "#0d3b66",
    codeBg: "rgba(244, 211, 94, 0.4)",
    blockquote: "#5a7a9b",
    hr: "#5a7a9b",
    bg: "transparent"
  }
};
var cave = {
  name: "cave",
  colors: {
    bgPrimary: "#141E26",
    // Deep ocean - main background
    bgSecondary: "#1D2D3E",
    // Darker charcoal - editor background
    text: "#c5dde8",
    // Light blue-gray - main text
    textPrimary: "#c5dde8",
    // Light blue-gray - primary text (same as text)
    textSecondary: "#9fcfec",
    // Brighter blue - secondary text
    h1: "#d4a5ff",
    // Rich lavender - h1 headers
    h2: "#f6ae2d",
    // Hunyadi Yellow - h2 headers
    h3: "#9fcfec",
    // Brighter blue - h3 headers
    strong: "#f6ae2d",
    // Hunyadi Yellow - bold text
    em: "#9fcfec",
    // Brighter blue - italic text
    del: "#f6ae2d",
    // Hunyadi Yellow - deleted text (same as strong)
    link: "#9fcfec",
    // Brighter blue - links
    code: "#c5dde8",
    // Light blue-gray - inline code
    codeBg: "#1a232b",
    // Very dark blue - code background
    blockquote: "#9fcfec",
    // Brighter blue - same as italic
    hr: "#c5dde8",
    // Light blue-gray - horizontal rules
    syntaxMarker: "rgba(159, 207, 236, 0.73)",
    // Brighter blue semi-transparent
    syntax: "#7a8c98",
    // Muted gray-blue - syntax highlighting fallback
    cursor: "#f26419",
    // Orange Pantone - cursor
    selection: "rgba(51, 101, 138, 0.4)",
    // Lapis Lazuli with transparency
    listMarker: "#f6ae2d",
    // Hunyadi Yellow - list markers
    rawLine: "#9fcfec",
    // Brighter blue - raw line indicators
    border: "#2a3f52",
    // Dark blue-gray - borders
    hoverBg: "#243546",
    // Slightly lighter charcoal - hover backgrounds
    primary: "#9fcfec",
    // Brighter blue - primary accent
    // Toolbar colors for dark theme
    toolbarBg: "#1D2D3E",
    // Darker charcoal - toolbar background
    toolbarIcon: "#c5dde8",
    // Light blue-gray - icon color
    toolbarHover: "#243546",
    // Slightly lighter charcoal - hover background
    toolbarActive: "#2a3f52",
    // Even lighter - active button background
    placeholder: "#6a7a88"
    // Muted blue-gray - placeholder text
  },
  previewColors: {
    text: "#c5dde8",
    h1: "inherit",
    h2: "inherit",
    h3: "inherit",
    strong: "inherit",
    em: "inherit",
    link: "#9fcfec",
    code: "#c5dde8",
    codeBg: "#1a232b",
    blockquote: "#9fcfec",
    hr: "#c5dde8",
    bg: "transparent"
  }
};
var themes = {
  solar,
  cave,
  auto: solar,
  // Aliases for backward compatibility
  light: solar,
  dark: cave
};
function getTheme(theme) {
  if (typeof theme === "string") {
    const themeObj = themes[theme] || themes.solar;
    return { ...themeObj, name: theme };
  }
  return theme;
}
function resolveAutoTheme(themeName) {
  if (themeName !== "auto")
    return themeName;
  const mq = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
  return (mq == null ? void 0 : mq.matches) ? "cave" : "solar";
}
function themeToCSSVars(colors, previewColors) {
  const vars = [];
  for (const [key, value] of Object.entries(colors)) {
    const varName = key.replace(/([A-Z])/g, "-$1").toLowerCase();
    vars.push(`--${varName}: ${value};`);
  }
  if (previewColors) {
    for (const [key, value] of Object.entries(previewColors)) {
      const varName = key.replace(/([A-Z])/g, "-$1").toLowerCase();
      vars.push(`--preview-${varName}-default: ${value};`);
    }
  }
  return vars.join("\n");
}
function mergeTheme(baseTheme, customColors = {}, customPreviewColors = {}) {
  return {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      ...customColors
    },
    previewColors: {
      ...baseTheme.previewColors,
      ...customPreviewColors
    }
  };
}

// src/styles.js
function generateStyles(options = {}) {
  const {
    fontSize = "14px",
    lineHeight = 1.6,
    /* System-first, guaranteed monospaced; avoids Android 'ui-monospace' pitfalls */
    fontFamily = '"SF Mono", SFMono-Regular, Menlo, Monaco, "Cascadia Code", Consolas, "Roboto Mono", "Noto Sans Mono", "Droid Sans Mono", "Ubuntu Mono", "DejaVu Sans Mono", "Liberation Mono", "Courier New", Courier, monospace',
    padding = "20px",
    theme = null,
    mobile = {}
  } = options;
  const mobileStyles = Object.keys(mobile).length > 0 ? `
    @media (max-width: 640px) {
      .overtype-wrapper .overtype-input,
      .overtype-wrapper .overtype-preview {
        ${Object.entries(mobile).map(([prop, val]) => {
    const cssProp = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
    return `${cssProp}: ${val} !important;`;
  }).join("\n        ")}
      }
    }
  ` : "";
  const themeVars = theme && theme.colors ? themeToCSSVars(theme.colors, theme.previewColors) : "";
  return `
    /* OverType Editor Styles */
    
    /* Middle-ground CSS Reset - Prevent parent styles from leaking in */
    .overtype-container * {
      /* Box model - these commonly leak */
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      
      /* Layout - these can break our layout */
      /* Don't reset position - it breaks dropdowns */
      float: none !important;
      clear: none !important;
      
      /* Typography - only reset decorative aspects */
      text-decoration: none !important;
      text-transform: none !important;
      letter-spacing: normal !important;
      
      /* Visual effects that can interfere */
      box-shadow: none !important;
      text-shadow: none !important;
      
      /* Ensure box-sizing is consistent */
      box-sizing: border-box !important;
      
      /* Keep inheritance for these */
      /* font-family, color, line-height, font-size - inherit */
    }
    
    /* Container base styles after reset */
    .overtype-container {
      display: flex !important;
      flex-direction: column !important;
      width: 100% !important;
      height: 100% !important;
      position: relative !important; /* Override reset - needed for absolute children */
      overflow: visible !important; /* Allow dropdown to overflow container */
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      text-align: left !important;
      ${themeVars ? `
      /* Theme Variables */
      ${themeVars}` : ""}
    }
    
    /* Force left alignment for all elements in the editor */
    .overtype-container .overtype-wrapper * {
      text-align: left !important;
    }
    
    /* Auto-resize mode styles */
    .overtype-container.overtype-auto-resize {
      height: auto !important;
    }

    .overtype-container.overtype-auto-resize .overtype-wrapper {
      flex: 0 0 auto !important; /* Don't grow/shrink, use explicit height */
      height: auto !important;
      min-height: 60px !important;
      overflow: visible !important;
    }
    
    .overtype-wrapper {
      position: relative !important; /* Override reset - needed for absolute children */
      width: 100% !important;
      flex: 1 1 0 !important; /* Grow to fill remaining space, with flex-basis: 0 */
      min-height: 60px !important; /* Minimum usable height */
      overflow: hidden !important;
      background: var(--bg-secondary, #ffffff) !important;
      z-index: 1; /* Below toolbar and dropdown */
    }

    /* Critical alignment styles - must be identical for both layers */
    .overtype-wrapper .overtype-input,
    .overtype-wrapper .overtype-preview {
      /* Positioning - must be identical */
      position: absolute !important; /* Override reset - required for overlay */
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 100% !important;

      /* Font properties - any difference breaks alignment */
      font-family: var(--instance-font-family, ${fontFamily}) !important;
      font-variant-ligatures: none !important; /* keep metrics stable for code */
      font-size: var(--instance-font-size, ${fontSize}) !important;
      line-height: var(--instance-line-height, ${lineHeight}) !important;
      font-weight: normal !important;
      font-style: normal !important;
      font-variant: normal !important;
      font-stretch: normal !important;
      font-kerning: none !important;
      font-feature-settings: normal !important;
      
      /* Box model - must match exactly */
      padding: var(--instance-padding, ${padding}) !important;
      margin: 0 !important;
      border: none !important;
      outline: none !important;
      box-sizing: border-box !important;
      
      /* Text layout - critical for character positioning */
      white-space: pre-wrap !important;
      word-wrap: break-word !important;
      word-break: normal !important;
      overflow-wrap: break-word !important;
      tab-size: 2 !important;
      -moz-tab-size: 2 !important;
      text-align: left !important;
      text-indent: 0 !important;
      letter-spacing: normal !important;
      word-spacing: normal !important;
      
      /* Text rendering */
      text-transform: none !important;
      text-rendering: auto !important;
      -webkit-font-smoothing: auto !important;
      -webkit-text-size-adjust: 100% !important;
      
      /* Direction and writing */
      direction: ltr !important;
      writing-mode: horizontal-tb !important;
      unicode-bidi: normal !important;
      text-orientation: mixed !important;
      
      /* Visual effects that could shift perception */
      text-shadow: none !important;
      filter: none !important;
      transform: none !important;
      zoom: 1 !important;
      
      /* Vertical alignment */
      vertical-align: baseline !important;
      
      /* Size constraints */
      min-width: 0 !important;
      min-height: 0 !important;
      max-width: none !important;
      max-height: none !important;
      
      /* Overflow */
      overflow-y: auto !important;
      overflow-x: auto !important;
      /* overscroll-behavior removed to allow scroll-through to parent */
      scrollbar-width: auto !important;
      scrollbar-gutter: auto !important;
      
      /* Animation/transition - disabled to prevent movement */
      animation: none !important;
      transition: none !important;
    }

    /* Input layer styles */
    .overtype-wrapper .overtype-input {
      /* Layer positioning */
      z-index: 1 !important;
      
      /* Text visibility */
      color: transparent !important;
      caret-color: var(--cursor, #f95738) !important;
      background-color: transparent !important;
      
      /* Textarea-specific */
      resize: none !important;
      appearance: none !important;
      -webkit-appearance: none !important;
      -moz-appearance: none !important;
      
      /* Prevent mobile zoom on focus */
      touch-action: manipulation !important;
      
      /* Disable autofill */
      autocomplete: off !important;
      autocorrect: off !important;
      autocapitalize: off !important;
    }

    .overtype-wrapper .overtype-input::selection {
      background-color: var(--selection, rgba(244, 211, 94, 0.4));
    }

    /* Placeholder shim - visible when textarea is empty */
    .overtype-wrapper .overtype-placeholder {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      z-index: 0 !important;
      pointer-events: none !important;
      user-select: none !important;
      font-family: var(--instance-font-family, ${fontFamily}) !important;
      font-size: var(--instance-font-size, ${fontSize}) !important;
      line-height: var(--instance-line-height, ${lineHeight}) !important;
      padding: var(--instance-padding, ${padding}) !important;
      box-sizing: border-box !important;
      color: var(--placeholder, #999) !important;
    }

    /* Preview layer styles */
    .overtype-wrapper .overtype-preview {
      /* Layer positioning */
      z-index: 0 !important;
      pointer-events: none !important;
      color: var(--text, #0d3b66) !important;
      background-color: transparent !important;
      
      /* Prevent text selection */
      user-select: none !important;
      -webkit-user-select: none !important;
      -moz-user-select: none !important;
      -ms-user-select: none !important;
    }

    /* Prevent external resets (Tailwind, Bootstrap, etc.) from breaking alignment.
       Any element whose font metrics differ from the textarea causes the CSS "strut"
       to inflate line boxes, drifting the overlay. Force inheritance so every element
       inside the preview matches the textarea exactly. */
    .overtype-wrapper .overtype-preview * {
      font-family: inherit !important;
      font-size: inherit !important;
      line-height: inherit !important;
    }

    /* Defensive styles for preview child divs */
    .overtype-wrapper .overtype-preview div {
      /* Reset any inherited styles */
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      text-align: left !important;
      text-indent: 0 !important;
      display: block !important;
      position: static !important;
      transform: none !important;
      min-height: 0 !important;
      max-height: none !important;
      line-height: inherit !important;
      font-size: inherit !important;
      font-family: inherit !important;
    }

    /* Markdown element styling - NO SIZE CHANGES */
    .overtype-wrapper .overtype-preview .header {
      font-weight: bold !important;
    }

    /* Header colors */
    .overtype-wrapper .overtype-preview .h1 { 
      color: var(--h1, #f95738) !important; 
    }
    .overtype-wrapper .overtype-preview .h2 { 
      color: var(--h2, #ee964b) !important; 
    }
    .overtype-wrapper .overtype-preview .h3 { 
      color: var(--h3, #3d8a51) !important; 
    }

    /* Semantic headers - flatten in edit mode */
    .overtype-wrapper .overtype-preview h1,
    .overtype-wrapper .overtype-preview h2,
    .overtype-wrapper .overtype-preview h3 {
      font-size: inherit !important;
      font-weight: bold !important;
      margin: 0 !important;
      padding: 0 !important;
      display: inline !important;
      line-height: inherit !important;
    }

    /* Header colors for semantic headers */
    .overtype-wrapper .overtype-preview h1 { 
      color: var(--h1, #f95738) !important; 
    }
    .overtype-wrapper .overtype-preview h2 { 
      color: var(--h2, #ee964b) !important; 
    }
    .overtype-wrapper .overtype-preview h3 { 
      color: var(--h3, #3d8a51) !important; 
    }

    /* Lists - remove styling in edit mode */
    .overtype-wrapper .overtype-preview ul,
    .overtype-wrapper .overtype-preview ol {
      list-style: none !important;
      margin: 0 !important;
      padding: 0 !important;
      display: block !important; /* Lists need to be block for line breaks */
    }

    .overtype-wrapper .overtype-preview li {
      display: block !important; /* Each item on its own line */
      margin: 0 !important;
      padding: 0 !important;
      /* Don't set list-style here - let ul/ol control it */
    }

    /* Bold text */
    .overtype-wrapper .overtype-preview strong {
      color: var(--strong, #ee964b) !important;
      font-weight: bold !important;
    }

    /* Italic text */
    .overtype-wrapper .overtype-preview em {
      color: var(--em, #f95738) !important;
      text-decoration-color: var(--em, #f95738) !important;
      text-decoration-thickness: 1px !important;
      font-style: italic !important;
    }

    /* Strikethrough text */
    .overtype-wrapper .overtype-preview del {
      color: var(--del, #ee964b) !important;
      text-decoration: line-through !important;
      text-decoration-color: var(--del, #ee964b) !important;
      text-decoration-thickness: 1px !important;
    }

    /* Inline code */
    .overtype-wrapper .overtype-preview code {
      background: var(--code-bg, rgba(244, 211, 94, 0.4)) !important;
      color: var(--code, #0d3b66) !important;
      padding: 0 !important;
      border-radius: 2px !important;
      font-family: inherit !important;
      font-size: inherit !important;
      line-height: inherit !important;
      font-weight: normal !important;
    }

    /* Code blocks - consolidated pre blocks */
    .overtype-wrapper .overtype-preview pre {
      padding: 0 !important;
      margin: 0 !important;
      border-radius: 4px !important;
      overflow-x: auto !important;
    }
    
    /* Code block styling in normal mode - yellow background */
    .overtype-wrapper .overtype-preview pre.code-block {
      background: var(--code-bg, rgba(244, 211, 94, 0.4)) !important;
      white-space: break-spaces !important; /* Prevent horizontal scrollbar that breaks alignment */
    }

    /* Code inside pre blocks - remove background */
    .overtype-wrapper .overtype-preview pre code {
      background: transparent !important;
      color: var(--code, #0d3b66) !important;
      font-family: var(--instance-font-family, ${fontFamily}) !important; /* Match textarea font exactly for alignment */
    }

    /* Blockquotes */
    .overtype-wrapper .overtype-preview .blockquote {
      color: var(--blockquote, #5a7a9b) !important;
      padding: 0 !important;
      margin: 0 !important;
      border: none !important;
    }

    /* Links */
    .overtype-wrapper .overtype-preview a {
      color: var(--link, #0d3b66) !important;
      text-decoration: underline !important;
      font-weight: normal !important;
    }

    .overtype-wrapper .overtype-preview a:hover {
      text-decoration: underline !important;
      color: var(--link, #0d3b66) !important;
    }

    /* Lists - no list styling */
    .overtype-wrapper .overtype-preview ul,
    .overtype-wrapper .overtype-preview ol {
      list-style: none !important;
      margin: 0 !important;
      padding: 0 !important;
    }


    /* Horizontal rules */
    .overtype-wrapper .overtype-preview hr {
      border: none !important;
      color: var(--hr, #5a7a9b) !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    .overtype-wrapper .overtype-preview .hr-marker {
      color: var(--hr, #5a7a9b) !important;
      opacity: 0.6 !important;
    }

    /* Code fence markers - with background when not in code block */
    .overtype-wrapper .overtype-preview .code-fence {
      color: var(--code, #0d3b66) !important;
      background: var(--code-bg, rgba(244, 211, 94, 0.4)) !important;
    }
    
    /* Code block lines - background for entire code block */
    .overtype-wrapper .overtype-preview .code-block-line {
      background: var(--code-bg, rgba(244, 211, 94, 0.4)) !important;
    }
    
    /* Remove background from code fence when inside code block line */
    .overtype-wrapper .overtype-preview .code-block-line .code-fence {
      background: transparent !important;
    }

    /* Raw markdown line */
    .overtype-wrapper .overtype-preview .raw-line {
      color: var(--raw-line, #5a7a9b) !important;
      font-style: normal !important;
      font-weight: normal !important;
    }

    /* Syntax markers */
    .overtype-wrapper .overtype-preview .syntax-marker {
      color: var(--syntax-marker, rgba(13, 59, 102, 0.52)) !important;
      opacity: 0.7 !important;
    }

    /* List markers */
    .overtype-wrapper .overtype-preview .list-marker {
      color: var(--list-marker, #ee964b) !important;
    }

    /* Stats bar */
    
    /* Stats bar - positioned by flexbox */
    .overtype-stats {
      height: 40px !important;
      padding: 0 20px !important;
      background: var(--bg-secondary, #f8f9fa) !important;
      border-top: 1px solid var(--border, #e0e0e0) !important;
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      font-size: 0.85rem !important;
      color: var(--text-secondary, #666) !important;
      flex-shrink: 0 !important; /* Don't shrink */
      z-index: 10001 !important; /* Above link tooltip */
      position: relative !important; /* Enable z-index */
    }


    .overtype-stats .overtype-stat {
      display: flex !important;
      align-items: center !important;
      gap: 5px !important;
      white-space: nowrap !important;
    }
    
    .overtype-stats .live-dot {
      width: 8px !important;
      height: 8px !important;
      background: #4caf50 !important;
      border-radius: 50% !important;
      animation: overtype-pulse 2s infinite !important;
    }
    
    @keyframes overtype-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.6; transform: scale(1.2); }
    }
    

    /* Toolbar Styles */
    .overtype-toolbar.overtype-toolbar-hidden {
      display: none !important;
    }

    .overtype-toolbar {
      display: flex !important;
      align-items: center !important;
      gap: 4px !important;
      padding: 8px !important; /* Override reset */
      background: var(--toolbar-bg, var(--bg-primary, #f8f9fa)) !important; /* Override reset */
      border-bottom: 1px solid var(--toolbar-border, transparent) !important; /* Override reset */
      overflow-x: auto !important; /* Allow horizontal scrolling */
      overflow-y: hidden !important; /* Hide vertical overflow */
      -webkit-overflow-scrolling: touch !important;
      flex-shrink: 0 !important;
      height: auto !important;
      position: relative !important; /* Override reset */
      z-index: 100 !important; /* Ensure toolbar is above wrapper */
      scrollbar-width: thin; /* Thin scrollbar on Firefox */
    }
    
    /* Thin scrollbar styling */
    .overtype-toolbar::-webkit-scrollbar {
      height: 4px;
    }
    
    .overtype-toolbar::-webkit-scrollbar-track {
      background: transparent;
    }
    
    .overtype-toolbar::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.2);
      border-radius: 2px;
    }

    .overtype-toolbar-button {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--toolbar-icon, var(--text-secondary, #666));
      cursor: pointer;
      transition: all 0.2s ease;
      flex-shrink: 0;
    }

    .overtype-toolbar-button svg {
      width: 20px;
      height: 20px;
      fill: currentColor;
    }

    .overtype-toolbar-button:hover {
      background: var(--toolbar-hover, var(--bg-secondary, #e9ecef));
      color: var(--toolbar-icon, var(--text-primary, #333));
    }

    .overtype-toolbar-button:active {
      transform: scale(0.95);
    }

    .overtype-toolbar-button.active {
      background: var(--toolbar-active, var(--primary, #007bff));
      color: var(--toolbar-icon, var(--text-primary, #333));
    }

    .overtype-toolbar-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .overtype-toolbar-separator {
      width: 1px;
      height: 24px;
      background: var(--border, #e0e0e0);
      margin: 0 4px;
      flex-shrink: 0;
    }

    /* Adjust wrapper when toolbar is present */
    /* Mobile toolbar adjustments */
    @media (max-width: 640px) {
      .overtype-toolbar {
        padding: 6px;
        gap: 2px;
      }

      .overtype-toolbar-button {
        width: 36px;
        height: 36px;
      }

      .overtype-toolbar-separator {
        margin: 0 2px;
      }
    }
    
    /* Plain mode - hide preview and show textarea text */
    .overtype-container[data-mode="plain"] .overtype-preview {
      display: none !important;
    }
    
    .overtype-container[data-mode="plain"] .overtype-input {
      color: var(--text, #0d3b66) !important;
      /* Use system font stack for better plain text readability */
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, 
                   "Helvetica Neue", Arial, sans-serif !important;
    }
    
    /* Ensure textarea remains transparent in overlay mode */
    .overtype-container:not([data-mode="plain"]) .overtype-input {
      color: transparent !important;
    }

    /* Dropdown menu styles */
    .overtype-toolbar-button {
      position: relative !important; /* Override reset - needed for dropdown */
    }

    .overtype-toolbar-button.dropdown-active {
      background: var(--toolbar-active, var(--hover-bg, #f0f0f0));
    }

    .overtype-dropdown-menu {
      position: fixed !important; /* Fixed positioning relative to viewport */
      background: var(--bg-secondary, white) !important; /* Override reset */
      border: 1px solid var(--border, #e0e0e0) !important; /* Override reset */
      border-radius: 6px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1) !important; /* Override reset */
      z-index: 10000; /* Very high z-index to ensure visibility */
      min-width: 150px;
      padding: 4px 0 !important; /* Override reset */
      /* Position will be set via JavaScript based on button position */
    }

    .overtype-dropdown-item {
      display: flex;
      align-items: center;
      width: 100%;
      padding: 8px 12px;
      border: none;
      background: none;
      text-align: left;
      cursor: pointer;
      font-size: 14px;
      color: var(--text, #333);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    .overtype-dropdown-item:hover {
      background: var(--hover-bg, #f0f0f0);
    }

    .overtype-dropdown-item.active {
      font-weight: 600;
    }

    .overtype-dropdown-check {
      width: 16px;
      margin-right: 8px;
      color: var(--h1, #007bff);
    }

    .overtype-dropdown-icon {
      width: 20px;
      margin-right: 8px;
      text-align: center;
    }

    /* P3 \u300C\u66F4\u591A\u300D\u9762\u677F\uFF1A\u5206\u7EC4\u6536\u7EB3\u6269\u5C55\u9879 */
    .overtype-more-panel {
      min-width: 220px;
      padding: 6px 8px !important;
      box-sizing: border-box;
    }

    .overtype-more-group {
      padding: 2px 0;
    }

    .overtype-more-group-title {
      font-size: 11px;
      color: var(--text-secondary, #888);
      letter-spacing: 0.5px;
      padding: 4px 6px 2px;
      user-select: none;
    }

    .overtype-more-item {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      margin: 2px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--toolbar-icon, var(--text-secondary, #666));
      cursor: pointer;
      transition: background 0.2s ease;
    }

    .overtype-more-item svg {
      width: 18px;
      height: 18px;
      fill: currentColor;
    }

    .overtype-more-item:hover,
    .overtype-more-item.active {
      background: var(--toolbar-hover, var(--bg-secondary, #e9ecef));
      color: var(--toolbar-icon, var(--text-primary, #333));
    }

    /* Preview mode styles */
    .overtype-container[data-mode="preview"] .overtype-input {
      display: none !important;
    }

    .overtype-container[data-mode="preview"] .overtype-preview {
      pointer-events: auto !important;
      user-select: text !important;
      cursor: text !important;
    }

    .overtype-container.overtype-auto-resize[data-mode="preview"] .overtype-preview {
      position: static !important;
      height: auto !important;
    }

    /* Hide syntax markers in preview mode */
    .overtype-container[data-mode="preview"] .syntax-marker {
      display: none !important;
    }
    
    /* Hide URL part of links in preview mode - extra specificity */
    .overtype-container[data-mode="preview"] .syntax-marker.url-part,
    .overtype-container[data-mode="preview"] .url-part {
      display: none !important;
    }
    
    /* Hide all syntax markers inside links too */
    .overtype-container[data-mode="preview"] a .syntax-marker {
      display: none !important;
    }

    /* Headers - restore proper sizing in preview mode */
    .overtype-container[data-mode="preview"] .overtype-wrapper .overtype-preview h1,
    .overtype-container[data-mode="preview"] .overtype-wrapper .overtype-preview h2,
    .overtype-container[data-mode="preview"] .overtype-wrapper .overtype-preview h3 {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      font-weight: 600 !important;
      margin: 0 !important;
      display: block !important;
      line-height: 1 !important;
    }

    .overtype-container[data-mode="preview"] .overtype-wrapper .overtype-preview h1 {
      font-size: 2em !important;
      color: var(--preview-h1, var(--preview-h1-default)) !important;
    }

    .overtype-container[data-mode="preview"] .overtype-wrapper .overtype-preview h2 {
      font-size: 1.5em !important;
      color: var(--preview-h2, var(--preview-h2-default)) !important;
    }

    .overtype-container[data-mode="preview"] .overtype-wrapper .overtype-preview h3 {
      font-size: 1.17em !important;
      color: var(--preview-h3, var(--preview-h3-default)) !important;
    }

    /* Lists - restore list styling in preview mode */
    .overtype-container[data-mode="preview"] .overtype-wrapper .overtype-preview ul {
      display: block !important;
      list-style: disc !important;
      padding-left: 2em !important;
      margin: 1em 0 !important;
    }

    .overtype-container[data-mode="preview"] .overtype-wrapper .overtype-preview ol {
      display: block !important;
      list-style: decimal !important;
      padding-left: 2em !important;
      margin: 1em 0 !important;
    }
    
    .overtype-container[data-mode="preview"] .overtype-wrapper .overtype-preview li {
      display: list-item !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    /* Task list checkboxes - only in preview mode */
    .overtype-container[data-mode="preview"] .overtype-wrapper .overtype-preview li.task-list {
      list-style: none !important;
      position: relative !important;
    }

    .overtype-container[data-mode="preview"] .overtype-wrapper .overtype-preview li.task-list input[type="checkbox"] {
      margin-right: 0.5em !important;
      cursor: default !important;
      vertical-align: middle !important;
    }

    /* Task list in normal mode - keep syntax visible */
    .overtype-container:not([data-mode="preview"]) .overtype-wrapper .overtype-preview li.task-list {
      list-style: none !important;
    }

    .overtype-container:not([data-mode="preview"]) .overtype-wrapper .overtype-preview li.task-list .syntax-marker {
      color: var(--syntax, #999999) !important;
      font-weight: normal !important;
    }

    /* Links - make clickable in preview mode */
    .overtype-container[data-mode="preview"] .overtype-wrapper .overtype-preview a {
      pointer-events: auto !important;
      cursor: pointer !important;
      color: var(--preview-link, var(--preview-link-default)) !important;
      text-decoration: underline !important;
    }

    /* Code blocks - proper pre/code styling in preview mode */
    .overtype-container[data-mode="preview"] .overtype-wrapper .overtype-preview pre.code-block {
      background: var(--preview-code-bg, var(--preview-code-bg-default)) !important;
      color: var(--preview-code, var(--preview-code-default)) !important;
      padding: 1.2em !important;
      border-radius: 3px !important;
      overflow-x: auto !important;
      margin: 0 !important;
      display: block !important;
    }

    .overtype-container[data-mode="preview"] .overtype-wrapper .overtype-preview pre.code-block code {
      background: transparent !important;
      color: inherit !important;
      padding: 0 !important;
      font-family: ${fontFamily} !important;
      font-size: 0.9em !important;
      line-height: 1.4 !important;
    }

    /* Hide old code block lines and fences in preview mode */
    .overtype-container[data-mode="preview"] .overtype-wrapper .overtype-preview .code-block-line {
      display: none !important;
    }

    .overtype-container[data-mode="preview"] .overtype-wrapper .overtype-preview .code-fence {
      display: none !important;
    }

    /* Blockquotes - enhanced styling in preview mode */
    .overtype-container[data-mode="preview"] .overtype-wrapper .overtype-preview .blockquote {
      display: block !important;
      border-left: 4px solid var(--preview-blockquote, var(--preview-blockquote-default)) !important;
      color: var(--preview-blockquote, var(--preview-blockquote-default)) !important;
      padding-left: 1em !important;
      margin: 1em 0 !important;
      font-style: italic !important;
    }

    /* Typography improvements in preview mode */
    .overtype-container[data-mode="preview"] .overtype-wrapper .overtype-preview {
      font-family: Georgia, 'Times New Roman', serif !important;
      font-size: 16px !important;
      line-height: 1.8 !important;
      color: var(--preview-text, var(--preview-text-default)) !important;
      background: var(--preview-bg, var(--preview-bg-default)) !important;
    }

    /* Inline code in preview mode - keep monospace */
    .overtype-container[data-mode="preview"] .overtype-wrapper .overtype-preview code {
      font-family: ${fontFamily} !important;
      font-size: 0.9em !important;
      background: var(--preview-code-bg, var(--preview-code-bg-default)) !important;
      color: var(--preview-code, var(--preview-code-default)) !important;
      padding: 0.2em 0.4em !important;
      border-radius: 3px !important;
    }

    /* Strong and em elements in preview mode */
    .overtype-container[data-mode="preview"] .overtype-wrapper .overtype-preview strong {
      font-weight: 700 !important;
      color: var(--preview-strong, var(--preview-strong-default)) !important;
    }

    .overtype-container[data-mode="preview"] .overtype-wrapper .overtype-preview em {
      font-style: italic !important;
      color: var(--preview-em, var(--preview-em-default)) !important;
    }

    /* HR in preview mode */
    .overtype-container[data-mode="preview"] .overtype-wrapper .overtype-preview .hr-marker {
      display: block !important;
      border-top: 2px solid var(--preview-hr, var(--preview-hr-default)) !important;
      text-indent: -9999px !important;
      height: 2px !important;
    }

    /* ===== Instant-render (IR) mode ===== */
    /* Hide the wrapper-level preview layer; blocks own the rendering */
    .overtype-container[data-mode="ir"] .overtype-wrapper > .overtype-preview {
      display: none !important;
    }

    .overtype-container[data-mode="ir"] .overtype-wrapper > .overtype-placeholder {
      pointer-events: none !important;
    }

    /* Block container: fills the wrapper and scrolls */
    .overtype-container[data-mode="ir"] .overtype-ir-container {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      box-sizing: border-box !important;
      padding: var(--instance-padding, ${padding}) !important;
    }

    .overtype-container.overtype-auto-resize[data-mode="ir"] .overtype-ir-container {
      position: static !important;
      height: auto !important;
    }

    /* Block base */
    .overtype-container[data-mode="ir"] .overtype-ir-block {
      position: relative !important;
      min-height: 1.5em !important;
      padding: 1px 4px !important;
      margin: 2px 0 !important;
      border-radius: 4px !important;
      user-select: none !important;
      -webkit-user-select: none !important;
      cursor: text !important;
    }

    .overtype-container[data-mode="ir"] .overtype-ir-block:not(.active):hover {
      background: var(--hover-bg, rgba(128, 128, 128, 0.08)) !important;
    }

    /* Active block: block-scoped overlay alignment
       (preview stays in flow to set the height, textarea covers it) */
    .overtype-container[data-mode="ir"] .overtype-ir-block.active .overtype-ir-block-preview {
      position: static !important;
      width: 100% !important;
      height: auto !important;
      min-height: 1.5em !important;
      padding: 0 !important;
      overflow: visible !important;
    }

    .overtype-container[data-mode="ir"] .overtype-ir-block.active .overtype-input {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 100% !important;
      padding: 0 !important;
      overflow: hidden !important;
    }

    /* Inactive blocks: rich-text rendering (mirrors preview mode typography),
       colors reuse the default edit-mode identifiers (theme-aware) */
    .overtype-container[data-mode="ir"] .overtype-ir-block:not(.active) {
      font-family: Georgia, 'Times New Roman', serif !important;
      font-size: 16px !important;
      line-height: 1.8 !important;
      color: var(--text, #0d3b66) !important;
    }

    .overtype-container[data-mode="ir"] .overtype-ir-block:not(.active) .syntax-marker,
    .overtype-container[data-mode="ir"] .overtype-ir-block:not(.active) .syntax-marker.url-part,
    .overtype-container[data-mode="ir"] .overtype-ir-block:not(.active) a .syntax-marker,
    .overtype-container[data-mode="ir"] .overtype-ir-block:not(.active) .code-fence,
    .overtype-container[data-mode="ir"] .overtype-ir-block:not(.active) .code-block-line {
      display: none !important;
    }

    .overtype-container[data-mode="ir"] .overtype-ir-block:not(.active) h1,
    .overtype-container[data-mode="ir"] .overtype-ir-block:not(.active) h2,
    .overtype-container[data-mode="ir"] .overtype-ir-block:not(.active) h3 {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      font-weight: 600 !important;
      margin: 0.4em 0 0.2em 0 !important;
      display: block !important;
      line-height: 1.3 !important;
    }

    .overtype-container[data-mode="ir"] .overtype-ir-block:not(.active) h1 {
      font-size: 1.8em !important;
      color: var(--h1, #f95738) !important;
    }

    .overtype-container[data-mode="ir"] .overtype-ir-block:not(.active) h2 {
      font-size: 1.4em !important;
      color: var(--h2, #ee964b) !important;
    }

    .overtype-container[data-mode="ir"] .overtype-ir-block:not(.active) h3 {
      font-size: 1.17em !important;
      color: var(--h3, #3d8a51) !important;
    }

    .overtype-container[data-mode="ir"] .overtype-ir-block:not(.active) ul {
      display: block !important;
      list-style: disc !important;
      padding-left: 2em !important;
      margin: 0.4em 0 !important;
    }

    .overtype-container[data-mode="ir"] .overtype-ir-block:not(.active) ol {
      display: block !important;
      list-style: decimal !important;
      padding-left: 2em !important;
      margin: 0.4em 0 !important;
    }

    .overtype-container[data-mode="ir"] .overtype-ir-block:not(.active) li {
      display: list-item !important;
      margin: 0.15em 0 !important;
      padding: 0 !important;
    }

    /* List bullet/number reuses default edit-mode list marker color */
    .overtype-container[data-mode="ir"] .overtype-ir-block:not(.active) li::marker {
      color: var(--list-marker, #ee964b);
    }

    .overtype-container[data-mode="ir"] .overtype-ir-block:not(.active) li.task-list {
      list-style: none !important;
    }

    .overtype-container[data-mode="ir"] .overtype-ir-block:not(.active) li.task-list input[type="checkbox"] {
      margin-right: 0.5em !important;
      vertical-align: middle !important;
    }

    .overtype-container[data-mode="ir"] .overtype-ir-block:not(.active) .blockquote {
      display: block !important;
      border-left: 4px solid var(--blockquote, #5a7a9b) !important;
      color: var(--blockquote, #5a7a9b) !important;
      padding-left: 1em !important;
      margin: 0.4em 0 !important;
      font-style: italic !important;
    }

    .overtype-container[data-mode="ir"] .overtype-ir-block:not(.active) strong {
      font-weight: 700 !important;
      color: var(--strong, #ee964b) !important;
    }

    .overtype-container[data-mode="ir"] .overtype-ir-block:not(.active) em {
      font-style: italic !important;
      color: var(--em, #f95738) !important;
    }

    .overtype-container[data-mode="ir"] .overtype-ir-block:not(.active) del {
      text-decoration: line-through !important;
      color: var(--del, #ee964b) !important;
    }

    .overtype-container[data-mode="ir"] .overtype-ir-block:not(.active) a {
      pointer-events: auto !important;
      cursor: pointer !important;
      color: var(--link, #0d3b66) !important;
      text-decoration: underline !important;
    }

    .overtype-container[data-mode="ir"] .overtype-ir-block:not(.active) code {
      font-family: ${fontFamily} !important;
      font-size: 0.9em !important;
      background: var(--code-bg, rgba(244, 211, 94, 0.4)) !important;
      color: var(--code, #0d3b66) !important;
      padding: 0.2em 0.4em !important;
      border-radius: 3px !important;
    }

    .overtype-container[data-mode="ir"] .overtype-ir-block:not(.active) pre.code-block {
      background: var(--code-bg, rgba(244, 211, 94, 0.4)) !important;
      color: var(--code, #0d3b66) !important;
      padding: 1.2em !important;
      border-radius: 3px !important;
      overflow-x: auto !important;
      margin: 0.4em 0 !important;
      display: block !important;
    }

    .overtype-container[data-mode="ir"] .overtype-ir-block:not(.active) pre.code-block code {
      background: transparent !important;
      color: inherit !important;
      padding: 0 !important;
      font-family: ${fontFamily} !important;
      font-size: 0.9em !important;
      line-height: 1.4 !important;
    }

    .overtype-container[data-mode="ir"] .overtype-ir-block:not(.active) .hr-marker {
      display: block !important;
      border-top: 2px solid var(--hr, #5a7a9b) !important;
      text-indent: -9999px !important;
      height: 2px !important;
      margin: 0.6em 0 !important;
    }

    /* Link Tooltip */
    .overtype-link-tooltip {
      background: #333 !important;
      color: white !important;
      padding: 6px 10px !important;
      border-radius: 16px !important;
      font-size: 12px !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
      display: flex !important;
      visibility: hidden !important;
      pointer-events: none !important;
      z-index: 10000 !important;
      cursor: pointer !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
      max-width: 300px !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      position: fixed;
      top: 0;
      left: 0;
    }

    .overtype-link-tooltip.visible {
      visibility: visible !important;
      pointer-events: auto !important;
    }

    /* ==== OvertypeWindow shell (medium: 'window') ==== */
    .overtype-window {
      display: flex !important;
      flex-direction: column !important;
      width: 100% !important;
      height: 100% !important;
      min-height: 320px !important;
      background: var(--bg-primary, #fff);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: var(--text-primary, #333);
      overflow: hidden;
      border-radius: 8px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
    }

    .overtype-window * {
      box-sizing: border-box;
    }

    /* Title bar */
    .ow-titlebar {
      display: flex !important;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border, #e5e5e5);
      flex: 0 0 auto;
    }
    .ow-title-input {
      flex: 1 1 auto;
      min-width: 0;
      border: none;
      background: transparent;
      font-size: 15px;
      font-weight: 600;
      color: inherit;
      outline: none;
      padding: 4px 6px;
    }
    .ow-collapse {
      flex: 0 0 auto;
      width: 26px;
      height: 26px;
      border: none;
      background: transparent;
      cursor: pointer;
      border-radius: 4px;
      color: inherit;
      opacity: 0.6;
    }
    .ow-collapse:hover { background: var(--bg-secondary, #f0f0f0); opacity: 1; }

    /* Body: outline | editor */
    .ow-body {
      display: flex !important;
      flex: 1 1 auto;
      min-height: 0;
      position: relative;
    }
    .ow-outline {
      flex: 0 0 200px;
      min-width: 140px;
      max-width: 60%;
      overflow-y: auto;
      padding: 8px 4px;
      border-right: 1px solid var(--border, #e5e5e5);
      background: var(--bg-secondary, #fafafa);
      transition: flex-basis 0.15s ease, opacity 0.15s ease;
    }
    .ow-outline-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      opacity: 0.6;
      padding: 4px 8px 8px;
      font-weight: 600;
    }
    .ow-outline-list { list-style: none; padding: 0; margin: 0; }
    .ow-outline-item a {
      display: block;
      padding: 4px 8px;
      color: inherit;
      text-decoration: none;
      border-radius: 4px;
      font-size: 13px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
    }
    .ow-outline-item a:hover { background: var(--bg-primary, #fff); }
    .ow-outline-h2 a { padding-left: 14px; }
    .ow-outline-h3 a { padding-left: 22px; }
    .ow-outline-h4 a { padding-left: 30px; }
    .ow-outline-h5 a { padding-left: 38px; }
    .ow-outline-h6 a { padding-left: 46px; }
    .ow-outline-empty { padding: 8px; font-size: 12px; opacity: 0.5; }

    /* Resizer gutter */
    .ow-resizer {
      flex: 0 0 5px;
      cursor: col-resize;
      background: transparent;
      position: relative;
      z-index: 2;
    }
    .ow-resizer:hover { background: var(--accent, #4a90d9); opacity: 0.4; }
    body.ow-resizing { cursor: col-resize; user-select: none; }

    /* Editor mount */
    .ow-editor {
      flex: 1 1 auto;
      min-width: 0;
      min-height: 0;
      display: flex;
    }
    .ow-editor .overtype-container {
      border: none;
      height: 100%;
    }
    .ow-editor .overtype-container .overtype-wrapper {
      min-height: 0;
    }

    /* Collapsed outline */
    .ow-body.ow-outline-collapsed .ow-outline,
    .ow-body.ow-outline-collapsed .ow-resizer {
      display: none;
    }

    /* Status bar */
    .ow-statusbar {
      display: flex !important;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 4px 12px;
      border-top: 1px solid var(--border, #e5e5e5);
      font-size: 12px;
      color: var(--text-secondary, #888);
      flex: 0 0 auto;
      background: var(--bg-secondary, #fafafa);
    }
    .ow-status-mode {
      font-weight: 600;
      opacity: 0.7;
    }

    .overtype-window svg { width: 16px; height: 16px; }

    ${mobileStyles}
  `;
}

// ../../node_modules/markdown-actions/dist/markdown-actions.esm.js
var markdown_actions_esm_exports = {};
__export(markdown_actions_esm_exports, {
  applyCustomFormat: () => applyCustomFormat,
  default: () => src_default,
  expandSelection: () => expandSelection2,
  getActiveFormats: () => getActiveFormats2,
  getDebugMode: () => getDebugMode,
  hasFormat: () => hasFormat2,
  insertHeader: () => insertHeader,
  insertLink: () => insertLink,
  preserveSelection: () => preserveSelection,
  setDebugMode: () => setDebugMode,
  setUndoMethod: () => setUndoMethod,
  toggleBold: () => toggleBold,
  toggleBulletList: () => toggleBulletList,
  toggleCode: () => toggleCode,
  toggleH1: () => toggleH1,
  toggleH2: () => toggleH2,
  toggleH3: () => toggleH3,
  toggleItalic: () => toggleItalic,
  toggleNumberedList: () => toggleNumberedList,
  toggleQuote: () => toggleQuote,
  toggleTaskList: () => toggleTaskList
});
var __defProp2 = Object.defineProperty;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp2 = (obj, key, value) => key in obj ? __defProp2(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp2(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp2(a, prop, b[prop]);
    }
  return a;
};
var FORMATS = {
  bold: {
    prefix: "**",
    suffix: "**",
    trimFirst: true
  },
  italic: {
    prefix: "_",
    suffix: "_",
    trimFirst: true
  },
  code: {
    prefix: "`",
    suffix: "`",
    blockPrefix: "```",
    blockSuffix: "```"
  },
  link: {
    prefix: "[",
    suffix: "](url)",
    replaceNext: "url",
    scanFor: "https?://"
  },
  bulletList: {
    prefix: "- ",
    multiline: true,
    unorderedList: true
  },
  numberedList: {
    prefix: "1. ",
    multiline: true,
    orderedList: true
  },
  quote: {
    prefix: "> ",
    multiline: true,
    surroundWithNewlines: true
  },
  taskList: {
    prefix: "- [ ] ",
    multiline: true,
    surroundWithNewlines: true
  },
  header1: { prefix: "# " },
  header2: { prefix: "## " },
  header3: { prefix: "### " },
  header4: { prefix: "#### " },
  header5: { prefix: "##### " },
  header6: { prefix: "###### " }
};
function getDefaultStyle() {
  return {
    prefix: "",
    suffix: "",
    blockPrefix: "",
    blockSuffix: "",
    multiline: false,
    replaceNext: "",
    prefixSpace: false,
    scanFor: "",
    surroundWithNewlines: false,
    orderedList: false,
    unorderedList: false,
    trimFirst: false
  };
}
function mergeWithDefaults(format) {
  return __spreadValues(__spreadValues({}, getDefaultStyle()), format);
}
var debugMode = false;
function setDebugMode(enabled) {
  debugMode = enabled;
}
function getDebugMode() {
  return debugMode;
}
function debugLog(funcName, message, data) {
  if (!debugMode)
    return;
  console.group(`\u{1F50D} ${funcName}`);
  console.log(message);
  if (data) {
    console.log("Data:", data);
  }
  console.groupEnd();
}
function debugSelection(textarea, label) {
  if (!debugMode)
    return;
  const selected = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
  console.group(`\u{1F4CD} Selection: ${label}`);
  console.log("Position:", `${textarea.selectionStart}-${textarea.selectionEnd}`);
  console.log("Selected text:", JSON.stringify(selected));
  console.log("Length:", selected.length);
  const before = textarea.value.slice(Math.max(0, textarea.selectionStart - 10), textarea.selectionStart);
  const after = textarea.value.slice(textarea.selectionEnd, Math.min(textarea.value.length, textarea.selectionEnd + 10));
  console.log("Context:", JSON.stringify(before) + "[SELECTION]" + JSON.stringify(after));
  console.groupEnd();
}
function debugResult(result) {
  if (!debugMode)
    return;
  console.group("\u{1F4DD} Result");
  console.log("Text to insert:", JSON.stringify(result.text));
  console.log("New selection:", `${result.selectionStart}-${result.selectionEnd}`);
  console.groupEnd();
}
var canInsertText = null;
function insertText(textarea, { text, selectionStart, selectionEnd }) {
  const debugMode2 = getDebugMode();
  if (debugMode2) {
    console.group("\u{1F527} insertText");
    console.log("Current selection:", `${textarea.selectionStart}-${textarea.selectionEnd}`);
    console.log("Text to insert:", JSON.stringify(text));
    console.log("New selection to set:", selectionStart, "-", selectionEnd);
  }
  textarea.focus();
  const originalSelectionStart = textarea.selectionStart;
  const originalSelectionEnd = textarea.selectionEnd;
  const before = textarea.value.slice(0, originalSelectionStart);
  const after = textarea.value.slice(originalSelectionEnd);
  if (debugMode2) {
    console.log("Before text (last 20):", JSON.stringify(before.slice(-20)));
    console.log("After text (first 20):", JSON.stringify(after.slice(0, 20)));
    console.log("Selected text being replaced:", JSON.stringify(textarea.value.slice(originalSelectionStart, originalSelectionEnd)));
  }
  const originalValue = textarea.value;
  const hasSelection = originalSelectionStart !== originalSelectionEnd;
  if (canInsertText === null || canInsertText === true) {
    textarea.contentEditable = "true";
    try {
      canInsertText = document.execCommand("insertText", false, text);
      if (debugMode2)
        console.log("execCommand returned:", canInsertText, "for text with", text.split("\n").length, "lines");
    } catch (error) {
      canInsertText = false;
      if (debugMode2)
        console.log("execCommand threw error:", error);
    }
    textarea.contentEditable = "false";
  }
  if (debugMode2) {
    console.log("canInsertText before:", canInsertText);
    console.log("execCommand result:", canInsertText);
  }
  if (canInsertText) {
    const expectedValue = before + text + after;
    const actualValue = textarea.value;
    if (debugMode2) {
      console.log("Expected length:", expectedValue.length);
      console.log("Actual length:", actualValue.length);
    }
    if (actualValue !== expectedValue) {
      if (debugMode2) {
        console.log("execCommand changed the value but not as expected");
        console.log("Expected:", JSON.stringify(expectedValue.slice(0, 100)));
        console.log("Actual:", JSON.stringify(actualValue.slice(0, 100)));
      }
    }
  }
  if (!canInsertText) {
    if (debugMode2)
      console.log("Using manual insertion");
    if (textarea.value === originalValue) {
      if (debugMode2)
        console.log("Value unchanged, doing manual replacement");
      try {
        document.execCommand("ms-beginUndoUnit");
      } catch (e) {
      }
      textarea.value = before + text + after;
      try {
        document.execCommand("ms-endUndoUnit");
      } catch (e) {
      }
      textarea.dispatchEvent(new CustomEvent("input", { bubbles: true, cancelable: true }));
    } else {
      if (debugMode2)
        console.log("Value was changed by execCommand, skipping manual insertion");
    }
  }
  if (debugMode2)
    console.log("Setting selection range:", selectionStart, selectionEnd);
  if (selectionStart != null && selectionEnd != null) {
    textarea.setSelectionRange(selectionStart, selectionEnd);
  } else {
    textarea.setSelectionRange(originalSelectionStart, textarea.selectionEnd);
  }
  if (debugMode2) {
    console.log("Final value length:", textarea.value.length);
    console.groupEnd();
  }
}
function setUndoMethod(method) {
  switch (method) {
    case "native":
      canInsertText = true;
      break;
    case "manual":
      canInsertText = false;
      break;
    case "auto":
      canInsertText = null;
      break;
  }
}
function isMultipleLines(string) {
  return string.trim().split("\n").length > 1;
}
function wordSelectionStart(text, i) {
  let index = i;
  while (text[index] && text[index - 1] != null && !text[index - 1].match(/\s/)) {
    index--;
  }
  return index;
}
function wordSelectionEnd(text, i, multiline) {
  let index = i;
  const breakpoint = multiline ? /\n/ : /\s/;
  while (text[index] && !text[index].match(breakpoint)) {
    index++;
  }
  return index;
}
function expandSelectionToLine(textarea) {
  const lines = textarea.value.split("\n");
  let counter = 0;
  for (let index = 0; index < lines.length; index++) {
    const lineLength = lines[index].length + 1;
    if (textarea.selectionStart >= counter && textarea.selectionStart < counter + lineLength) {
      textarea.selectionStart = counter;
    }
    if (textarea.selectionEnd >= counter && textarea.selectionEnd < counter + lineLength) {
      if (index === lines.length - 1) {
        textarea.selectionEnd = Math.min(counter + lines[index].length, textarea.value.length);
      } else {
        textarea.selectionEnd = counter + lineLength - 1;
      }
    }
    counter += lineLength;
  }
}
function expandSelectedText(textarea, prefixToUse, suffixToUse, multiline = false) {
  if (textarea.selectionStart === textarea.selectionEnd) {
    textarea.selectionStart = wordSelectionStart(textarea.value, textarea.selectionStart);
    textarea.selectionEnd = wordSelectionEnd(textarea.value, textarea.selectionEnd, multiline);
  } else {
    const expandedSelectionStart = textarea.selectionStart - prefixToUse.length;
    const expandedSelectionEnd = textarea.selectionEnd + suffixToUse.length;
    const beginsWithPrefix = textarea.value.slice(expandedSelectionStart, textarea.selectionStart) === prefixToUse;
    const endsWithSuffix = textarea.value.slice(textarea.selectionEnd, expandedSelectionEnd) === suffixToUse;
    if (beginsWithPrefix && endsWithSuffix) {
      textarea.selectionStart = expandedSelectionStart;
      textarea.selectionEnd = expandedSelectionEnd;
    }
  }
  return textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
}
function newlinesToSurroundSelectedText(textarea) {
  const beforeSelection = textarea.value.slice(0, textarea.selectionStart);
  const afterSelection = textarea.value.slice(textarea.selectionEnd);
  const breaksBefore = beforeSelection.match(/\n*$/);
  const breaksAfter = afterSelection.match(/^\n*/);
  const newlinesBeforeSelection = breaksBefore ? breaksBefore[0].length : 0;
  const newlinesAfterSelection = breaksAfter ? breaksAfter[0].length : 0;
  let newlinesToAppend = "";
  let newlinesToPrepend = "";
  if (beforeSelection.match(/\S/) && newlinesBeforeSelection < 2) {
    newlinesToAppend = "\n".repeat(2 - newlinesBeforeSelection);
  }
  if (afterSelection.match(/\S/) && newlinesAfterSelection < 2) {
    newlinesToPrepend = "\n".repeat(2 - newlinesAfterSelection);
  }
  return { newlinesToAppend, newlinesToPrepend };
}
function preserveSelection(textarea, callback) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const scrollTop = textarea.scrollTop;
  callback();
  textarea.selectionStart = start;
  textarea.selectionEnd = end;
  textarea.scrollTop = scrollTop;
}
function applyLineOperation(textarea, operation, options = {}) {
  const originalStart = textarea.selectionStart;
  const originalEnd = textarea.selectionEnd;
  const noInitialSelection = originalStart === originalEnd;
  const value = textarea.value;
  let lineStart = originalStart;
  while (lineStart > 0 && value[lineStart - 1] !== "\n") {
    lineStart--;
  }
  if (noInitialSelection) {
    let lineEnd = originalStart;
    while (lineEnd < value.length && value[lineEnd] !== "\n") {
      lineEnd++;
    }
    textarea.selectionStart = lineStart;
    textarea.selectionEnd = lineEnd;
  } else {
    expandSelectionToLine(textarea);
  }
  const result = operation(textarea);
  if (options.adjustSelection) {
    const selectedText = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
    const isRemoving = selectedText.startsWith(options.prefix);
    const adjusted = options.adjustSelection(isRemoving, originalStart, originalEnd, lineStart);
    result.selectionStart = adjusted.start;
    result.selectionEnd = adjusted.end;
  } else if (options.prefix) {
    const selectedText = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
    const isRemoving = selectedText.startsWith(options.prefix);
    if (noInitialSelection) {
      if (isRemoving) {
        result.selectionStart = Math.max(originalStart - options.prefix.length, lineStart);
        result.selectionEnd = result.selectionStart;
      } else {
        result.selectionStart = originalStart + options.prefix.length;
        result.selectionEnd = result.selectionStart;
      }
    } else {
      if (isRemoving) {
        result.selectionStart = Math.max(originalStart - options.prefix.length, lineStart);
        result.selectionEnd = Math.max(originalEnd - options.prefix.length, lineStart);
      } else {
        result.selectionStart = originalStart + options.prefix.length;
        result.selectionEnd = originalEnd + options.prefix.length;
      }
    }
  }
  return result;
}
function blockStyle(textarea, style) {
  let newlinesToAppend;
  let newlinesToPrepend;
  const { prefix, suffix, blockPrefix, blockSuffix, replaceNext, prefixSpace, scanFor, surroundWithNewlines, trimFirst } = style;
  const originalSelectionStart = textarea.selectionStart;
  const originalSelectionEnd = textarea.selectionEnd;
  let selectedText = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
  let prefixToUse = isMultipleLines(selectedText) && blockPrefix && blockPrefix.length > 0 ? `${blockPrefix}
` : prefix;
  let suffixToUse = isMultipleLines(selectedText) && blockSuffix && blockSuffix.length > 0 ? `
${blockSuffix}` : suffix;
  if (prefixSpace) {
    const beforeSelection = textarea.value[textarea.selectionStart - 1];
    if (textarea.selectionStart !== 0 && beforeSelection != null && !beforeSelection.match(/\s/)) {
      prefixToUse = ` ${prefixToUse}`;
    }
  }
  selectedText = expandSelectedText(textarea, prefixToUse, suffixToUse, style.multiline);
  let selectionStart = textarea.selectionStart;
  let selectionEnd = textarea.selectionEnd;
  const hasReplaceNext = replaceNext && replaceNext.length > 0 && suffixToUse.indexOf(replaceNext) > -1 && selectedText.length > 0;
  if (surroundWithNewlines) {
    const ref = newlinesToSurroundSelectedText(textarea);
    newlinesToAppend = ref.newlinesToAppend;
    newlinesToPrepend = ref.newlinesToPrepend;
    prefixToUse = newlinesToAppend + prefix;
    suffixToUse += newlinesToPrepend;
  }
  if (selectedText.startsWith(prefixToUse) && selectedText.endsWith(suffixToUse)) {
    const replacementText = selectedText.slice(prefixToUse.length, selectedText.length - suffixToUse.length);
    if (originalSelectionStart === originalSelectionEnd) {
      let position = originalSelectionStart - prefixToUse.length;
      position = Math.max(position, selectionStart);
      position = Math.min(position, selectionStart + replacementText.length);
      selectionStart = selectionEnd = position;
    } else {
      selectionEnd = selectionStart + replacementText.length;
    }
    return { text: replacementText, selectionStart, selectionEnd };
  } else if (!hasReplaceNext) {
    let replacementText = prefixToUse + selectedText + suffixToUse;
    selectionStart = originalSelectionStart + prefixToUse.length;
    selectionEnd = originalSelectionEnd + prefixToUse.length;
    const whitespaceEdges = selectedText.match(/^\s*|\s*$/g);
    if (trimFirst && whitespaceEdges) {
      const leadingWhitespace = whitespaceEdges[0] || "";
      const trailingWhitespace = whitespaceEdges[1] || "";
      replacementText = leadingWhitespace + prefixToUse + selectedText.trim() + suffixToUse + trailingWhitespace;
      selectionStart += leadingWhitespace.length;
      selectionEnd -= trailingWhitespace.length;
    }
    return { text: replacementText, selectionStart, selectionEnd };
  } else if (scanFor && scanFor.length > 0 && selectedText.match(scanFor)) {
    suffixToUse = suffixToUse.replace(replaceNext, selectedText);
    const replacementText = prefixToUse + suffixToUse;
    selectionStart = selectionEnd = selectionStart + prefixToUse.length;
    return { text: replacementText, selectionStart, selectionEnd };
  } else {
    const replacementText = prefixToUse + selectedText + suffixToUse;
    selectionStart = selectionStart + prefixToUse.length + selectedText.length + suffixToUse.indexOf(replaceNext);
    selectionEnd = selectionStart + replaceNext.length;
    return { text: replacementText, selectionStart, selectionEnd };
  }
}
function multilineStyle(textarea, style) {
  const { prefix, suffix, surroundWithNewlines } = style;
  let text = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
  let selectionStart = textarea.selectionStart;
  let selectionEnd = textarea.selectionEnd;
  const lines = text.split("\n");
  const undoStyle = lines.every((line) => line.startsWith(prefix) && (!suffix || line.endsWith(suffix)));
  if (undoStyle) {
    text = lines.map((line) => {
      let result = line.slice(prefix.length);
      if (suffix) {
        result = result.slice(0, result.length - suffix.length);
      }
      return result;
    }).join("\n");
    selectionEnd = selectionStart + text.length;
  } else {
    text = lines.map((line) => prefix + line + (suffix || "")).join("\n");
    if (surroundWithNewlines) {
      const { newlinesToAppend, newlinesToPrepend } = newlinesToSurroundSelectedText(textarea);
      selectionStart += newlinesToAppend.length;
      selectionEnd = selectionStart + text.length;
      text = newlinesToAppend + text + newlinesToPrepend;
    }
  }
  return { text, selectionStart, selectionEnd };
}
function undoOrderedListStyle(text) {
  const lines = text.split("\n");
  const orderedListRegex = /^\d+\.\s+/;
  const shouldUndoOrderedList = lines.every((line) => orderedListRegex.test(line));
  let result = lines;
  if (shouldUndoOrderedList) {
    result = lines.map((line) => line.replace(orderedListRegex, ""));
  }
  return {
    text: result.join("\n"),
    processed: shouldUndoOrderedList
  };
}
function undoUnorderedListStyle(text) {
  const lines = text.split("\n");
  const unorderedListPrefix = "- ";
  const shouldUndoUnorderedList = lines.every((line) => line.startsWith(unorderedListPrefix));
  let result = lines;
  if (shouldUndoUnorderedList) {
    result = lines.map((line) => line.slice(unorderedListPrefix.length));
  }
  return {
    text: result.join("\n"),
    processed: shouldUndoUnorderedList
  };
}
function makePrefix(index, unorderedList) {
  if (unorderedList) {
    return "- ";
  } else {
    return `${index + 1}. `;
  }
}
function clearExistingListStyle(style, selectedText) {
  let undoResult;
  let undoResultOppositeList;
  let pristineText;
  if (style.orderedList) {
    undoResult = undoOrderedListStyle(selectedText);
    undoResultOppositeList = undoUnorderedListStyle(undoResult.text);
    pristineText = undoResultOppositeList.text;
  } else {
    undoResult = undoUnorderedListStyle(selectedText);
    undoResultOppositeList = undoOrderedListStyle(undoResult.text);
    pristineText = undoResultOppositeList.text;
  }
  return [undoResult, undoResultOppositeList, pristineText];
}
function listStyle(textarea, style) {
  const noInitialSelection = textarea.selectionStart === textarea.selectionEnd;
  let selectionStart = textarea.selectionStart;
  let selectionEnd = textarea.selectionEnd;
  expandSelectionToLine(textarea);
  const selectedText = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
  const [undoResult, undoResultOppositeList, pristineText] = clearExistingListStyle(style, selectedText);
  const prefixedLines = pristineText.split("\n").map((value, index) => {
    return `${makePrefix(index, style.unorderedList)}${value}`;
  });
  const totalPrefixLength = prefixedLines.reduce((previousValue, _currentValue, currentIndex) => {
    return previousValue + makePrefix(currentIndex, style.unorderedList).length;
  }, 0);
  const totalPrefixLengthOppositeList = prefixedLines.reduce((previousValue, _currentValue, currentIndex) => {
    return previousValue + makePrefix(currentIndex, !style.unorderedList).length;
  }, 0);
  if (undoResult.processed) {
    if (noInitialSelection) {
      selectionStart = Math.max(selectionStart - makePrefix(0, style.unorderedList).length, 0);
      selectionEnd = selectionStart;
    } else {
      selectionStart = textarea.selectionStart;
      selectionEnd = textarea.selectionEnd - totalPrefixLength;
    }
    return { text: pristineText, selectionStart, selectionEnd };
  }
  const { newlinesToAppend, newlinesToPrepend } = newlinesToSurroundSelectedText(textarea);
  const text = newlinesToAppend + prefixedLines.join("\n") + newlinesToPrepend;
  if (noInitialSelection) {
    selectionStart = Math.max(selectionStart + makePrefix(0, style.unorderedList).length + newlinesToAppend.length, 0);
    selectionEnd = selectionStart;
  } else {
    if (undoResultOppositeList.processed) {
      selectionStart = Math.max(textarea.selectionStart + newlinesToAppend.length, 0);
      selectionEnd = textarea.selectionEnd + newlinesToAppend.length + totalPrefixLength - totalPrefixLengthOppositeList;
    } else {
      selectionStart = Math.max(textarea.selectionStart + newlinesToAppend.length, 0);
      selectionEnd = textarea.selectionEnd + newlinesToAppend.length + totalPrefixLength;
    }
  }
  return { text, selectionStart, selectionEnd };
}
function applyListStyle(textarea, style) {
  const result = applyLineOperation(
    textarea,
    (ta) => listStyle(ta, style),
    {
      // Custom selection adjustment for lists
      adjustSelection: (isRemoving, selStart, selEnd, lineStart) => {
        const currentLine = textarea.value.slice(lineStart, textarea.selectionEnd);
        const orderedListRegex = /^\d+\.\s+/;
        const unorderedListRegex = /^- /;
        const hasOrderedList = orderedListRegex.test(currentLine);
        const hasUnorderedList = unorderedListRegex.test(currentLine);
        const isRemovingCurrent = style.orderedList && hasOrderedList || style.unorderedList && hasUnorderedList;
        if (selStart === selEnd) {
          if (isRemovingCurrent) {
            const prefixMatch = currentLine.match(style.orderedList ? orderedListRegex : unorderedListRegex);
            const prefixLength = prefixMatch ? prefixMatch[0].length : 0;
            return {
              start: Math.max(selStart - prefixLength, lineStart),
              end: Math.max(selStart - prefixLength, lineStart)
            };
          } else if (hasOrderedList || hasUnorderedList) {
            const oldPrefixMatch = currentLine.match(hasOrderedList ? orderedListRegex : unorderedListRegex);
            const oldPrefixLength = oldPrefixMatch ? oldPrefixMatch[0].length : 0;
            const newPrefixLength = style.unorderedList ? 2 : 3;
            const adjustment = newPrefixLength - oldPrefixLength;
            return {
              start: selStart + adjustment,
              end: selStart + adjustment
            };
          } else {
            const prefixLength = style.unorderedList ? 2 : 3;
            return {
              start: selStart + prefixLength,
              end: selStart + prefixLength
            };
          }
        } else {
          if (isRemovingCurrent) {
            const prefixMatch = currentLine.match(style.orderedList ? orderedListRegex : unorderedListRegex);
            const prefixLength = prefixMatch ? prefixMatch[0].length : 0;
            return {
              start: Math.max(selStart - prefixLength, lineStart),
              end: Math.max(selEnd - prefixLength, lineStart)
            };
          } else if (hasOrderedList || hasUnorderedList) {
            const oldPrefixMatch = currentLine.match(hasOrderedList ? orderedListRegex : unorderedListRegex);
            const oldPrefixLength = oldPrefixMatch ? oldPrefixMatch[0].length : 0;
            const newPrefixLength = style.unorderedList ? 2 : 3;
            const adjustment = newPrefixLength - oldPrefixLength;
            return {
              start: selStart + adjustment,
              end: selEnd + adjustment
            };
          } else {
            const prefixLength = style.unorderedList ? 2 : 3;
            return {
              start: selStart + prefixLength,
              end: selEnd + prefixLength
            };
          }
        }
      }
    }
  );
  insertText(textarea, result);
}
function getActiveFormats(textarea) {
  if (!textarea)
    return [];
  const formats = [];
  const { selectionStart, selectionEnd, value } = textarea;
  const lines = value.split("\n");
  let lineStart = 0;
  let currentLine = "";
  for (const line of lines) {
    if (selectionStart >= lineStart && selectionStart <= lineStart + line.length) {
      currentLine = line;
      break;
    }
    lineStart += line.length + 1;
  }
  if (currentLine.startsWith("- ")) {
    if (currentLine.startsWith("- [ ] ") || currentLine.startsWith("- [x] ")) {
      formats.push("task-list");
    } else {
      formats.push("bullet-list");
    }
  }
  if (/^\d+\.\s/.test(currentLine)) {
    formats.push("numbered-list");
  }
  if (currentLine.startsWith("> ")) {
    formats.push("quote");
  }
  if (currentLine.startsWith("# "))
    formats.push("header");
  if (currentLine.startsWith("## "))
    formats.push("header-2");
  if (currentLine.startsWith("### "))
    formats.push("header-3");
  const lookBehind = Math.max(0, selectionStart - 10);
  const lookAhead = Math.min(value.length, selectionEnd + 10);
  const surrounding = value.slice(lookBehind, lookAhead);
  if (surrounding.includes("**")) {
    const beforeCursor = value.slice(Math.max(0, selectionStart - 100), selectionStart);
    const afterCursor = value.slice(selectionEnd, Math.min(value.length, selectionEnd + 100));
    const lastOpenBold = beforeCursor.lastIndexOf("**");
    const nextCloseBold = afterCursor.indexOf("**");
    if (lastOpenBold !== -1 && nextCloseBold !== -1) {
      formats.push("bold");
    }
  }
  if (surrounding.includes("_")) {
    const beforeCursor = value.slice(Math.max(0, selectionStart - 100), selectionStart);
    const afterCursor = value.slice(selectionEnd, Math.min(value.length, selectionEnd + 100));
    const lastOpenItalic = beforeCursor.lastIndexOf("_");
    const nextCloseItalic = afterCursor.indexOf("_");
    if (lastOpenItalic !== -1 && nextCloseItalic !== -1) {
      formats.push("italic");
    }
  }
  if (surrounding.includes("`")) {
    const beforeCursor = value.slice(Math.max(0, selectionStart - 100), selectionStart);
    const afterCursor = value.slice(selectionEnd, Math.min(value.length, selectionEnd + 100));
    if (beforeCursor.includes("`") && afterCursor.includes("`")) {
      formats.push("code");
    }
  }
  if (surrounding.includes("[") && surrounding.includes("]")) {
    const beforeCursor = value.slice(Math.max(0, selectionStart - 100), selectionStart);
    const afterCursor = value.slice(selectionEnd, Math.min(value.length, selectionEnd + 100));
    const lastOpenBracket = beforeCursor.lastIndexOf("[");
    const nextCloseBracket = afterCursor.indexOf("]");
    if (lastOpenBracket !== -1 && nextCloseBracket !== -1) {
      const afterBracket = value.slice(selectionEnd + nextCloseBracket + 1, selectionEnd + nextCloseBracket + 10);
      if (afterBracket.startsWith("(")) {
        formats.push("link");
      }
    }
  }
  return formats;
}
function hasFormat(textarea, format) {
  const activeFormats = getActiveFormats(textarea);
  return activeFormats.includes(format);
}
function expandSelection(textarea, options = {}) {
  if (!textarea)
    return;
  const { toWord, toLine, toFormat } = options;
  const { selectionStart, selectionEnd, value } = textarea;
  if (toLine) {
    const lines = value.split("\n");
    let lineStart = 0;
    let lineEnd = 0;
    let currentPos = 0;
    for (const line of lines) {
      if (selectionStart >= currentPos && selectionStart <= currentPos + line.length) {
        lineStart = currentPos;
        lineEnd = currentPos + line.length;
        break;
      }
      currentPos += line.length + 1;
    }
    textarea.selectionStart = lineStart;
    textarea.selectionEnd = lineEnd;
  } else if (toWord && selectionStart === selectionEnd) {
    let start = selectionStart;
    let end = selectionEnd;
    while (start > 0 && !/\s/.test(value[start - 1])) {
      start--;
    }
    while (end < value.length && !/\s/.test(value[end])) {
      end++;
    }
    textarea.selectionStart = start;
    textarea.selectionEnd = end;
  }
}
function toggleBold(textarea) {
  if (!textarea || textarea.disabled || textarea.readOnly)
    return;
  debugLog("toggleBold", "Starting");
  debugSelection(textarea, "Before");
  const style = mergeWithDefaults(FORMATS.bold);
  const result = blockStyle(textarea, style);
  debugResult(result);
  insertText(textarea, result);
  debugSelection(textarea, "After");
}
function toggleItalic(textarea) {
  if (!textarea || textarea.disabled || textarea.readOnly)
    return;
  const style = mergeWithDefaults(FORMATS.italic);
  const result = blockStyle(textarea, style);
  insertText(textarea, result);
}
function toggleCode(textarea) {
  if (!textarea || textarea.disabled || textarea.readOnly)
    return;
  const style = mergeWithDefaults(FORMATS.code);
  const result = blockStyle(textarea, style);
  insertText(textarea, result);
}
function insertLink(textarea, options = {}) {
  if (!textarea || textarea.disabled || textarea.readOnly)
    return;
  const selectedText = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
  let style = mergeWithDefaults(FORMATS.link);
  const isURL = selectedText && selectedText.match(/^https?:\/\//);
  if (isURL && !options.url) {
    style.suffix = `](${selectedText})`;
    style.replaceNext = "";
  } else if (options.url) {
    style.suffix = `](${options.url})`;
    style.replaceNext = "";
  }
  if (options.text && !selectedText) {
    const pos = textarea.selectionStart;
    textarea.value = textarea.value.slice(0, pos) + options.text + textarea.value.slice(pos);
    textarea.selectionStart = pos;
    textarea.selectionEnd = pos + options.text.length;
  }
  const result = blockStyle(textarea, style);
  insertText(textarea, result);
}
function toggleBulletList(textarea) {
  if (!textarea || textarea.disabled || textarea.readOnly)
    return;
  const style = mergeWithDefaults(FORMATS.bulletList);
  applyListStyle(textarea, style);
}
function toggleNumberedList(textarea) {
  if (!textarea || textarea.disabled || textarea.readOnly)
    return;
  const style = mergeWithDefaults(FORMATS.numberedList);
  applyListStyle(textarea, style);
}
function toggleQuote(textarea) {
  if (!textarea || textarea.disabled || textarea.readOnly)
    return;
  debugLog("toggleQuote", "Starting");
  debugSelection(textarea, "Initial");
  const style = mergeWithDefaults(FORMATS.quote);
  const result = applyLineOperation(
    textarea,
    (ta) => multilineStyle(ta, style),
    { prefix: style.prefix }
  );
  debugResult(result);
  insertText(textarea, result);
  debugSelection(textarea, "Final");
}
function toggleTaskList(textarea) {
  if (!textarea || textarea.disabled || textarea.readOnly)
    return;
  const style = mergeWithDefaults(FORMATS.taskList);
  const result = applyLineOperation(
    textarea,
    (ta) => multilineStyle(ta, style),
    { prefix: style.prefix }
  );
  insertText(textarea, result);
}
function insertHeader(textarea, level = 1, toggle = false) {
  if (!textarea || textarea.disabled || textarea.readOnly)
    return;
  if (level < 1 || level > 6)
    level = 1;
  debugLog("insertHeader", `============ START ============`);
  debugLog("insertHeader", `Level: ${level}, Toggle: ${toggle}`);
  debugLog("insertHeader", `Initial cursor: ${textarea.selectionStart}-${textarea.selectionEnd}`);
  const headerKey = `header${level === 1 ? "1" : level}`;
  const style = mergeWithDefaults(FORMATS[headerKey] || FORMATS.header1);
  debugLog("insertHeader", `Style prefix: "${style.prefix}"`);
  const value = textarea.value;
  const originalStart = textarea.selectionStart;
  const originalEnd = textarea.selectionEnd;
  let lineStart = originalStart;
  while (lineStart > 0 && value[lineStart - 1] !== "\n") {
    lineStart--;
  }
  let lineEnd = originalEnd;
  while (lineEnd < value.length && value[lineEnd] !== "\n") {
    lineEnd++;
  }
  const currentLineContent = value.slice(lineStart, lineEnd);
  debugLog("insertHeader", `Current line (before): "${currentLineContent}"`);
  const existingHeaderMatch = currentLineContent.match(/^(#{1,6})\s*/);
  const existingLevel = existingHeaderMatch ? existingHeaderMatch[1].length : 0;
  const existingPrefixLength = existingHeaderMatch ? existingHeaderMatch[0].length : 0;
  debugLog("insertHeader", `Existing header check:`);
  debugLog("insertHeader", `  - Match: ${existingHeaderMatch ? `"${existingHeaderMatch[0]}"` : "none"}`);
  debugLog("insertHeader", `  - Existing level: ${existingLevel}`);
  debugLog("insertHeader", `  - Existing prefix length: ${existingPrefixLength}`);
  debugLog("insertHeader", `  - Target level: ${level}`);
  const shouldToggleOff = toggle && existingLevel === level;
  debugLog("insertHeader", `Should toggle OFF: ${shouldToggleOff} (toggle=${toggle}, existingLevel=${existingLevel}, level=${level})`);
  const result = applyLineOperation(
    textarea,
    (ta) => {
      const currentLine = ta.value.slice(ta.selectionStart, ta.selectionEnd);
      debugLog("insertHeader", `Line in operation: "${currentLine}"`);
      const cleanedLine = currentLine.replace(/^#{1,6}\s*/, "");
      debugLog("insertHeader", `Cleaned line: "${cleanedLine}"`);
      let newLine;
      if (shouldToggleOff) {
        debugLog("insertHeader", "ACTION: Toggling OFF - removing header");
        newLine = cleanedLine;
      } else if (existingLevel > 0) {
        debugLog("insertHeader", `ACTION: Replacing H${existingLevel} with H${level}`);
        newLine = style.prefix + cleanedLine;
      } else {
        debugLog("insertHeader", "ACTION: Adding new header");
        newLine = style.prefix + cleanedLine;
      }
      debugLog("insertHeader", `New line: "${newLine}"`);
      return {
        text: newLine,
        selectionStart: ta.selectionStart,
        selectionEnd: ta.selectionEnd
      };
    },
    {
      prefix: style.prefix,
      // Custom selection adjustment for headers
      adjustSelection: (isRemoving, selStart, selEnd, lineStartPos) => {
        debugLog("insertHeader", `Adjusting selection:`);
        debugLog("insertHeader", `  - isRemoving param: ${isRemoving}`);
        debugLog("insertHeader", `  - shouldToggleOff: ${shouldToggleOff}`);
        debugLog("insertHeader", `  - selStart: ${selStart}, selEnd: ${selEnd}`);
        debugLog("insertHeader", `  - lineStartPos: ${lineStartPos}`);
        if (shouldToggleOff) {
          const adjustment = Math.max(selStart - existingPrefixLength, lineStartPos);
          debugLog("insertHeader", `  - Removing header, adjusting by -${existingPrefixLength}`);
          return {
            start: adjustment,
            end: selStart === selEnd ? adjustment : Math.max(selEnd - existingPrefixLength, lineStartPos)
          };
        } else if (existingPrefixLength > 0) {
          const prefixDiff = style.prefix.length - existingPrefixLength;
          debugLog("insertHeader", `  - Replacing header, adjusting by ${prefixDiff}`);
          return {
            start: selStart + prefixDiff,
            end: selEnd + prefixDiff
          };
        } else {
          debugLog("insertHeader", `  - Adding header, adjusting by +${style.prefix.length}`);
          return {
            start: selStart + style.prefix.length,
            end: selEnd + style.prefix.length
          };
        }
      }
    }
  );
  debugLog("insertHeader", `Final result: text="${result.text}", cursor=${result.selectionStart}-${result.selectionEnd}`);
  debugLog("insertHeader", `============ END ============`);
  insertText(textarea, result);
}
function toggleH1(textarea) {
  insertHeader(textarea, 1, true);
}
function toggleH2(textarea) {
  insertHeader(textarea, 2, true);
}
function toggleH3(textarea) {
  insertHeader(textarea, 3, true);
}
function getActiveFormats2(textarea) {
  return getActiveFormats(textarea);
}
function hasFormat2(textarea, format) {
  return hasFormat(textarea, format);
}
function expandSelection2(textarea, options = {}) {
  expandSelection(textarea, options);
}
function applyCustomFormat(textarea, format) {
  if (!textarea || textarea.disabled || textarea.readOnly)
    return;
  const style = mergeWithDefaults(format);
  let result;
  if (style.multiline) {
    const selectedText = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
    if (isMultipleLines(selectedText)) {
      result = multilineStyle(textarea, style);
    } else {
      result = blockStyle(textarea, style);
    }
  } else {
    result = blockStyle(textarea, style);
  }
  insertText(textarea, result);
}
var src_default = {
  toggleBold,
  toggleItalic,
  toggleCode,
  insertLink,
  toggleBulletList,
  toggleNumberedList,
  toggleQuote,
  toggleTaskList,
  insertHeader,
  toggleH1,
  toggleH2,
  toggleH3,
  getActiveFormats: getActiveFormats2,
  hasFormat: hasFormat2,
  expandSelection: expandSelection2,
  applyCustomFormat,
  preserveSelection,
  setUndoMethod,
  setDebugMode,
  getDebugMode
};

// ../../node_modules/@floating-ui/utils/dist/floating-ui.utils.mjs
var min = Math.min;
var max = Math.max;
var round = Math.round;
var floor = Math.floor;
var createCoords = (v) => ({
  x: v,
  y: v
});
var oppositeSideMap = {
  left: "right",
  right: "left",
  bottom: "top",
  top: "bottom"
};
var oppositeAlignmentMap = {
  start: "end",
  end: "start"
};
function clamp(start, value, end) {
  return max(start, min(value, end));
}
function evaluate(value, param) {
  return typeof value === "function" ? value(param) : value;
}
function getSide(placement) {
  return placement.split("-")[0];
}
function getAlignment(placement) {
  return placement.split("-")[1];
}
function getOppositeAxis(axis) {
  return axis === "x" ? "y" : "x";
}
function getAxisLength(axis) {
  return axis === "y" ? "height" : "width";
}
var yAxisSides = /* @__PURE__ */ new Set(["top", "bottom"]);
function getSideAxis(placement) {
  return yAxisSides.has(getSide(placement)) ? "y" : "x";
}
function getAlignmentAxis(placement) {
  return getOppositeAxis(getSideAxis(placement));
}
function getAlignmentSides(placement, rects, rtl) {
  if (rtl === void 0) {
    rtl = false;
  }
  const alignment = getAlignment(placement);
  const alignmentAxis = getAlignmentAxis(placement);
  const length = getAxisLength(alignmentAxis);
  let mainAlignmentSide = alignmentAxis === "x" ? alignment === (rtl ? "end" : "start") ? "right" : "left" : alignment === "start" ? "bottom" : "top";
  if (rects.reference[length] > rects.floating[length]) {
    mainAlignmentSide = getOppositePlacement(mainAlignmentSide);
  }
  return [mainAlignmentSide, getOppositePlacement(mainAlignmentSide)];
}
function getExpandedPlacements(placement) {
  const oppositePlacement = getOppositePlacement(placement);
  return [getOppositeAlignmentPlacement(placement), oppositePlacement, getOppositeAlignmentPlacement(oppositePlacement)];
}
function getOppositeAlignmentPlacement(placement) {
  return placement.replace(/start|end/g, (alignment) => oppositeAlignmentMap[alignment]);
}
var lrPlacement = ["left", "right"];
var rlPlacement = ["right", "left"];
var tbPlacement = ["top", "bottom"];
var btPlacement = ["bottom", "top"];
function getSideList(side, isStart, rtl) {
  switch (side) {
    case "top":
    case "bottom":
      if (rtl)
        return isStart ? rlPlacement : lrPlacement;
      return isStart ? lrPlacement : rlPlacement;
    case "left":
    case "right":
      return isStart ? tbPlacement : btPlacement;
    default:
      return [];
  }
}
function getOppositeAxisPlacements(placement, flipAlignment, direction, rtl) {
  const alignment = getAlignment(placement);
  let list = getSideList(getSide(placement), direction === "start", rtl);
  if (alignment) {
    list = list.map((side) => side + "-" + alignment);
    if (flipAlignment) {
      list = list.concat(list.map(getOppositeAlignmentPlacement));
    }
  }
  return list;
}
function getOppositePlacement(placement) {
  return placement.replace(/left|right|bottom|top/g, (side) => oppositeSideMap[side]);
}
function expandPaddingObject(padding) {
  return {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    ...padding
  };
}
function getPaddingObject(padding) {
  return typeof padding !== "number" ? expandPaddingObject(padding) : {
    top: padding,
    right: padding,
    bottom: padding,
    left: padding
  };
}
function rectToClientRect(rect) {
  const {
    x,
    y,
    width,
    height
  } = rect;
  return {
    width,
    height,
    top: y,
    left: x,
    right: x + width,
    bottom: y + height,
    x,
    y
  };
}

// ../../node_modules/@floating-ui/core/dist/floating-ui.core.mjs
function computeCoordsFromPlacement(_ref, placement, rtl) {
  let {
    reference,
    floating
  } = _ref;
  const sideAxis = getSideAxis(placement);
  const alignmentAxis = getAlignmentAxis(placement);
  const alignLength = getAxisLength(alignmentAxis);
  const side = getSide(placement);
  const isVertical = sideAxis === "y";
  const commonX = reference.x + reference.width / 2 - floating.width / 2;
  const commonY = reference.y + reference.height / 2 - floating.height / 2;
  const commonAlign = reference[alignLength] / 2 - floating[alignLength] / 2;
  let coords;
  switch (side) {
    case "top":
      coords = {
        x: commonX,
        y: reference.y - floating.height
      };
      break;
    case "bottom":
      coords = {
        x: commonX,
        y: reference.y + reference.height
      };
      break;
    case "right":
      coords = {
        x: reference.x + reference.width,
        y: commonY
      };
      break;
    case "left":
      coords = {
        x: reference.x - floating.width,
        y: commonY
      };
      break;
    default:
      coords = {
        x: reference.x,
        y: reference.y
      };
  }
  switch (getAlignment(placement)) {
    case "start":
      coords[alignmentAxis] -= commonAlign * (rtl && isVertical ? -1 : 1);
      break;
    case "end":
      coords[alignmentAxis] += commonAlign * (rtl && isVertical ? -1 : 1);
      break;
  }
  return coords;
}
async function detectOverflow(state, options) {
  var _await$platform$isEle;
  if (options === void 0) {
    options = {};
  }
  const {
    x,
    y,
    platform: platform2,
    rects,
    elements,
    strategy
  } = state;
  const {
    boundary = "clippingAncestors",
    rootBoundary = "viewport",
    elementContext = "floating",
    altBoundary = false,
    padding = 0
  } = evaluate(options, state);
  const paddingObject = getPaddingObject(padding);
  const altContext = elementContext === "floating" ? "reference" : "floating";
  const element = elements[altBoundary ? altContext : elementContext];
  const clippingClientRect = rectToClientRect(await platform2.getClippingRect({
    element: ((_await$platform$isEle = await (platform2.isElement == null ? void 0 : platform2.isElement(element))) != null ? _await$platform$isEle : true) ? element : element.contextElement || await (platform2.getDocumentElement == null ? void 0 : platform2.getDocumentElement(elements.floating)),
    boundary,
    rootBoundary,
    strategy
  }));
  const rect = elementContext === "floating" ? {
    x,
    y,
    width: rects.floating.width,
    height: rects.floating.height
  } : rects.reference;
  const offsetParent = await (platform2.getOffsetParent == null ? void 0 : platform2.getOffsetParent(elements.floating));
  const offsetScale = await (platform2.isElement == null ? void 0 : platform2.isElement(offsetParent)) ? await (platform2.getScale == null ? void 0 : platform2.getScale(offsetParent)) || {
    x: 1,
    y: 1
  } : {
    x: 1,
    y: 1
  };
  const elementClientRect = rectToClientRect(platform2.convertOffsetParentRelativeRectToViewportRelativeRect ? await platform2.convertOffsetParentRelativeRectToViewportRelativeRect({
    elements,
    rect,
    offsetParent,
    strategy
  }) : rect);
  return {
    top: (clippingClientRect.top - elementClientRect.top + paddingObject.top) / offsetScale.y,
    bottom: (elementClientRect.bottom - clippingClientRect.bottom + paddingObject.bottom) / offsetScale.y,
    left: (clippingClientRect.left - elementClientRect.left + paddingObject.left) / offsetScale.x,
    right: (elementClientRect.right - clippingClientRect.right + paddingObject.right) / offsetScale.x
  };
}
var computePosition = async (reference, floating, config) => {
  const {
    placement = "bottom",
    strategy = "absolute",
    middleware = [],
    platform: platform2
  } = config;
  const validMiddleware = middleware.filter(Boolean);
  const rtl = await (platform2.isRTL == null ? void 0 : platform2.isRTL(floating));
  let rects = await platform2.getElementRects({
    reference,
    floating,
    strategy
  });
  let {
    x,
    y
  } = computeCoordsFromPlacement(rects, placement, rtl);
  let statefulPlacement = placement;
  let middlewareData = {};
  let resetCount = 0;
  for (let i = 0; i < validMiddleware.length; i++) {
    var _platform$detectOverf;
    const {
      name,
      fn
    } = validMiddleware[i];
    const {
      x: nextX,
      y: nextY,
      data,
      reset
    } = await fn({
      x,
      y,
      initialPlacement: placement,
      placement: statefulPlacement,
      strategy,
      middlewareData,
      rects,
      platform: {
        ...platform2,
        detectOverflow: (_platform$detectOverf = platform2.detectOverflow) != null ? _platform$detectOverf : detectOverflow
      },
      elements: {
        reference,
        floating
      }
    });
    x = nextX != null ? nextX : x;
    y = nextY != null ? nextY : y;
    middlewareData = {
      ...middlewareData,
      [name]: {
        ...middlewareData[name],
        ...data
      }
    };
    if (reset && resetCount <= 50) {
      resetCount++;
      if (typeof reset === "object") {
        if (reset.placement) {
          statefulPlacement = reset.placement;
        }
        if (reset.rects) {
          rects = reset.rects === true ? await platform2.getElementRects({
            reference,
            floating,
            strategy
          }) : reset.rects;
        }
        ({
          x,
          y
        } = computeCoordsFromPlacement(rects, statefulPlacement, rtl));
      }
      i = -1;
    }
  }
  return {
    x,
    y,
    placement: statefulPlacement,
    strategy,
    middlewareData
  };
};
var flip = function(options) {
  if (options === void 0) {
    options = {};
  }
  return {
    name: "flip",
    options,
    async fn(state) {
      var _middlewareData$arrow, _middlewareData$flip;
      const {
        placement,
        middlewareData,
        rects,
        initialPlacement,
        platform: platform2,
        elements
      } = state;
      const {
        mainAxis: checkMainAxis = true,
        crossAxis: checkCrossAxis = true,
        fallbackPlacements: specifiedFallbackPlacements,
        fallbackStrategy = "bestFit",
        fallbackAxisSideDirection = "none",
        flipAlignment = true,
        ...detectOverflowOptions
      } = evaluate(options, state);
      if ((_middlewareData$arrow = middlewareData.arrow) != null && _middlewareData$arrow.alignmentOffset) {
        return {};
      }
      const side = getSide(placement);
      const initialSideAxis = getSideAxis(initialPlacement);
      const isBasePlacement = getSide(initialPlacement) === initialPlacement;
      const rtl = await (platform2.isRTL == null ? void 0 : platform2.isRTL(elements.floating));
      const fallbackPlacements = specifiedFallbackPlacements || (isBasePlacement || !flipAlignment ? [getOppositePlacement(initialPlacement)] : getExpandedPlacements(initialPlacement));
      const hasFallbackAxisSideDirection = fallbackAxisSideDirection !== "none";
      if (!specifiedFallbackPlacements && hasFallbackAxisSideDirection) {
        fallbackPlacements.push(...getOppositeAxisPlacements(initialPlacement, flipAlignment, fallbackAxisSideDirection, rtl));
      }
      const placements2 = [initialPlacement, ...fallbackPlacements];
      const overflow = await platform2.detectOverflow(state, detectOverflowOptions);
      const overflows = [];
      let overflowsData = ((_middlewareData$flip = middlewareData.flip) == null ? void 0 : _middlewareData$flip.overflows) || [];
      if (checkMainAxis) {
        overflows.push(overflow[side]);
      }
      if (checkCrossAxis) {
        const sides2 = getAlignmentSides(placement, rects, rtl);
        overflows.push(overflow[sides2[0]], overflow[sides2[1]]);
      }
      overflowsData = [...overflowsData, {
        placement,
        overflows
      }];
      if (!overflows.every((side2) => side2 <= 0)) {
        var _middlewareData$flip2, _overflowsData$filter;
        const nextIndex = (((_middlewareData$flip2 = middlewareData.flip) == null ? void 0 : _middlewareData$flip2.index) || 0) + 1;
        const nextPlacement = placements2[nextIndex];
        if (nextPlacement) {
          const ignoreCrossAxisOverflow = checkCrossAxis === "alignment" ? initialSideAxis !== getSideAxis(nextPlacement) : false;
          if (!ignoreCrossAxisOverflow || // We leave the current main axis only if every placement on that axis
          // overflows the main axis.
          overflowsData.every((d) => getSideAxis(d.placement) === initialSideAxis ? d.overflows[0] > 0 : true)) {
            return {
              data: {
                index: nextIndex,
                overflows: overflowsData
              },
              reset: {
                placement: nextPlacement
              }
            };
          }
        }
        let resetPlacement = (_overflowsData$filter = overflowsData.filter((d) => d.overflows[0] <= 0).sort((a, b) => a.overflows[1] - b.overflows[1])[0]) == null ? void 0 : _overflowsData$filter.placement;
        if (!resetPlacement) {
          switch (fallbackStrategy) {
            case "bestFit": {
              var _overflowsData$filter2;
              const placement2 = (_overflowsData$filter2 = overflowsData.filter((d) => {
                if (hasFallbackAxisSideDirection) {
                  const currentSideAxis = getSideAxis(d.placement);
                  return currentSideAxis === initialSideAxis || // Create a bias to the `y` side axis due to horizontal
                  // reading directions favoring greater width.
                  currentSideAxis === "y";
                }
                return true;
              }).map((d) => [d.placement, d.overflows.filter((overflow2) => overflow2 > 0).reduce((acc, overflow2) => acc + overflow2, 0)]).sort((a, b) => a[1] - b[1])[0]) == null ? void 0 : _overflowsData$filter2[0];
              if (placement2) {
                resetPlacement = placement2;
              }
              break;
            }
            case "initialPlacement":
              resetPlacement = initialPlacement;
              break;
          }
        }
        if (placement !== resetPlacement) {
          return {
            reset: {
              placement: resetPlacement
            }
          };
        }
      }
      return {};
    }
  };
};
var originSides = /* @__PURE__ */ new Set(["left", "top"]);
async function convertValueToCoords(state, options) {
  const {
    placement,
    platform: platform2,
    elements
  } = state;
  const rtl = await (platform2.isRTL == null ? void 0 : platform2.isRTL(elements.floating));
  const side = getSide(placement);
  const alignment = getAlignment(placement);
  const isVertical = getSideAxis(placement) === "y";
  const mainAxisMulti = originSides.has(side) ? -1 : 1;
  const crossAxisMulti = rtl && isVertical ? -1 : 1;
  const rawValue = evaluate(options, state);
  let {
    mainAxis,
    crossAxis,
    alignmentAxis
  } = typeof rawValue === "number" ? {
    mainAxis: rawValue,
    crossAxis: 0,
    alignmentAxis: null
  } : {
    mainAxis: rawValue.mainAxis || 0,
    crossAxis: rawValue.crossAxis || 0,
    alignmentAxis: rawValue.alignmentAxis
  };
  if (alignment && typeof alignmentAxis === "number") {
    crossAxis = alignment === "end" ? alignmentAxis * -1 : alignmentAxis;
  }
  return isVertical ? {
    x: crossAxis * crossAxisMulti,
    y: mainAxis * mainAxisMulti
  } : {
    x: mainAxis * mainAxisMulti,
    y: crossAxis * crossAxisMulti
  };
}
var offset = function(options) {
  if (options === void 0) {
    options = 0;
  }
  return {
    name: "offset",
    options,
    async fn(state) {
      var _middlewareData$offse, _middlewareData$arrow;
      const {
        x,
        y,
        placement,
        middlewareData
      } = state;
      const diffCoords = await convertValueToCoords(state, options);
      if (placement === ((_middlewareData$offse = middlewareData.offset) == null ? void 0 : _middlewareData$offse.placement) && (_middlewareData$arrow = middlewareData.arrow) != null && _middlewareData$arrow.alignmentOffset) {
        return {};
      }
      return {
        x: x + diffCoords.x,
        y: y + diffCoords.y,
        data: {
          ...diffCoords,
          placement
        }
      };
    }
  };
};
var shift = function(options) {
  if (options === void 0) {
    options = {};
  }
  return {
    name: "shift",
    options,
    async fn(state) {
      const {
        x,
        y,
        placement,
        platform: platform2
      } = state;
      const {
        mainAxis: checkMainAxis = true,
        crossAxis: checkCrossAxis = false,
        limiter = {
          fn: (_ref) => {
            let {
              x: x2,
              y: y2
            } = _ref;
            return {
              x: x2,
              y: y2
            };
          }
        },
        ...detectOverflowOptions
      } = evaluate(options, state);
      const coords = {
        x,
        y
      };
      const overflow = await platform2.detectOverflow(state, detectOverflowOptions);
      const crossAxis = getSideAxis(getSide(placement));
      const mainAxis = getOppositeAxis(crossAxis);
      let mainAxisCoord = coords[mainAxis];
      let crossAxisCoord = coords[crossAxis];
      if (checkMainAxis) {
        const minSide = mainAxis === "y" ? "top" : "left";
        const maxSide = mainAxis === "y" ? "bottom" : "right";
        const min2 = mainAxisCoord + overflow[minSide];
        const max2 = mainAxisCoord - overflow[maxSide];
        mainAxisCoord = clamp(min2, mainAxisCoord, max2);
      }
      if (checkCrossAxis) {
        const minSide = crossAxis === "y" ? "top" : "left";
        const maxSide = crossAxis === "y" ? "bottom" : "right";
        const min2 = crossAxisCoord + overflow[minSide];
        const max2 = crossAxisCoord - overflow[maxSide];
        crossAxisCoord = clamp(min2, crossAxisCoord, max2);
      }
      const limitedCoords = limiter.fn({
        ...state,
        [mainAxis]: mainAxisCoord,
        [crossAxis]: crossAxisCoord
      });
      return {
        ...limitedCoords,
        data: {
          x: limitedCoords.x - x,
          y: limitedCoords.y - y,
          enabled: {
            [mainAxis]: checkMainAxis,
            [crossAxis]: checkCrossAxis
          }
        }
      };
    }
  };
};

// ../../node_modules/@floating-ui/utils/dist/floating-ui.utils.dom.mjs
function hasWindow() {
  return typeof window !== "undefined";
}
function getNodeName(node) {
  if (isNode(node)) {
    return (node.nodeName || "").toLowerCase();
  }
  return "#document";
}
function getWindow(node) {
  var _node$ownerDocument;
  return (node == null || (_node$ownerDocument = node.ownerDocument) == null ? void 0 : _node$ownerDocument.defaultView) || window;
}
function getDocumentElement(node) {
  var _ref;
  return (_ref = (isNode(node) ? node.ownerDocument : node.document) || window.document) == null ? void 0 : _ref.documentElement;
}
function isNode(value) {
  if (!hasWindow()) {
    return false;
  }
  return value instanceof Node || value instanceof getWindow(value).Node;
}
function isElement(value) {
  if (!hasWindow()) {
    return false;
  }
  return value instanceof Element || value instanceof getWindow(value).Element;
}
function isHTMLElement(value) {
  if (!hasWindow()) {
    return false;
  }
  return value instanceof HTMLElement || value instanceof getWindow(value).HTMLElement;
}
function isShadowRoot(value) {
  if (!hasWindow() || typeof ShadowRoot === "undefined") {
    return false;
  }
  return value instanceof ShadowRoot || value instanceof getWindow(value).ShadowRoot;
}
var invalidOverflowDisplayValues = /* @__PURE__ */ new Set(["inline", "contents"]);
function isOverflowElement(element) {
  const {
    overflow,
    overflowX,
    overflowY,
    display
  } = getComputedStyle2(element);
  return /auto|scroll|overlay|hidden|clip/.test(overflow + overflowY + overflowX) && !invalidOverflowDisplayValues.has(display);
}
var tableElements = /* @__PURE__ */ new Set(["table", "td", "th"]);
function isTableElement(element) {
  return tableElements.has(getNodeName(element));
}
var topLayerSelectors = [":popover-open", ":modal"];
function isTopLayer(element) {
  return topLayerSelectors.some((selector) => {
    try {
      return element.matches(selector);
    } catch (_e) {
      return false;
    }
  });
}
var transformProperties = ["transform", "translate", "scale", "rotate", "perspective"];
var willChangeValues = ["transform", "translate", "scale", "rotate", "perspective", "filter"];
var containValues = ["paint", "layout", "strict", "content"];
function isContainingBlock(elementOrCss) {
  const webkit = isWebKit();
  const css = isElement(elementOrCss) ? getComputedStyle2(elementOrCss) : elementOrCss;
  return transformProperties.some((value) => css[value] ? css[value] !== "none" : false) || (css.containerType ? css.containerType !== "normal" : false) || !webkit && (css.backdropFilter ? css.backdropFilter !== "none" : false) || !webkit && (css.filter ? css.filter !== "none" : false) || willChangeValues.some((value) => (css.willChange || "").includes(value)) || containValues.some((value) => (css.contain || "").includes(value));
}
function getContainingBlock(element) {
  let currentNode = getParentNode(element);
  while (isHTMLElement(currentNode) && !isLastTraversableNode(currentNode)) {
    if (isContainingBlock(currentNode)) {
      return currentNode;
    } else if (isTopLayer(currentNode)) {
      return null;
    }
    currentNode = getParentNode(currentNode);
  }
  return null;
}
function isWebKit() {
  if (typeof CSS === "undefined" || !CSS.supports)
    return false;
  return CSS.supports("-webkit-backdrop-filter", "none");
}
var lastTraversableNodeNames = /* @__PURE__ */ new Set(["html", "body", "#document"]);
function isLastTraversableNode(node) {
  return lastTraversableNodeNames.has(getNodeName(node));
}
function getComputedStyle2(element) {
  return getWindow(element).getComputedStyle(element);
}
function getNodeScroll(element) {
  if (isElement(element)) {
    return {
      scrollLeft: element.scrollLeft,
      scrollTop: element.scrollTop
    };
  }
  return {
    scrollLeft: element.scrollX,
    scrollTop: element.scrollY
  };
}
function getParentNode(node) {
  if (getNodeName(node) === "html") {
    return node;
  }
  const result = (
    // Step into the shadow DOM of the parent of a slotted node.
    node.assignedSlot || // DOM Element detected.
    node.parentNode || // ShadowRoot detected.
    isShadowRoot(node) && node.host || // Fallback.
    getDocumentElement(node)
  );
  return isShadowRoot(result) ? result.host : result;
}
function getNearestOverflowAncestor(node) {
  const parentNode = getParentNode(node);
  if (isLastTraversableNode(parentNode)) {
    return node.ownerDocument ? node.ownerDocument.body : node.body;
  }
  if (isHTMLElement(parentNode) && isOverflowElement(parentNode)) {
    return parentNode;
  }
  return getNearestOverflowAncestor(parentNode);
}
function getOverflowAncestors(node, list, traverseIframes) {
  var _node$ownerDocument2;
  if (list === void 0) {
    list = [];
  }
  if (traverseIframes === void 0) {
    traverseIframes = true;
  }
  const scrollableAncestor = getNearestOverflowAncestor(node);
  const isBody = scrollableAncestor === ((_node$ownerDocument2 = node.ownerDocument) == null ? void 0 : _node$ownerDocument2.body);
  const win = getWindow(scrollableAncestor);
  if (isBody) {
    const frameElement = getFrameElement(win);
    return list.concat(win, win.visualViewport || [], isOverflowElement(scrollableAncestor) ? scrollableAncestor : [], frameElement && traverseIframes ? getOverflowAncestors(frameElement) : []);
  }
  return list.concat(scrollableAncestor, getOverflowAncestors(scrollableAncestor, [], traverseIframes));
}
function getFrameElement(win) {
  return win.parent && Object.getPrototypeOf(win.parent) ? win.frameElement : null;
}

// ../../node_modules/@floating-ui/dom/dist/floating-ui.dom.mjs
function getCssDimensions(element) {
  const css = getComputedStyle2(element);
  let width = parseFloat(css.width) || 0;
  let height = parseFloat(css.height) || 0;
  const hasOffset = isHTMLElement(element);
  const offsetWidth = hasOffset ? element.offsetWidth : width;
  const offsetHeight = hasOffset ? element.offsetHeight : height;
  const shouldFallback = round(width) !== offsetWidth || round(height) !== offsetHeight;
  if (shouldFallback) {
    width = offsetWidth;
    height = offsetHeight;
  }
  return {
    width,
    height,
    $: shouldFallback
  };
}
function unwrapElement(element) {
  return !isElement(element) ? element.contextElement : element;
}
function getScale(element) {
  const domElement = unwrapElement(element);
  if (!isHTMLElement(domElement)) {
    return createCoords(1);
  }
  const rect = domElement.getBoundingClientRect();
  const {
    width,
    height,
    $
  } = getCssDimensions(domElement);
  let x = ($ ? round(rect.width) : rect.width) / width;
  let y = ($ ? round(rect.height) : rect.height) / height;
  if (!x || !Number.isFinite(x)) {
    x = 1;
  }
  if (!y || !Number.isFinite(y)) {
    y = 1;
  }
  return {
    x,
    y
  };
}
var noOffsets = /* @__PURE__ */ createCoords(0);
function getVisualOffsets(element) {
  const win = getWindow(element);
  if (!isWebKit() || !win.visualViewport) {
    return noOffsets;
  }
  return {
    x: win.visualViewport.offsetLeft,
    y: win.visualViewport.offsetTop
  };
}
function shouldAddVisualOffsets(element, isFixed, floatingOffsetParent) {
  if (isFixed === void 0) {
    isFixed = false;
  }
  if (!floatingOffsetParent || isFixed && floatingOffsetParent !== getWindow(element)) {
    return false;
  }
  return isFixed;
}
function getBoundingClientRect(element, includeScale, isFixedStrategy, offsetParent) {
  if (includeScale === void 0) {
    includeScale = false;
  }
  if (isFixedStrategy === void 0) {
    isFixedStrategy = false;
  }
  const clientRect = element.getBoundingClientRect();
  const domElement = unwrapElement(element);
  let scale = createCoords(1);
  if (includeScale) {
    if (offsetParent) {
      if (isElement(offsetParent)) {
        scale = getScale(offsetParent);
      }
    } else {
      scale = getScale(element);
    }
  }
  const visualOffsets = shouldAddVisualOffsets(domElement, isFixedStrategy, offsetParent) ? getVisualOffsets(domElement) : createCoords(0);
  let x = (clientRect.left + visualOffsets.x) / scale.x;
  let y = (clientRect.top + visualOffsets.y) / scale.y;
  let width = clientRect.width / scale.x;
  let height = clientRect.height / scale.y;
  if (domElement) {
    const win = getWindow(domElement);
    const offsetWin = offsetParent && isElement(offsetParent) ? getWindow(offsetParent) : offsetParent;
    let currentWin = win;
    let currentIFrame = getFrameElement(currentWin);
    while (currentIFrame && offsetParent && offsetWin !== currentWin) {
      const iframeScale = getScale(currentIFrame);
      const iframeRect = currentIFrame.getBoundingClientRect();
      const css = getComputedStyle2(currentIFrame);
      const left = iframeRect.left + (currentIFrame.clientLeft + parseFloat(css.paddingLeft)) * iframeScale.x;
      const top = iframeRect.top + (currentIFrame.clientTop + parseFloat(css.paddingTop)) * iframeScale.y;
      x *= iframeScale.x;
      y *= iframeScale.y;
      width *= iframeScale.x;
      height *= iframeScale.y;
      x += left;
      y += top;
      currentWin = getWindow(currentIFrame);
      currentIFrame = getFrameElement(currentWin);
    }
  }
  return rectToClientRect({
    width,
    height,
    x,
    y
  });
}
function getWindowScrollBarX(element, rect) {
  const leftScroll = getNodeScroll(element).scrollLeft;
  if (!rect) {
    return getBoundingClientRect(getDocumentElement(element)).left + leftScroll;
  }
  return rect.left + leftScroll;
}
function getHTMLOffset(documentElement, scroll) {
  const htmlRect = documentElement.getBoundingClientRect();
  const x = htmlRect.left + scroll.scrollLeft - getWindowScrollBarX(documentElement, htmlRect);
  const y = htmlRect.top + scroll.scrollTop;
  return {
    x,
    y
  };
}
function convertOffsetParentRelativeRectToViewportRelativeRect(_ref) {
  let {
    elements,
    rect,
    offsetParent,
    strategy
  } = _ref;
  const isFixed = strategy === "fixed";
  const documentElement = getDocumentElement(offsetParent);
  const topLayer = elements ? isTopLayer(elements.floating) : false;
  if (offsetParent === documentElement || topLayer && isFixed) {
    return rect;
  }
  let scroll = {
    scrollLeft: 0,
    scrollTop: 0
  };
  let scale = createCoords(1);
  const offsets = createCoords(0);
  const isOffsetParentAnElement = isHTMLElement(offsetParent);
  if (isOffsetParentAnElement || !isOffsetParentAnElement && !isFixed) {
    if (getNodeName(offsetParent) !== "body" || isOverflowElement(documentElement)) {
      scroll = getNodeScroll(offsetParent);
    }
    if (isHTMLElement(offsetParent)) {
      const offsetRect = getBoundingClientRect(offsetParent);
      scale = getScale(offsetParent);
      offsets.x = offsetRect.x + offsetParent.clientLeft;
      offsets.y = offsetRect.y + offsetParent.clientTop;
    }
  }
  const htmlOffset = documentElement && !isOffsetParentAnElement && !isFixed ? getHTMLOffset(documentElement, scroll) : createCoords(0);
  return {
    width: rect.width * scale.x,
    height: rect.height * scale.y,
    x: rect.x * scale.x - scroll.scrollLeft * scale.x + offsets.x + htmlOffset.x,
    y: rect.y * scale.y - scroll.scrollTop * scale.y + offsets.y + htmlOffset.y
  };
}
function getClientRects(element) {
  return Array.from(element.getClientRects());
}
function getDocumentRect(element) {
  const html = getDocumentElement(element);
  const scroll = getNodeScroll(element);
  const body = element.ownerDocument.body;
  const width = max(html.scrollWidth, html.clientWidth, body.scrollWidth, body.clientWidth);
  const height = max(html.scrollHeight, html.clientHeight, body.scrollHeight, body.clientHeight);
  let x = -scroll.scrollLeft + getWindowScrollBarX(element);
  const y = -scroll.scrollTop;
  if (getComputedStyle2(body).direction === "rtl") {
    x += max(html.clientWidth, body.clientWidth) - width;
  }
  return {
    width,
    height,
    x,
    y
  };
}
var SCROLLBAR_MAX = 25;
function getViewportRect(element, strategy) {
  const win = getWindow(element);
  const html = getDocumentElement(element);
  const visualViewport = win.visualViewport;
  let width = html.clientWidth;
  let height = html.clientHeight;
  let x = 0;
  let y = 0;
  if (visualViewport) {
    width = visualViewport.width;
    height = visualViewport.height;
    const visualViewportBased = isWebKit();
    if (!visualViewportBased || visualViewportBased && strategy === "fixed") {
      x = visualViewport.offsetLeft;
      y = visualViewport.offsetTop;
    }
  }
  const windowScrollbarX = getWindowScrollBarX(html);
  if (windowScrollbarX <= 0) {
    const doc = html.ownerDocument;
    const body = doc.body;
    const bodyStyles = getComputedStyle(body);
    const bodyMarginInline = doc.compatMode === "CSS1Compat" ? parseFloat(bodyStyles.marginLeft) + parseFloat(bodyStyles.marginRight) || 0 : 0;
    const clippingStableScrollbarWidth = Math.abs(html.clientWidth - body.clientWidth - bodyMarginInline);
    if (clippingStableScrollbarWidth <= SCROLLBAR_MAX) {
      width -= clippingStableScrollbarWidth;
    }
  } else if (windowScrollbarX <= SCROLLBAR_MAX) {
    width += windowScrollbarX;
  }
  return {
    width,
    height,
    x,
    y
  };
}
var absoluteOrFixed = /* @__PURE__ */ new Set(["absolute", "fixed"]);
function getInnerBoundingClientRect(element, strategy) {
  const clientRect = getBoundingClientRect(element, true, strategy === "fixed");
  const top = clientRect.top + element.clientTop;
  const left = clientRect.left + element.clientLeft;
  const scale = isHTMLElement(element) ? getScale(element) : createCoords(1);
  const width = element.clientWidth * scale.x;
  const height = element.clientHeight * scale.y;
  const x = left * scale.x;
  const y = top * scale.y;
  return {
    width,
    height,
    x,
    y
  };
}
function getClientRectFromClippingAncestor(element, clippingAncestor, strategy) {
  let rect;
  if (clippingAncestor === "viewport") {
    rect = getViewportRect(element, strategy);
  } else if (clippingAncestor === "document") {
    rect = getDocumentRect(getDocumentElement(element));
  } else if (isElement(clippingAncestor)) {
    rect = getInnerBoundingClientRect(clippingAncestor, strategy);
  } else {
    const visualOffsets = getVisualOffsets(element);
    rect = {
      x: clippingAncestor.x - visualOffsets.x,
      y: clippingAncestor.y - visualOffsets.y,
      width: clippingAncestor.width,
      height: clippingAncestor.height
    };
  }
  return rectToClientRect(rect);
}
function hasFixedPositionAncestor(element, stopNode) {
  const parentNode = getParentNode(element);
  if (parentNode === stopNode || !isElement(parentNode) || isLastTraversableNode(parentNode)) {
    return false;
  }
  return getComputedStyle2(parentNode).position === "fixed" || hasFixedPositionAncestor(parentNode, stopNode);
}
function getClippingElementAncestors(element, cache2) {
  const cachedResult = cache2.get(element);
  if (cachedResult) {
    return cachedResult;
  }
  let result = getOverflowAncestors(element, [], false).filter((el) => isElement(el) && getNodeName(el) !== "body");
  let currentContainingBlockComputedStyle = null;
  const elementIsFixed = getComputedStyle2(element).position === "fixed";
  let currentNode = elementIsFixed ? getParentNode(element) : element;
  while (isElement(currentNode) && !isLastTraversableNode(currentNode)) {
    const computedStyle = getComputedStyle2(currentNode);
    const currentNodeIsContaining = isContainingBlock(currentNode);
    if (!currentNodeIsContaining && computedStyle.position === "fixed") {
      currentContainingBlockComputedStyle = null;
    }
    const shouldDropCurrentNode = elementIsFixed ? !currentNodeIsContaining && !currentContainingBlockComputedStyle : !currentNodeIsContaining && computedStyle.position === "static" && !!currentContainingBlockComputedStyle && absoluteOrFixed.has(currentContainingBlockComputedStyle.position) || isOverflowElement(currentNode) && !currentNodeIsContaining && hasFixedPositionAncestor(element, currentNode);
    if (shouldDropCurrentNode) {
      result = result.filter((ancestor) => ancestor !== currentNode);
    } else {
      currentContainingBlockComputedStyle = computedStyle;
    }
    currentNode = getParentNode(currentNode);
  }
  cache2.set(element, result);
  return result;
}
function getClippingRect(_ref) {
  let {
    element,
    boundary,
    rootBoundary,
    strategy
  } = _ref;
  const elementClippingAncestors = boundary === "clippingAncestors" ? isTopLayer(element) ? [] : getClippingElementAncestors(element, this._c) : [].concat(boundary);
  const clippingAncestors = [...elementClippingAncestors, rootBoundary];
  const firstClippingAncestor = clippingAncestors[0];
  const clippingRect = clippingAncestors.reduce((accRect, clippingAncestor) => {
    const rect = getClientRectFromClippingAncestor(element, clippingAncestor, strategy);
    accRect.top = max(rect.top, accRect.top);
    accRect.right = min(rect.right, accRect.right);
    accRect.bottom = min(rect.bottom, accRect.bottom);
    accRect.left = max(rect.left, accRect.left);
    return accRect;
  }, getClientRectFromClippingAncestor(element, firstClippingAncestor, strategy));
  return {
    width: clippingRect.right - clippingRect.left,
    height: clippingRect.bottom - clippingRect.top,
    x: clippingRect.left,
    y: clippingRect.top
  };
}
function getDimensions(element) {
  const {
    width,
    height
  } = getCssDimensions(element);
  return {
    width,
    height
  };
}
function getRectRelativeToOffsetParent(element, offsetParent, strategy) {
  const isOffsetParentAnElement = isHTMLElement(offsetParent);
  const documentElement = getDocumentElement(offsetParent);
  const isFixed = strategy === "fixed";
  const rect = getBoundingClientRect(element, true, isFixed, offsetParent);
  let scroll = {
    scrollLeft: 0,
    scrollTop: 0
  };
  const offsets = createCoords(0);
  function setLeftRTLScrollbarOffset() {
    offsets.x = getWindowScrollBarX(documentElement);
  }
  if (isOffsetParentAnElement || !isOffsetParentAnElement && !isFixed) {
    if (getNodeName(offsetParent) !== "body" || isOverflowElement(documentElement)) {
      scroll = getNodeScroll(offsetParent);
    }
    if (isOffsetParentAnElement) {
      const offsetRect = getBoundingClientRect(offsetParent, true, isFixed, offsetParent);
      offsets.x = offsetRect.x + offsetParent.clientLeft;
      offsets.y = offsetRect.y + offsetParent.clientTop;
    } else if (documentElement) {
      setLeftRTLScrollbarOffset();
    }
  }
  if (isFixed && !isOffsetParentAnElement && documentElement) {
    setLeftRTLScrollbarOffset();
  }
  const htmlOffset = documentElement && !isOffsetParentAnElement && !isFixed ? getHTMLOffset(documentElement, scroll) : createCoords(0);
  const x = rect.left + scroll.scrollLeft - offsets.x - htmlOffset.x;
  const y = rect.top + scroll.scrollTop - offsets.y - htmlOffset.y;
  return {
    x,
    y,
    width: rect.width,
    height: rect.height
  };
}
function isStaticPositioned(element) {
  return getComputedStyle2(element).position === "static";
}
function getTrueOffsetParent(element, polyfill) {
  if (!isHTMLElement(element) || getComputedStyle2(element).position === "fixed") {
    return null;
  }
  if (polyfill) {
    return polyfill(element);
  }
  let rawOffsetParent = element.offsetParent;
  if (getDocumentElement(element) === rawOffsetParent) {
    rawOffsetParent = rawOffsetParent.ownerDocument.body;
  }
  return rawOffsetParent;
}
function getOffsetParent(element, polyfill) {
  const win = getWindow(element);
  if (isTopLayer(element)) {
    return win;
  }
  if (!isHTMLElement(element)) {
    let svgOffsetParent = getParentNode(element);
    while (svgOffsetParent && !isLastTraversableNode(svgOffsetParent)) {
      if (isElement(svgOffsetParent) && !isStaticPositioned(svgOffsetParent)) {
        return svgOffsetParent;
      }
      svgOffsetParent = getParentNode(svgOffsetParent);
    }
    return win;
  }
  let offsetParent = getTrueOffsetParent(element, polyfill);
  while (offsetParent && isTableElement(offsetParent) && isStaticPositioned(offsetParent)) {
    offsetParent = getTrueOffsetParent(offsetParent, polyfill);
  }
  if (offsetParent && isLastTraversableNode(offsetParent) && isStaticPositioned(offsetParent) && !isContainingBlock(offsetParent)) {
    return win;
  }
  return offsetParent || getContainingBlock(element) || win;
}
var getElementRects = async function(data) {
  const getOffsetParentFn = this.getOffsetParent || getOffsetParent;
  const getDimensionsFn = this.getDimensions;
  const floatingDimensions = await getDimensionsFn(data.floating);
  return {
    reference: getRectRelativeToOffsetParent(data.reference, await getOffsetParentFn(data.floating), data.strategy),
    floating: {
      x: 0,
      y: 0,
      width: floatingDimensions.width,
      height: floatingDimensions.height
    }
  };
};
function isRTL(element) {
  return getComputedStyle2(element).direction === "rtl";
}
var platform = {
  convertOffsetParentRelativeRectToViewportRelativeRect,
  getDocumentElement,
  getClippingRect,
  getOffsetParent,
  getElementRects,
  getClientRects,
  getDimensions,
  getScale,
  isElement,
  isRTL
};
function rectsAreEqual(a, b) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
function observeMove(element, onMove) {
  let io = null;
  let timeoutId;
  const root = getDocumentElement(element);
  function cleanup() {
    var _io;
    clearTimeout(timeoutId);
    (_io = io) == null || _io.disconnect();
    io = null;
  }
  function refresh(skip, threshold) {
    if (skip === void 0) {
      skip = false;
    }
    if (threshold === void 0) {
      threshold = 1;
    }
    cleanup();
    const elementRectForRootMargin = element.getBoundingClientRect();
    const {
      left,
      top,
      width,
      height
    } = elementRectForRootMargin;
    if (!skip) {
      onMove();
    }
    if (!width || !height) {
      return;
    }
    const insetTop = floor(top);
    const insetRight = floor(root.clientWidth - (left + width));
    const insetBottom = floor(root.clientHeight - (top + height));
    const insetLeft = floor(left);
    const rootMargin = -insetTop + "px " + -insetRight + "px " + -insetBottom + "px " + -insetLeft + "px";
    const options = {
      rootMargin,
      threshold: max(0, min(1, threshold)) || 1
    };
    let isFirstUpdate = true;
    function handleObserve(entries) {
      const ratio = entries[0].intersectionRatio;
      if (ratio !== threshold) {
        if (!isFirstUpdate) {
          return refresh();
        }
        if (!ratio) {
          timeoutId = setTimeout(() => {
            refresh(false, 1e-7);
          }, 1e3);
        } else {
          refresh(false, ratio);
        }
      }
      if (ratio === 1 && !rectsAreEqual(elementRectForRootMargin, element.getBoundingClientRect())) {
        refresh();
      }
      isFirstUpdate = false;
    }
    try {
      io = new IntersectionObserver(handleObserve, {
        ...options,
        // Handle <iframe>s
        root: root.ownerDocument
      });
    } catch (_e) {
      io = new IntersectionObserver(handleObserve, options);
    }
    io.observe(element);
  }
  refresh(true);
  return cleanup;
}
function autoUpdate(reference, floating, update, options) {
  if (options === void 0) {
    options = {};
  }
  const {
    ancestorScroll = true,
    ancestorResize = true,
    elementResize = typeof ResizeObserver === "function",
    layoutShift = typeof IntersectionObserver === "function",
    animationFrame = false
  } = options;
  const referenceEl = unwrapElement(reference);
  const ancestors = ancestorScroll || ancestorResize ? [...referenceEl ? getOverflowAncestors(referenceEl) : [], ...getOverflowAncestors(floating)] : [];
  ancestors.forEach((ancestor) => {
    ancestorScroll && ancestor.addEventListener("scroll", update, {
      passive: true
    });
    ancestorResize && ancestor.addEventListener("resize", update);
  });
  const cleanupIo = referenceEl && layoutShift ? observeMove(referenceEl, update) : null;
  let reobserveFrame = -1;
  let resizeObserver = null;
  if (elementResize) {
    resizeObserver = new ResizeObserver((_ref) => {
      let [firstEntry] = _ref;
      if (firstEntry && firstEntry.target === referenceEl && resizeObserver) {
        resizeObserver.unobserve(floating);
        cancelAnimationFrame(reobserveFrame);
        reobserveFrame = requestAnimationFrame(() => {
          var _resizeObserver;
          (_resizeObserver = resizeObserver) == null || _resizeObserver.observe(floating);
        });
      }
      update();
    });
    if (referenceEl && !animationFrame) {
      resizeObserver.observe(referenceEl);
    }
    resizeObserver.observe(floating);
  }
  let frameId;
  let prevRefRect = animationFrame ? getBoundingClientRect(reference) : null;
  if (animationFrame) {
    frameLoop();
  }
  function frameLoop() {
    const nextRefRect = getBoundingClientRect(reference);
    if (prevRefRect && !rectsAreEqual(prevRefRect, nextRefRect)) {
      update();
    }
    prevRefRect = nextRefRect;
    frameId = requestAnimationFrame(frameLoop);
  }
  update();
  return () => {
    var _resizeObserver2;
    ancestors.forEach((ancestor) => {
      ancestorScroll && ancestor.removeEventListener("scroll", update);
      ancestorResize && ancestor.removeEventListener("resize", update);
    });
    cleanupIo == null || cleanupIo();
    (_resizeObserver2 = resizeObserver) == null || _resizeObserver2.disconnect();
    resizeObserver = null;
    if (animationFrame) {
      cancelAnimationFrame(frameId);
    }
  };
}
var offset2 = offset;
var shift2 = shift;
var flip2 = flip;
var computePosition2 = (reference, floating, options) => {
  const cache2 = /* @__PURE__ */ new Map();
  const mergedOptions = {
    platform,
    ...options
  };
  const platformWithCache = {
    ...mergedOptions.platform,
    _c: cache2
  };
  return computePosition(reference, floating, {
    ...mergedOptions,
    platform: platformWithCache
  });
};

// src/i18n.js
var LANG_ZH = "zh";
var dict = {
  zh: {
    // 工具栏提示（title / aria-label）
    bold: "\u52A0\u7C97 (Ctrl+B)",
    italic: "\u659C\u4F53 (Ctrl+I)",
    strike: "\u5220\u9664\u7EBF",
    underline: "\u4E0B\u5212\u7EBF",
    code: "\u884C\u5185\u4EE3\u7801",
    link: "\u63D2\u5165\u94FE\u63A5",
    image: "\u63D2\u5165\u56FE\u7247",
    upload: "\u4E0A\u4F20\u6587\u4EF6",
    h1: "\u4E00\u7EA7\u6807\u9898",
    h2: "\u4E8C\u7EA7\u6807\u9898",
    h3: "\u4E09\u7EA7\u6807\u9898",
    h4: "\u56DB\u7EA7\u6807\u9898",
    h5: "\u4E94\u7EA7\u6807\u9898",
    h6: "\u516D\u7EA7\u6807\u9898",
    bulletList: "\u65E0\u5E8F\u5217\u8868",
    orderedList: "\u6709\u5E8F\u5217\u8868",
    taskList: "\u4EFB\u52A1\u5217\u8868",
    quote: "\u5F15\u7528",
    codeBlock: "\u4EE3\u7801\u5757",
    table: "\u63D2\u5165\u8868\u683C",
    hr: "\u5206\u9694\u7EBF",
    undo: "\u64A4\u9500",
    redo: "\u91CD\u505A",
    superscript: "\u4E0A\u6807",
    subscript: "\u4E0B\u6807",
    highlight: "\u9AD8\u4EAE",
    clearFormat: "\u6E05\u9664\u683C\u5F0F",
    footnote: "\u811A\u6CE8",
    toc: "\u76EE\u5F55",
    math: "\u6570\u5B66\u516C\u5F0F",
    mermaid: "Mermaid \u56FE\u8868",
    graphviz: "Graphviz \u56FE",
    plantuml: "PlantUML \u56FE",
    indent: "\u589E\u52A0\u7F29\u8FDB",
    outdent: "\u51CF\u5C11\u7F29\u8FDB",
    alignLeft: "\u5DE6\u5BF9\u9F50",
    alignCenter: "\u5C45\u4E2D",
    alignRight: "\u53F3\u5BF9\u9F50",
    formatDoc: "\u683C\u5F0F\u5316\u6587\u6863",
    viewMode: "\u89C6\u56FE\u6A21\u5F0F",
    more: "\u66F4\u591A\u64CD\u4F5C",
    // 视图模式菜单
    normal: "\u666E\u901A\u7F16\u8F91",
    ir: "\u5373\u65F6\u6E32\u67D3",
    // 分组标题
    group_format: "\u683C\u5F0F",
    group_block: "\u5757",
    group_insert: "\u63D2\u5165",
    group_misc: "\u6742\u9879",
    toolbar_label: "\u683C\u5F0F\u5DE5\u5177\u680F"
  },
  en: {
    bold: "Bold (Ctrl+B)",
    italic: "Italic (Ctrl+I)",
    strike: "Strikethrough",
    underline: "Underline",
    code: "Inline code",
    link: "Insert link",
    image: "Insert image",
    upload: "Upload file",
    bulletList: "Bullet list",
    orderedList: "Ordered list",
    taskList: "Task list",
    quote: "Blockquote",
    codeBlock: "Code block",
    table: "Insert table",
    hr: "Horizontal rule",
    viewMode: "View mode",
    more: "More actions",
    normal: "Normal",
    ir: "Instant render",
    group_format: "Formatting",
    group_block: "Block",
    group_insert: "Insert",
    group_misc: "Misc",
    toolbar_label: "Formatting toolbar"
  }
};
var currentLang = LANG_ZH;
function t(key, lang = currentLang) {
  const scope = dict[lang] || dict[LANG_ZH];
  if (scope && Object.prototype.hasOwnProperty.call(scope, key)) {
    return scope[key];
  }
  const zh = dict[LANG_ZH];
  return zh && Object.prototype.hasOwnProperty.call(zh, key) ? zh[key] : key;
}
function setLang(lang) {
  if (dict[lang]) {
    currentLang = lang;
  }
  return currentLang;
}
var supportedLangs = Object.keys(dict);

// src/icons.js
var boldIcon = `<svg viewBox="0 0 18 18">
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5,4H9.5A2.5,2.5,0,0,1,12,6.5v0A2.5,2.5,0,0,1,9.5,9H5A0,0,0,0,1,5,9V4A0,0,0,0,1,5,4Z"></path>
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5,9h5.5A2.5,2.5,0,0,1,13,11.5v0A2.5,2.5,0,0,1,10.5,14H5a0,0,0,0,1,0,0V9A0,0,0,0,1,5,9Z"></path>
</svg>`;
var italicIcon = `<svg viewBox="0 0 18 18">
  <line stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="7" x2="13" y1="4" y2="4"></line>
  <line stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="5" x2="11" y1="14" y2="14"></line>
  <line stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="8" x2="10" y1="14" y2="4"></line>
</svg>`;
var h1Icon = `<svg viewBox="0 0 18 18">
  <path fill="currentColor" d="M10,4V14a1,1,0,0,1-2,0V10H3v4a1,1,0,0,1-2,0V4A1,1,0,0,1,3,4V8H8V4a1,1,0,0,1,2,0Zm6.06787,9.209H14.98975V7.59863a.54085.54085,0,0,0-.605-.60547h-.62744a1.01119,1.01119,0,0,0-.748.29688L11.645,8.56641a.5435.5435,0,0,0-.022.8584l.28613.30762a.53861.53861,0,0,0,.84717.0332l.09912-.08789a1.2137,1.2137,0,0,0,.2417-.35254h.02246s-.01123.30859-.01123.60547V13.209H12.041a.54085.54085,0,0,0-.605.60547v.43945a.54085.54085,0,0,0,.605.60547h4.02686a.54085.54085,0,0,0,.605-.60547v-.43945A.54085.54085,0,0,0,16.06787,13.209Z"></path>
</svg>`;
var h2Icon = `<svg viewBox="0 0 18 18">
  <path fill="currentColor" d="M16.73975,13.81445v.43945a.54085.54085,0,0,1-.605.60547H11.855a.58392.58392,0,0,1-.64893-.60547V14.0127c0-2.90527,3.39941-3.42187,3.39941-4.55469a.77675.77675,0,0,0-.84717-.78125,1.17684,1.17684,0,0,0-.83594.38477c-.2749.26367-.561.374-.85791.13184l-.4292-.34082c-.30811-.24219-.38525-.51758-.1543-.81445a2.97155,2.97155,0,0,1,2.45361-1.17676,2.45393,2.45393,0,0,1,2.68408,2.40918c0,2.45312-3.1792,2.92676-3.27832,3.93848h2.79443A.54085.54085,0,0,1,16.73975,13.81445ZM9,3A.99974.99974,0,0,0,8,4V8H3V4A1,1,0,0,0,1,4V14a1,1,0,0,0,2,0V10H8v4a1,1,0,0,0,2,0V4A.99974.99974,0,0,0,9,3Z"></path>
</svg>`;
var h3Icon = `<svg viewBox="0 0 18 18">
  <path fill="currentColor" d="M16.65186,12.30664a2.6742,2.6742,0,0,1-2.915,2.68457,3.96592,3.96592,0,0,1-2.25537-.6709.56007.56007,0,0,1-.13232-.83594L11.64648,13c.209-.34082.48389-.36328.82471-.1543a2.32654,2.32654,0,0,0,1.12256.33008c.71484,0,1.12207-.35156,1.12207-.78125,0-.61523-.61621-.86816-1.46338-.86816H13.2085a.65159.65159,0,0,1-.68213-.41895l-.05518-.10937a.67114.67114,0,0,1,.14307-.78125l.71533-.86914a8.55289,8.55289,0,0,1,.68213-.7373V8.58887a3.93913,3.93913,0,0,1-.748.05469H11.9873a.54085.54085,0,0,1-.605-.60547V7.59863a.54085.54085,0,0,1,.605-.60547h3.75146a.53773.53773,0,0,1,.60547.59375v.17676a1.03723,1.03723,0,0,1-.27539.748L14.74854,10.0293A2.31132,2.31132,0,0,1,16.65186,12.30664ZM9,3A.99974.99974,0,0,0,8,4V8H3V4A1,1,0,0,0,1,4V14a1,1,0,0,0,2,0V10H8v4a1,1,0,0,0,2,0V4A.99974.99974,0,0,0,9,3Z"></path>
</svg>`;
var linkIcon = `<svg viewBox="0 0 18 18">
  <line stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="7" x2="11" y1="7" y2="11"></line>
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.9,4.577a3.476,3.476,0,0,1,.36,4.679A3.476,3.476,0,0,1,4.577,8.9C3.185,7.5,2.035,6.4,4.217,4.217S7.5,3.185,8.9,4.577Z"></path>
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.423,9.1a3.476,3.476,0,0,0-4.679-.36,3.476,3.476,0,0,0,.36,4.679c1.392,1.392,2.5,2.542,4.679.36S14.815,10.5,13.423,9.1Z"></path>
</svg>`;
var codeIcon = `<svg viewBox="0 0 18 18">
  <polyline stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" points="5 7 3 9 5 11"></polyline>
  <polyline stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" points="13 7 15 9 13 11"></polyline>
  <line stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="10" x2="8" y1="5" y2="13"></line>
</svg>`;
var bulletListIcon = `<svg viewBox="0 0 18 18">
  <line stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="6" x2="15" y1="4" y2="4"></line>
  <line stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="6" x2="15" y1="9" y2="9"></line>
  <line stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="6" x2="15" y1="14" y2="14"></line>
  <line stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="3" x2="3" y1="4" y2="4"></line>
  <line stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="3" x2="3" y1="9" y2="9"></line>
  <line stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="3" x2="3" y1="14" y2="14"></line>
</svg>`;
var orderedListIcon = `<svg viewBox="0 0 18 18">
  <line stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="7" x2="15" y1="4" y2="4"></line>
  <line stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="7" x2="15" y1="9" y2="9"></line>
  <line stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="7" x2="15" y1="14" y2="14"></line>
  <line stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1" x1="2.5" x2="4.5" y1="5.5" y2="5.5"></line>
  <path fill="currentColor" d="M3.5,6A0.5,0.5,0,0,1,3,5.5V3.085l-0.276.138A0.5,0.5,0,0,1,2.053,3c-0.124-.247-0.023-0.324.224-0.447l1-.5A0.5,0.5,0,0,1,4,2.5v3A0.5,0.5,0,0,1,3.5,6Z"></path>
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M4.5,10.5h-2c0-.234,1.85-1.076,1.85-2.234A0.959,0.959,0,0,0,2.5,8.156"></path>
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M2.5,14.846a0.959,0.959,0,0,0,1.85-.109A0.7,0.7,0,0,0,3.75,14a0.688,0.688,0,0,0,.6-0.736,0.959,0.959,0,0,0-1.85-.109"></path>
</svg>`;
var quoteIcon = `<svg viewBox="2 2 20 20">
  <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 10.8182L9 10.8182C8.80222 10.8182 8.60888 10.7649 8.44443 10.665C8.27998 10.5651 8.15181 10.4231 8.07612 10.257C8.00043 10.0909 7.98063 9.90808 8.01922 9.73174C8.0578 9.55539 8.15304 9.39341 8.29289 9.26627C8.43275 9.13913 8.61093 9.05255 8.80491 9.01747C8.99889 8.98239 9.19996 9.00039 9.38268 9.0692C9.56541 9.13801 9.72159 9.25453 9.83147 9.40403C9.94135 9.55353 10 9.72929 10 9.90909L10 12.1818C10 12.664 9.78929 13.1265 9.41421 13.4675C9.03914 13.8084 8.53043 14 8 14"></path>
  <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 10.8182L15 10.8182C14.8022 10.8182 14.6089 10.7649 14.4444 10.665C14.28 10.5651 14.1518 10.4231 14.0761 10.257C14.0004 10.0909 13.9806 9.90808 14.0192 9.73174C14.0578 9.55539 14.153 9.39341 14.2929 9.26627C14.4327 9.13913 14.6109 9.05255 14.8049 9.01747C14.9989 8.98239 15.2 9.00039 15.3827 9.0692C15.5654 9.13801 15.7216 9.25453 15.8315 9.40403C15.9414 9.55353 16 9.72929 16 9.90909L16 12.1818C16 12.664 15.7893 13.1265 15.4142 13.4675C15.0391 13.8084 14.5304 14 14 14"></path>
</svg>`;
var taskListIcon = `<svg viewBox="0 0 18 18">
  <line stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="8" x2="16" y1="4" y2="4"></line>
  <line stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="8" x2="16" y1="9" y2="9"></line>
  <line stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="8" x2="16" y1="14" y2="14"></line>
  <rect stroke="currentColor" fill="none" stroke-width="1.5" x="2" y="3" width="3" height="3" rx="0.5"></rect>
  <rect stroke="currentColor" fill="none" stroke-width="1.5" x="2" y="13" width="3" height="3" rx="0.5"></rect>
  <polyline stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" points="2.65 9.5 3.5 10.5 5 8.5"></polyline>
</svg>`;
var uploadIcon = `<svg viewBox="0 0 18 18">
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.25 12.375v1.688A1.688 1.688 0 0 0 3.938 15.75h10.124a1.688 1.688 0 0 0 1.688-1.688V12.375"></path>
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.063 6.188L9 2.25l3.938 3.938"></path>
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 2.25v10.125"></path>
</svg>`;
var eyeIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" fill="none"></path>
  <circle cx="12" cy="12" r="3" fill="none"></circle>
</svg>`;
var moreIcon = `<svg viewBox="0 0 18 18">
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="3" x2="15" y1="5" y2="5"></line>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="3" x2="15" y1="9" y2="9"></line>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="3" x2="15" y1="13" y2="13"></line>
</svg>`;
var strikeIcon = `<svg viewBox="0 0 18 18">
  <line stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="5" x2="13" y1="4" y2="4"></line>
  <line stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="5" x2="13" y1="14" y2="14"></line>
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6,9 A3,3,0,0,1,12,9"></path>
  <line stroke="currentColor" stroke-linecap="round" stroke-width="2" x1="3" x2="15" y1="9" y2="9"></line>
</svg>`;
var underlineIcon = `<svg viewBox="0 0 18 18">
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5,3v4a4,4,0,0,0,8,0V3"></path>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="3.5" x2="14.5" y1="16" y2="16"></line>
</svg>`;
var h4Icon = `<svg viewBox="0 0 18 18">
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3,4V9M8,4V9M3,6.5H8"></path>
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14,4V12M10,12L13.5,4"></path>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="10" x2="15" y1="10" y2="10"></line>
</svg>`;
var h5Icon = `<svg viewBox="0 0 18 18">
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3,4V9M8,4V9M3,6.5H8"></path>
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10,4h4V6H10"></path>
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10,8.5V13"></path>
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3,13h5"></path>
</svg>`;
var h6Icon = `<svg viewBox="0 0 18 18">
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3,4V9M8,4V9M3,6.5H8"></path>
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10,13V4"></path>
  <circle stroke="currentColor" fill="none" stroke-width="2" cx="13" cy="9" r="2.4"></circle>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="13" x2="13" y1="6.6" y2="4"></line>
</svg>`;
var imageIcon = `<svg viewBox="0 0 18 18">
  <rect stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x="3" y="4" width="12" height="10" rx="1"></rect>
  <circle stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" cx="6.5" cy="7.5" r="1"></circle>
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14,12L9,7.5l-3,3L3.5,12"></path>
</svg>`;
var codeBlockIcon = `<svg viewBox="0 0 18 18">
  <rect stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x="2.5" y="4" width="13" height="10" rx="1"></rect>
  <polyline stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" points="6.5 7 5 9 6.5 11"></polyline>
  <polyline stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" points="11.5 7 13 9 11.5 11"></polyline>
</svg>`;
var tableIcon = `<svg viewBox="0 0 18 18">
  <rect stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x="2.5" y="4" width="13" height="10" rx="1"></rect>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" x1="7" x2="7" y1="4" y2="14"></line>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" x1="11" x2="11" y1="4" y2="14"></line>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" x1="2.5" x2="15.5" y1="8" y2="8"></line>
</svg>`;
var hrIcon = `<svg viewBox="0 0 18 18">
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="3" x2="15" y1="9" y2="9"></line>
  <circle stroke="currentColor" fill="none" stroke-width="2" cx="6" cy="9" r="0.4" opacity="0"></circle>
</svg>`;
var superscriptIcon = `<svg viewBox="0 0 18 18">
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3,5l5,5M8,5l-5,5"></path>
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12,5.5A1.5,1.5,0,0,1,15,5v0a1,1,0,0,1-2,1"></path>
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14,4h2"></path>
</svg>`;
var subscriptIcon = `<svg viewBox="0 0 18 18">
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3,5l5,5M8,5l-5,5"></path>
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12,13A1.5,1.5,0,0,1,15,12.5v0a1,1,0,0,1-2,1"></path>
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14,11.5h2"></path>
</svg>`;
var highlightIcon = `<svg viewBox="0 0 18 18">
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12,4l2,2"></path>
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.5,10.5L7,13L13.2,6.8L10.7,4.3L4.5,10.5Z"></path>
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3,15l4-4"></path>
</svg>`;
var clearFormatIcon = `<svg viewBox="0 0 18 18">
  <line stroke="currentColor" stroke-linecap="round" stroke-width="2" x1="4" x2="14" y1="13" y2="6"></line>
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6.5,15h5M8.5,15l-1-8"></path>
</svg>`;
var footnoteIcon = `<svg viewBox="0 0 18 18">
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9,4A7,7,0,1,0,16,9"></path>
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9,17V4"></path>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="6" x2="12" y1="10" y2="10"></line>
</svg>`;
var tocIcon = `<svg viewBox="0 0 18 18">
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="2" x2="7" y1="4" y2="4"></line>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="2" x2="5" y1="8" y2="8"></line>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="2" x2="6" y1="12" y2="12"></line>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="2" x2="4" y1="16" y2="16"></line>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" x1="10" x2="16" y1="4" y2="4"></line>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" x1="10" x2="16" y1="8" y2="8"></line>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" x1="10" x2="16" y1="12" y2="12"></line>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" x1="10" x2="16" y1="16" y2="16"></line>
</svg>`;
var mathIcon = `<svg viewBox="0 0 18 18">
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3,6L8.5,3l-2,9L12,9"></path>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="3" x2="15" y1="15" y2="15"></line>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" x1="13.5" x2="13.5" y1="12" y2="14"></line>
</svg>`;
var mermaidIcon = `<svg viewBox="0 0 18 18">
  <rect stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x="2.5" y="2.5" width="5" height="4" rx="0.8"></rect>
  <rect stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x="10.5" y="11.5" width="5" height="4" rx="0.8"></rect>
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M7.5,4.5H13v3a1,1,0,0,1-1,1H9a1,1,0,0,1-1,1V9"></path>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" x1="8" x2="8" y1="2.5" y2="8"></line>
</svg>`;
var graphvizIcon = `<svg viewBox="0 0 18 18">
  <circle stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" cx="4.5" cy="9" r="2"></circle>
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6.5,10L15,12.5"></path>
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6.5,8L15,5.5"></path>
  <polyline stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" points="13.5 11 15.5 12.5 13.5 14"></polyline>
</svg>`;
var plantumlIcon = `<svg viewBox="0 0 18 18">
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4,11a3,3,0,0,1,6,0a3,3,0,0,0,6,0"></path>
  <circle stroke="currentColor" fill="none" stroke-width="2" cx="9" cy="6" r="1.4"></circle>
  <line stroke="currentColor" stroke-linecap="round" stroke-width="1.6" x1="9" x2="9" y1="7.4" y2="11"></line>
</svg>`;
var indentIcon = `<svg viewBox="0 0 18 18">
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="3" x2="15" y1="4" y2="4"></line>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="9" x2="15" y1="8" y2="8"></line>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="3" x2="15" y1="14" y2="14"></line>
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6,6.5L4,8.5L6,10.5"></path>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" x1="9" x2="15" y1="11" y2="11"></line>
</svg>`;
var outdentIcon = `<svg viewBox="0 0 18 18">
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="3" x2="15" y1="4" y2="4"></line>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="9" x2="15" y1="8" y2="8"></line>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="3" x2="15" y1="14" y2="14"></line>
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4,6.5L6,8.5L4,10.5"></path>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" x1="9" x2="15" y1="11" y2="11"></line>
</svg>`;
var alignLeftIcon = `<svg viewBox="0 0 18 18">
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="3" x2="15" y1="4" y2="4"></line>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="3" x2="10" y1="8" y2="8"></line>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="3" x2="15" y1="12" y2="12"></line>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="3" x2="7" y1="16" y2="16"></line>
</svg>`;
var alignCenterIcon = `<svg viewBox="0 0 18 18">
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="3" x2="15" y1="4" y2="4"></line>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="5" x2="13" y1="8" y2="8"></line>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="3" x2="15" y1="12" y2="12"></line>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="6" x2="12" y1="16" y2="16"></line>
</svg>`;
var alignRightIcon = `<svg viewBox="0 0 18 18">
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="3" x2="15" y1="4" y2="4"></line>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="8" x2="15" y1="8" y2="8"></line>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="3" x2="15" y1="12" y2="12"></line>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="11" x2="15" y1="16" y2="16"></line>
</svg>`;
var formatDocIcon = `<svg viewBox="0 0 18 18">
  <path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4,4h10v3H10v4H6v3"></path>
  <line stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="4" x2="4" y1="2" y2="16"></line>
</svg>`;

// src/toolbar-buttons.js
function toggleWrap(ta, open, close = open) {
  const s = ta.selectionStart || 0;
  const e = ta.selectionEnd || 0;
  const val = ta.value;
  const sel = val.slice(s, e);
  if (val.startsWith(open, s) && val.endsWith(close, e)) {
    const inner = val.slice(s + open.length, e - close.length);
    ta.setSelectionRange(0, 0);
    ta.value = val.slice(0, s) + inner + val.slice(e);
    ta.setSelectionRange(s, s + inner.length);
  } else {
    ta.setSelectionRange(0, 0);
    ta.value = val.slice(0, s) + open + sel + close + val.slice(e);
    ta.setSelectionRange(s + open.length, s + open.length + sel.length);
  }
}
function prefixBlock(ta, prefix) {
  const lines = ta.value.split("\n");
  const s = ta.selectionStart || 0;
  let lineIndex = 0;
  let acc = 0;
  while (acc + lines[lineIndex].length < s && lineIndex < lines.length - 1) {
    acc += lines[lineIndex].length + 1;
    lineIndex++;
  }
  lines[lineIndex] = prefix + lines[lineIndex];
  ta.value = lines.join("\n");
  ta.setSelectionRange(s + prefix.length, s + prefix.length);
}
function insertBlock(ta, text) {
  const s = ta.selectionStart || 0;
  const e = ta.selectionEnd || s;
  ta.setSelectionRange(0, 0);
  ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
  ta.setSelectionRange(s, s + text.length);
}
function clearFormatOnSelection(ta) {
  const s = ta.selectionStart || 0;
  const e = ta.selectionEnd || 0;
  if (s === e)
    return false;
  const sel = ta.value.slice(s, e);
  const cleaned = sel.replace(/(\*\*|__)(.*?)\1/g, "$2").replace(/(\*|_)(.*?)\1/g, "$2").replace(/~~(.*?)~~/g, "$1").replace(/`(.*?)`/g, "$1").replace(/\[(.*?)\]\((.*?)\)/g, "$1").replace(/^#{1,6}\s*/gm, "").replace(/^>\s*/gm, "");
  ta.value = ta.value.slice(0, s) + cleaned + ta.value.slice(e);
  ta.setSelectionRange(s, s + cleaned.length);
  return true;
}
function formatDocumentContent(text) {
  return text.replace(/\n{4,}/g, "\n\n\n").replace(/(^|\n)#{1,6} [^\n]+/g, (m, pre) => pre === "\n" ? "\n" + m.trim() : m.trim()).trim() + "\n";
}
var dispatch = ({ editor, ta }) => {
  ta.dispatchEvent(new Event("input", { bubbles: true }));
  if (editor.toolbar)
    editor.toolbar.updateButtonStates();
};
var makeAction = (fn) => (ctx) => {
  const { editor } = ctx;
  const ta = editor.textarea;
  const ran = fn(ta);
  if (ran !== false)
    dispatch(ctx);
};
function insertTableAt(ta) {
  const t2 = "| \u8868\u5934A | \u8868\u5934B |\n| --- | --- |\n| \u5185\u5BB9A | \u5185\u5BB9B |\n";
  insertBlock(ta, t2);
}
function codeBlockAt(ta) {
  const s = ta.selectionStart || 0;
  const e = ta.selectionEnd || s;
  const sel = ta.value.slice(s, e) || "\u4EE3\u7801";
  insertBlock(ta, "```\n" + sel + "\n```");
}
function imageAt(ta) {
  insertBlock(ta, "![](\u56FE\u7247URL)");
}
var md = ({ editor }, fn) => {
  fn(editor.textarea);
  editor.textarea.dispatchEvent(new Event("input", { bubbles: true }));
};
var toolbarButtons = {
  // --- 样式 ---
  bold: {
    name: "bold",
    actionId: "toggleBold",
    icon: boldIcon,
    title: "bold",
    isActive: ({ activeFormats }) => activeFormats.includes("bold"),
    action: (c) => md(c, toggleBold)
  },
  italic: {
    name: "italic",
    actionId: "toggleItalic",
    icon: italicIcon,
    title: "italic",
    isActive: ({ activeFormats }) => activeFormats.includes("italic"),
    action: (c) => md(c, toggleItalic)
  },
  strike: {
    name: "strike",
    actionId: "toggleStrike",
    icon: strikeIcon,
    title: "strike",
    isActive: ({ activeFormats }) => activeFormats.includes("strikethrough"),
    action: makeAction((ta) => toggleWrap(ta, "~~"))
  },
  underline: {
    name: "underline",
    actionId: "toggleUnderline",
    icon: underlineIcon,
    title: "underline",
    isActive: () => false,
    action: makeAction((ta) => toggleWrap(ta, "<u>", "</u>"))
  },
  code: {
    name: "code",
    actionId: "toggleCode",
    icon: codeIcon,
    title: "code",
    isActive: ({ activeFormats }) => activeFormats.includes("code"),
    action: ({ editor }) => toggleCode(editor.textarea),
    provider: "md"
  },
  superscript: {
    name: "superscript",
    actionId: "toggleSuperscript",
    icon: superscriptIcon,
    title: "superscript",
    group: "\u683C\u5F0F",
    more: true,
    action: makeAction((ta) => toggleWrap(ta, "<sup>", "</sup>"))
  },
  subscript: {
    name: "subscript",
    actionId: "toggleSubscript",
    icon: subscriptIcon,
    title: "subscript",
    group: "\u683C\u5F0F",
    more: true,
    action: makeAction((ta) => toggleWrap(ta, "<sub>", "</sub>"))
  },
  highlight: {
    name: "highlight",
    actionId: "toggleHighlight",
    icon: highlightIcon,
    title: "highlight",
    group: "\u683C\u5F0F",
    more: true,
    action: makeAction((ta) => toggleWrap(ta, "=="))
  },
  clearFormat: {
    name: "clearFormat",
    actionId: "clearFormat",
    icon: clearFormatIcon,
    title: "clearFormat",
    group: "\u683C\u5F0F",
    more: true,
    action: makeAction((ta) => clearFormatOnSelection(ta))
  },
  // --- 引用/行内 ---
  link: {
    name: "link",
    actionId: "insertLink",
    icon: linkIcon,
    title: "link",
    action: ({ editor }) => insertLink(editor.textarea),
    provider: "md"
  },
  image: {
    name: "image",
    actionId: "insertImage",
    icon: imageIcon,
    title: "image",
    action: makeAction(imageAt)
  },
  // --- 标题 ---
  h1: {
    name: "h1",
    actionId: "toggleH1",
    icon: h1Icon,
    title: "h1",
    isActive: ({ activeFormats }) => activeFormats.includes("header"),
    action: ({ editor }) => toggleH1(editor.textarea),
    provider: "md"
  },
  h2: {
    name: "h2",
    actionId: "toggleH2",
    icon: h2Icon,
    title: "h2",
    isActive: ({ activeFormats }) => activeFormats.includes("header-2"),
    action: ({ editor }) => toggleH2(editor.textarea),
    provider: "md"
  },
  h3: {
    name: "h3",
    actionId: "toggleH3",
    icon: h3Icon,
    title: "h3",
    isActive: ({ activeFormats }) => activeFormats.includes("header-3"),
    action: ({ editor }) => toggleH3(editor.textarea),
    provider: "md"
  },
  h4: {
    name: "h4",
    actionId: "toggleH4",
    icon: h4Icon,
    title: "h4",
    group: "\u5757",
    more: true,
    isActive: ({ activeFormats }) => activeFormats.includes("header-4"),
    action: makeAction((ta) => prefixBlock(ta, "#### "))
  },
  h5: {
    name: "h5",
    actionId: "toggleH5",
    icon: h5Icon,
    title: "h5",
    group: "\u5757",
    more: true,
    isActive: ({ activeFormats }) => activeFormats.includes("header-5"),
    action: makeAction((ta) => prefixBlock(ta, "##### "))
  },
  h6: {
    name: "h6",
    actionId: "toggleH6",
    icon: h6Icon,
    title: "h6",
    group: "\u5757",
    more: true,
    isActive: ({ activeFormats }) => activeFormats.includes("header-6"),
    action: makeAction((ta) => prefixBlock(ta, "###### "))
  },
  // --- 列表 ---
  bulletList: {
    name: "bulletList",
    actionId: "toggleBulletList",
    icon: bulletListIcon,
    title: "bulletList",
    isActive: ({ activeFormats }) => activeFormats.includes("bullet-list"),
    action: ({ editor }) => toggleBulletList(editor.textarea),
    provider: "md"
  },
  orderedList: {
    name: "orderedList",
    actionId: "toggleNumberedList",
    icon: orderedListIcon,
    title: "orderedList",
    isActive: ({ activeFormats }) => activeFormats.includes("numbered-list"),
    action: ({ editor }) => toggleNumberedList(editor.textarea),
    provider: "md"
  },
  taskList: {
    name: "taskList",
    actionId: "toggleTaskList",
    icon: taskListIcon,
    title: "taskList",
    isActive: ({ activeFormats }) => activeFormats.includes("task-list"),
    action: ({ editor }) => {
      if (toggleTaskList)
        toggleTaskList(editor.textarea);
    },
    provider: "md"
  },
  // --- 块 ---
  quote: {
    name: "quote",
    actionId: "toggleQuote",
    icon: quoteIcon,
    title: "quote",
    isActive: ({ activeFormats }) => activeFormats.includes("quote"),
    action: ({ editor }) => toggleQuote(editor.textarea),
    provider: "md"
  },
  codeBlock: {
    name: "codeBlock",
    actionId: "insertCodeBlock",
    icon: codeBlockIcon,
    title: "codeBlock",
    action: makeAction(codeBlockAt)
  },
  table: {
    name: "table",
    actionId: "insertTable",
    icon: tableIcon,
    title: "table",
    action: makeAction(insertTableAt)
  },
  hr: {
    name: "hr",
    actionId: "insertHR",
    icon: hrIcon,
    title: "hr",
    action: makeAction((ta) => insertBlock(ta, "\n---\n"))
  },
  // --- 插入（更多面板） ---
  footnote: {
    name: "footnote",
    actionId: "insertFootnote",
    icon: footnoteIcon,
    title: "footnote",
    group: "\u63D2\u5165",
    more: true,
    action: makeAction((ta) => insertBlock(ta, "[^1] \u811A\u6CE8\u5185\u5BB9"))
  },
  toc: {
    name: "toc",
    actionId: "insertTOC",
    icon: tocIcon,
    title: "toc",
    group: "\u63D2\u5165",
    more: true,
    action: makeAction((ta) => insertBlock(ta, "[TOC]"))
  },
  math: {
    name: "math",
    actionId: "insertMath",
    icon: mathIcon,
    title: "math",
    group: "\u63D2\u5165",
    more: true,
    action: makeAction((ta) => toggleWrap(ta, "$$", "$$"))
  },
  mermaid: {
    name: "mermaid",
    actionId: "insertMermaid",
    icon: mermaidIcon,
    title: "mermaid",
    group: "\u63D2\u5165",
    more: true,
    action: makeAction((ta) => insertBlock(ta, "```mermaid\ngraph TD\n  A-->B\n```"))
  },
  graphviz: {
    name: "graphviz",
    actionId: "insertGraphviz",
    icon: graphvizIcon,
    title: "graphviz",
    group: "\u63D2\u5165",
    more: true,
    action: makeAction((ta) => insertBlock(ta, "```dot\ndigraph G {\n  A -> B;\n}\n```"))
  },
  plantuml: {
    name: "plantuml",
    actionId: "insertPlantuml",
    icon: plantumlIcon,
    title: "plantuml",
    group: "\u63D2\u5165",
    more: true,
    action: makeAction((ta) => insertBlock(ta, "```plantuml\n@startuml\nAlice -> Bob: hi\n@enduml\n```"))
  },
  // --- 杂项 ---
  indent: {
    name: "indent",
    actionId: "indentText",
    icon: indentIcon,
    title: "indent",
    group: "\u6742\u9879",
    more: true,
    action: makeAction((ta) => prefixBlock(ta, "  "))
  },
  outdent: {
    name: "outdent",
    actionId: "outdentText",
    icon: outdentIcon,
    title: "outdent",
    group: "\u6742\u9879",
    more: true,
    action: makeAction((ta) => {
      const lines = ta.value.split("\n");
      const start = ta.selectionStart || 0;
      let li = 0, acc = 0;
      while (acc + lines[li].length < start && li < lines.length - 1) {
        acc += lines[li].length + 1;
        li++;
      }
      lines[li] = lines[li].replace(/^ {2}/, "");
      ta.value = lines.join("\n");
      ta.setSelectionRange(Math.max(0, start - 2), Math.max(0, start - 2));
      return true;
    })
  },
  alignLeft: {
    name: "alignLeft",
    actionId: "alignLeft",
    icon: alignLeftIcon,
    title: "alignLeft",
    group: "\u6742\u9879",
    more: true,
    isActive: ({ activeFormats }) => activeFormats.includes("align-left"),
    action: makeAction((ta) => toggleWrap(ta, '<div align="left">', "</div>"))
  },
  alignCenter: {
    name: "alignCenter",
    actionId: "alignCenter",
    icon: alignCenterIcon,
    title: "alignCenter",
    group: "\u6742\u9879",
    more: true,
    isActive: ({ activeFormats }) => activeFormats.includes("align-center"),
    action: makeAction((ta) => toggleWrap(ta, '<div align="center">', "</div>"))
  },
  alignRight: {
    name: "alignRight",
    actionId: "alignRight",
    icon: alignRightIcon,
    title: "alignRight",
    group: "\u6742\u9879",
    more: true,
    isActive: ({ activeFormats }) => activeFormats.includes("align-right"),
    action: makeAction((ta) => toggleWrap(ta, '<div align="right">', "</div>"))
  },
  formatDoc: {
    name: "formatDoc",
    actionId: "formatDocument",
    icon: formatDocIcon,
    title: "formatDoc",
    group: "\u6742\u9879",
    more: true,
    action: ({ editor, getValue, setValue }) => {
      setValue(formatDocumentContent(getValue()));
      editor.textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }
  },
  separator: { name: "separator", group: "__none__" },
  // --- 上传/视图（特殊，内部处理） ---
  upload: {
    name: "upload",
    actionId: "uploadFile",
    icon: uploadIcon,
    title: "upload",
    action: ({ editor }) => {
      var _a, _b;
      if (!((_a = editor.options.fileUpload) == null ? void 0 : _a.enabled))
        return;
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      if (((_b = editor.options.fileUpload.mimeTypes) == null ? void 0 : _b.length) > 0) {
        input.accept = editor.options.fileUpload.mimeTypes.join(",");
      }
      input.onchange = () => {
        var _a2;
        if (!((_a2 = input.files) == null ? void 0 : _a2.length))
          return;
        const dt = new DataTransfer();
        for (const f of input.files)
          dt.items.add(f);
        editor._handleDataTransfer(dt);
      };
      input.click();
    }
  },
  viewMode: {
    name: "viewMode",
    icon: eyeIcon,
    title: "viewMode"
    // 内部 Special dropdown
  },
  more: {
    name: "more",
    icon: moreIcon,
    title: "more"
    // 内部 Special:「更多」面板触发器
  }
};
var defaultToolbarButtons = [
  toolbarButtons.bold,
  toolbarButtons.italic,
  toolbarButtons.strike,
  toolbarButtons.underline,
  toolbarButtons.code,
  toolbarButtons.separator,
  toolbarButtons.link,
  toolbarButtons.image,
  toolbarButtons.upload,
  toolbarButtons.separator,
  toolbarButtons.h1,
  toolbarButtons.h2,
  toolbarButtons.h3,
  toolbarButtons.separator,
  toolbarButtons.bulletList,
  toolbarButtons.orderedList,
  toolbarButtons.taskList,
  toolbarButtons.separator,
  toolbarButtons.quote,
  toolbarButtons.codeBlock,
  toolbarButtons.table,
  toolbarButtons.hr,
  toolbarButtons.separator,
  toolbarButtons.more,
  toolbarButtons.viewMode
];
var moreToolbarButtons = Object.values(toolbarButtons).filter((b) => b && b.more);

// src/toolbar.js
var GROUP_ORDER = ["\u683C\u5F0F", "\u5757", "\u63D2\u5165", "\u6742\u9879", "__none__"];
var GROUP_KEY = {
  "\u683C\u5F0F": "format",
  "\u5757": "block",
  "\u63D2\u5165": "insert",
  "\u6742\u9879": "misc"
};
var Toolbar = class {
  constructor(editor, options = {}) {
    var _a;
    this.editor = editor;
    this.container = null;
    this.buttons = {};
    this.currentItemIndex = 0;
    this.handleDocumentClick = null;
    this.activeDropdown = null;
    this.activeDropdownButton = null;
    this.morePanel = null;
    this.moreCleanup = null;
    this.moreButtons = {};
    this.toolbarButtons = options.toolbarButtons || [];
    this.lang = ((_a = this.editor.options) == null ? void 0 : _a.lang) || options.lang || LANG_ZH;
  }
  /**
   * Create and render toolbar
   */
  create() {
    this.container = document.createElement("div");
    this.container.className = "overtype-toolbar";
    this.container.id = this.getInstanceElementId("toolbar");
    this.container.setAttribute("role", "toolbar");
    this.container.setAttribute("aria-label", t("toolbar_label", this.lang));
    this.container.setAttribute("aria-controls", this.editor.textarea.id);
    this.toolbarButtons.forEach((buttonConfig) => {
      if (buttonConfig.name === "separator") {
        const separator = this.createSeparator();
        this.container.appendChild(separator);
      } else {
        const button = this.createButton(buttonConfig);
        this.buttons[buttonConfig.name] = button;
        this.container.appendChild(button);
      }
    });
    this.setupRovingTabIndex();
    this.updateButtonStates();
    this.editor.container.insertBefore(this.container, this.editor.wrapper);
  }
  /**
   * Build a stable id from the owning OverType instance
   */
  getInstanceElementId(name) {
    return `overtype-${this.editor.instanceId}-${name}`;
  }
  /**
   * Configure toolbar focus management per the ARIA toolbar pattern
   */
  setupRovingTabIndex() {
    const toolbarItems = this.getToolbarItems();
    if (toolbarItems.length === 0) {
      return;
    }
    this.currentItemIndex = this.getValidItemIndex(this.currentItemIndex);
    this.updateTabIndexes();
    this.container.addEventListener("keydown", (e) => {
      this.onToolbarKeydown(e);
    });
    this.container.addEventListener("focusin", (e) => {
      this.onToolbarFocusin(e);
    });
  }
  /**
   * Get toolbar buttons in DOM order for keyboard navigation
   */
  getToolbarItems() {
    if (!this.container) {
      return [];
    }
    return Array.from(this.container.querySelectorAll(".overtype-toolbar-button"));
  }
  /**
   * Handle keyboard navigation within the toolbar
   */
  onToolbarKeydown(e) {
    const toolbarItems = this.getToolbarItems();
    if (!toolbarItems.includes(e.target)) {
      return;
    }
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        this.focusItem(this.currentItemIndex + 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        this.focusItem(this.currentItemIndex - 1);
        break;
      case "Home":
        e.preventDefault();
        this.focusItem(0);
        break;
      case "End":
        e.preventDefault();
        this.focusItem(toolbarItems.length - 1);
        break;
    }
  }
  /**
   * Remember the focused toolbar item as the toolbar tab stop
   */
  onToolbarFocusin(e) {
    const focusedItemIndex = this.getToolbarItems().indexOf(e.target);
    if (focusedItemIndex === -1) {
      return;
    }
    this.currentItemIndex = focusedItemIndex;
    this.updateTabIndexes();
  }
  /**
   * Move focus to a toolbar item and make it the only tab stop
   */
  focusItem(index) {
    const toolbarItems = this.getToolbarItems();
    if (toolbarItems.length === 0) {
      return;
    }
    this.currentItemIndex = this.getValidItemIndex(index, toolbarItems);
    this.updateTabIndexes();
    toolbarItems[this.currentItemIndex].focus();
  }
  /**
   * Normalize toolbar item indexes with wrapping
   */
  getValidItemIndex(index, toolbarItems = this.getToolbarItems()) {
    const itemCount = toolbarItems.length;
    if (itemCount === 0) {
      return 0;
    }
    if (index < 0) {
      return itemCount - 1;
    }
    if (index >= itemCount) {
      return 0;
    }
    return index;
  }
  /**
   * Keep exactly one toolbar item in the page tab sequence
   */
  updateTabIndexes() {
    this.getToolbarItems().forEach((item, index) => {
      item.tabIndex = index === this.currentItemIndex ? 0 : -1;
    });
  }
  /**
   * Create a toolbar separator
   */
  createSeparator() {
    const separator = document.createElement("div");
    separator.className = "overtype-toolbar-separator";
    separator.setAttribute("role", "separator");
    return separator;
  }
  /**
   * Create a toolbar button
   */
  createButton(buttonConfig) {
    const button = document.createElement("button");
    button.className = "overtype-toolbar-button";
    button.type = "button";
    button.setAttribute("data-button", buttonConfig.name);
    const label = t(buttonConfig.title || buttonConfig.name, this.lang);
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = this.sanitizeSVG(buttonConfig.icon || "");
    if (buttonConfig.name === "viewMode") {
      button.classList.add("has-dropdown");
      button.dataset.dropdown = "true";
      button.setAttribute("aria-haspopup", "menu");
      button.setAttribute("aria-expanded", "false");
      button._clickHandler = (e) => {
        e.preventDefault();
        this.toggleViewModeDropdown(button);
      };
      button._keydownHandler = (e) => {
        if (!["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
          return;
        }
        e.preventDefault();
        const placement = e.key === "ArrowUp" ? "last" : "current";
        this.openViewModeDropdown(button, placement);
      };
      button.addEventListener("click", button._clickHandler);
      button.addEventListener("keydown", button._keydownHandler);
      return button;
    }
    if (buttonConfig.name === "more") {
      button.classList.add("has-dropdown");
      button.dataset.dropdown = "true";
      button.setAttribute("aria-haspopup", "true");
      button.setAttribute("aria-expanded", "false");
      button._clickHandler = (e) => {
        e.preventDefault();
        this.toggleMorePanel(button);
      };
      button._keydownHandler = (e) => {
        if (!["ArrowDown", "Enter", " "].includes(e.key)) {
          return;
        }
        e.preventDefault();
        this.openMorePanel(button, "current");
      };
      button.addEventListener("click", button._clickHandler);
      button.addEventListener("keydown", button._keydownHandler);
      return button;
    }
    button._clickHandler = (e) => {
      e.preventDefault();
      const actionId = buttonConfig.actionId || buttonConfig.name;
      this.editor.performAction(actionId, e);
    };
    button.addEventListener("click", button._clickHandler);
    return button;
  }
  /**
   * Handle button action programmatically
   * Accepts either an actionId string or a buttonConfig object (backwards compatible)
   * @param {string|Object} actionIdOrConfig - Action identifier string or button config object
   * @returns {Promise<boolean>} Whether the action was executed
   */
  async handleAction(actionIdOrConfig) {
    if (actionIdOrConfig && typeof actionIdOrConfig === "object" && typeof actionIdOrConfig.action === "function") {
      this.editor.textarea.focus();
      try {
        await actionIdOrConfig.action({
          editor: this.editor,
          getValue: () => this.editor.getValue(),
          setValue: (value) => this.editor.setValue(value),
          event: null
        });
        return true;
      } catch (error) {
        console.error(`Action "${actionIdOrConfig.name}" error:`, error);
        this.editor.wrapper.dispatchEvent(new CustomEvent("button-error", {
          detail: { buttonName: actionIdOrConfig.name, error }
        }));
        return false;
      }
    }
    if (typeof actionIdOrConfig === "string") {
      return this.editor.performAction(actionIdOrConfig, null);
    }
    return false;
  }
  /**
   * Sanitize SVG to prevent XSS
   */
  sanitizeSVG(svg) {
    if (typeof svg !== "string")
      return "";
    const cleaned = svg.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").replace(/\son\w+\s*=\s*["'][^"']*["']/gi, "").replace(/\son\w+\s*=\s*[^\s>]*/gi, "");
    return cleaned;
  }
  /**
   * Toggle view mode dropdown (internal implementation)
   * Not exposed to users - viewMode button behavior is fixed
   */
  toggleViewModeDropdown(button) {
    if (this.activeDropdown) {
      this.closeViewModeDropdown(button);
      return;
    }
    this.openViewModeDropdown(button);
  }
  /**
   * Open the view mode dropdown
   */
  openViewModeDropdown(button, focusPlacement = null) {
    this.closeViewModeDropdown(button);
    button.classList.add("dropdown-active");
    const dropdown = this.createViewModeDropdown(button);
    const rect = button.getBoundingClientRect();
    dropdown.style.position = "absolute";
    dropdown.style.top = `${rect.bottom + 5}px`;
    dropdown.style.left = `${rect.left}px`;
    document.body.appendChild(dropdown);
    this.activeDropdown = dropdown;
    this.activeDropdownButton = button;
    button.setAttribute("aria-controls", dropdown.id);
    button.setAttribute("aria-expanded", "true");
    this.handleDocumentClick = (e) => {
      if (!dropdown.contains(e.target) && !button.contains(e.target)) {
        this.closeViewModeDropdown(button);
      }
    };
    setTimeout(() => {
      document.addEventListener("click", this.handleDocumentClick);
    }, 0);
    if (focusPlacement) {
      this.focusViewModeMenuItem(dropdown, focusPlacement);
    }
  }
  /**
   * Close the view mode dropdown
   */
  closeViewModeDropdown(button = this.activeDropdownButton, returnFocus = false) {
    if (this.activeDropdown) {
      this.activeDropdown.remove();
      this.activeDropdown = null;
    }
    if (button) {
      button.classList.remove("dropdown-active");
      button.setAttribute("aria-expanded", "false");
    }
    if (this.handleDocumentClick) {
      document.removeEventListener("click", this.handleDocumentClick);
      this.handleDocumentClick = null;
    }
    this.activeDropdownButton = null;
    if (returnFocus && button) {
      button.focus();
    }
  }
  /**
   * Create view mode dropdown menu (internal implementation)
   */
  createViewModeDropdown(button) {
    const dropdown = document.createElement("div");
    dropdown.className = "overtype-dropdown-menu";
    dropdown.id = this.getInstanceElementId("toolbar-view-mode-menu");
    dropdown.setAttribute("role", "menu");
    dropdown.setAttribute("aria-label", t("viewMode", this.lang));
    dropdown.addEventListener("keydown", (e) => {
      this.onViewModeMenuKeydown(e, button);
    });
    const items = [
      { id: "normal", label: t("normal", this.lang), icon: "\u2713" },
      { id: "ir", label: t("ir", this.lang), icon: "\u2713" }
    ];
    const currentMode = this.editor.container.dataset.mode || "normal";
    items.forEach((item) => {
      const menuItem = document.createElement("button");
      menuItem.className = "overtype-dropdown-item";
      menuItem.type = "button";
      menuItem.tabIndex = -1;
      menuItem.setAttribute("role", "menuitemradio");
      menuItem.setAttribute("aria-checked", String(item.id === currentMode));
      menuItem.textContent = item.label;
      if (item.id === currentMode) {
        menuItem.classList.add("active");
        const checkmark = document.createElement("span");
        checkmark.className = "overtype-dropdown-icon";
        checkmark.setAttribute("aria-hidden", "true");
        checkmark.textContent = item.icon;
        menuItem.prepend(checkmark);
      }
      menuItem.addEventListener("click", (e) => {
        e.preventDefault();
        switch (item.id) {
          case "ir":
            this.editor.showInstantRenderMode();
            break;
          case "normal":
          default:
            this.editor.showNormalEditMode();
            break;
        }
        this.closeViewModeDropdown(button, true);
      });
      dropdown.appendChild(menuItem);
    });
    return dropdown;
  }
  /**
   * Handle keyboard navigation inside the view mode menu
   */
  onViewModeMenuKeydown(e, button) {
    const menuItems = this.getViewModeMenuItems();
    const currentIndex = menuItems.indexOf(e.target);
    if (currentIndex === -1) {
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        this.focusViewModeMenuItem(this.activeDropdown, currentIndex + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        this.focusViewModeMenuItem(this.activeDropdown, currentIndex - 1);
        break;
      case "Home":
        e.preventDefault();
        this.focusViewModeMenuItem(this.activeDropdown, "first");
        break;
      case "End":
        e.preventDefault();
        this.focusViewModeMenuItem(this.activeDropdown, "last");
        break;
      case "Escape":
        e.preventDefault();
        this.closeViewModeDropdown(button, true);
        break;
    }
  }
  /**
   * Focus a view mode menu item by index or placement
   */
  focusViewModeMenuItem(dropdown, placement) {
    const menuItems = this.getViewModeMenuItems(dropdown);
    if (menuItems.length === 0) {
      return;
    }
    let index = placement;
    if (placement === "first") {
      index = 0;
    } else if (placement === "last") {
      index = menuItems.length - 1;
    } else if (placement === "current") {
      index = menuItems.findIndex((item) => item.getAttribute("aria-checked") === "true");
    }
    if (index < 0) {
      index = menuItems.length - 1;
    }
    if (index >= menuItems.length) {
      index = 0;
    }
    menuItems[index].focus();
  }
  /**
   * Get the current view mode menu items
   */
  getViewModeMenuItems(dropdown = this.activeDropdown) {
    if (!dropdown) {
      return [];
    }
    return Array.from(dropdown.querySelectorAll('[role="menuitemradio"]'));
  }
  /* ===== 「更多」面板（P3）：收纳按 group 分组的扩展项 ===== */
  /**
   * Toggle the "more" panel open/closed
   */
  toggleMorePanel(button) {
    if (this.morePanel) {
      this.closeMorePanel(button);
      return;
    }
    this.openMorePanel(button);
  }
  /**
   * Open the "more" panel, positioned against the trigger button via floating-ui
   */
  openMorePanel(button, focusPlacement = null) {
    this.closeMorePanel(button);
    const panel = this.createMorePanel();
    button.classList.add("dropdown-active");
    panel.style.position = "absolute";
    this.moreCleanup = autoUpdate(button, panel, () => {
      computePosition2(button, panel, {
        placement: "bottom-end",
        middleware: [offset2(5), flip2(), shift2({ padding: 5 })]
      }).then(({ x, y }) => {
        Object.assign(panel.style, { left: `${x}px`, top: `${y}px` });
      });
    });
    document.body.appendChild(panel);
    this.morePanel = panel;
    this.activeDropdownButton = button;
    button.setAttribute("aria-expanded", "true");
    button.setAttribute("aria-controls", panel.id);
    this.handleDocumentClick = (e) => {
      if (!panel.contains(e.target) && !button.contains(e.target)) {
        this.closeMorePanel(button);
      }
    };
    setTimeout(() => {
      document.addEventListener("click", this.handleDocumentClick);
    }, 0);
    if (focusPlacement) {
      this.focusMoreItem(panel, focusPlacement);
    }
  }
  /**
   * Close the "more" panel
   */
  closeMorePanel(button = this.activeDropdownButton, returnFocus = false) {
    if (this.moreCleanup) {
      this.moreCleanup();
      this.moreCleanup = null;
    }
    if (this.morePanel) {
      this.morePanel.remove();
      this.morePanel = null;
      for (const name in this.moreButtons) {
        const el = this.moreButtons[name];
        if (el._clickHandler) {
          el.removeEventListener("click", el._clickHandler);
          delete el._clickHandler;
        }
      }
      this.moreButtons = {};
    }
    if (button) {
      button.classList.remove("dropdown-active");
      button.setAttribute("aria-expanded", "false");
    }
    if (this.handleDocumentClick) {
      document.removeEventListener("click", this.handleDocumentClick);
      this.handleDocumentClick = null;
    }
    if (returnFocus && button) {
      button.focus();
    }
  }
  /**
   * Build the "more" panel, grouping extended buttons by their `group`
   */
  createMorePanel() {
    const panel = document.createElement("div");
    panel.className = "overtype-dropdown-menu overtype-more-panel";
    panel.id = this.getInstanceElementId("toolbar-more-panel");
    panel.setAttribute("role", "menu");
    panel.setAttribute("aria-label", t("more", this.lang));
    panel.addEventListener("keydown", (e) => {
      this.onMorePanelKeydown(e);
    });
    const groups = /* @__PURE__ */ new Map();
    moreToolbarButtons.forEach((config) => {
      const groupName = config.group || "\u683C\u5F0F";
      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }
      groups.get(groupName).push(config);
    });
    const orderedGroups = Array.from(groups.keys()).sort((a, b) => {
      const ia = GROUP_ORDER.indexOf(a);
      const ib = GROUP_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    orderedGroups.forEach((groupName) => {
      const groupEl = document.createElement("div");
      groupEl.className = "overtype-more-group";
      const title = document.createElement("div");
      title.className = "overtype-more-group-title";
      title.setAttribute("role", "separator");
      title.textContent = t("group_" + (GROUP_KEY[groupName] || groupName), this.lang);
      groupEl.appendChild(title);
      groups.get(groupName).forEach((config) => {
        const item = this.createMoreItem(config, title);
        groupEl.appendChild(item);
      });
      panel.appendChild(groupEl);
    });
    return panel;
  }
  /**
   * Create a single item inside the more panel
   */
  createMoreItem(buttonConfig) {
    const item = document.createElement("button");
    item.className = "overtype-toolbar-button overtype-more-item";
    item.type = "button";
    item.tabIndex = -1;
    item.setAttribute("role", "menuitem");
    item.setAttribute("data-button", buttonConfig.name);
    const label = t(buttonConfig.title || buttonConfig.name, this.lang);
    item.title = label;
    item.setAttribute("aria-label", label);
    item.innerHTML = this.sanitizeSVG(buttonConfig.icon || "");
    item._clickHandler = (e) => {
      e.preventDefault();
      const actionId = buttonConfig.actionId || buttonConfig.name;
      this.editor.performAction(actionId, e);
      const trigger = this.activeDropdownButton;
      this.closeMorePanel(trigger, true);
    };
    item.addEventListener("click", item._clickHandler);
    this.moreButtons[buttonConfig.name] = item;
    return item;
  }
  /**
   * Handle keyboard navigation inside the more panel
   */
  onMorePanelKeydown(e) {
    const targets = Array.from(this.morePanel.querySelectorAll(".overtype-more-item"));
    const currentIndex = targets.indexOf(e.target);
    if (currentIndex === -1) {
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        targets[(currentIndex + 1) % targets.length].focus();
        break;
      case "ArrowUp":
        e.preventDefault();
        targets[(currentIndex - 1 + targets.length) % targets.length].focus();
        break;
      case "Home":
        e.preventDefault();
        targets[0].focus();
        break;
      case "End":
        e.preventDefault();
        targets[targets.length - 1].focus();
        break;
      case "Escape":
        e.preventDefault();
        this.closeMorePanel(this.activeDropdownButton, true);
        break;
    }
  }
  /**
   * Focus a more-panel item by index or placement
   */
  focusMoreItem(panel, placement) {
    const targets = Array.from(panel.querySelectorAll(".overtype-more-item"));
    if (targets.length === 0) {
      return;
    }
    const index = placement === "last" ? targets.length - 1 : 0;
    targets[index].focus();
  }
  /**
   * Update active states of toolbar buttons
   */
  updateButtonStates() {
    var _a;
    try {
      const activeFormats = ((_a = getActiveFormats2) == null ? void 0 : _a(
        this.editor.textarea,
        this.editor.textarea.selectionStart
      )) || [];
      Object.entries(this.buttons).forEach(([name, button]) => {
        if (name === "viewMode" || name === "more")
          return;
        const buttonConfig = this.toolbarButtons.find((buttonConfig2) => buttonConfig2.name === name);
        if (!(buttonConfig == null ? void 0 : buttonConfig.isActive)) {
          return;
        }
        const isActive = Boolean(buttonConfig.isActive({
          editor: this.editor,
          activeFormats
        }));
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-pressed", isActive.toString());
      });
      Object.entries(this.moreButtons).forEach(([name, item]) => {
        const config = moreToolbarButtons.find((b) => b.name === name);
        if (!(config == null ? void 0 : config.isActive)) {
          return;
        }
        const isActive = Boolean(config.isActive({
          editor: this.editor,
          activeFormats
        }));
        item.classList.toggle("active", isActive);
        item.setAttribute("aria-pressed", isActive.toString());
      });
    } catch (error) {
    }
  }
  show() {
    if (this.container) {
      this.container.classList.remove("overtype-toolbar-hidden");
    }
  }
  hide() {
    if (this.container) {
      this.container.classList.add("overtype-toolbar-hidden");
    }
  }
  /**
   * Destroy toolbar and cleanup
   */
  destroy() {
    if (this.container) {
      if (this.activeDropdown) {
        this.closeViewModeDropdown();
      } else if (this.handleDocumentClick) {
        document.removeEventListener("click", this.handleDocumentClick);
        this.handleDocumentClick = null;
      }
      Object.values(this.buttons).forEach((button) => {
        if (button._clickHandler) {
          button.removeEventListener("click", button._clickHandler);
          delete button._clickHandler;
        }
        if (button._keydownHandler) {
          button.removeEventListener("keydown", button._keydownHandler);
          delete button._keydownHandler;
        }
      });
      this.closeMorePanel();
      this.container.remove();
      this.container = null;
      this.buttons = {};
    }
  }
  /**
   * Switch the toolbar UI language and re-render localized labels.
   * @param {string} lang - 'zh' | 'en'
   */
  setLang(lang) {
    this.lang = lang || LANG_ZH;
    setLang(this.lang);
    if (!this.container) {
      return;
    }
    this.container.setAttribute("aria-label", t("toolbar_label", this.lang));
    this.toolbarButtons.forEach((config) => {
      if (!config.name || config.name === "separator") {
        return;
      }
      const el = this.buttons[config.name];
      if (!el) {
        return;
      }
      const label = t(config.title || config.name, this.lang);
      el.title = label;
      el.setAttribute("aria-label", label);
    });
    if (this.morePanel) {
      const trigger = this.activeDropdownButton;
      this.closeMorePanel(trigger);
      this.openMorePanel(trigger);
    }
  }
};

// src/link-tooltip.js
var LinkTooltip = class {
  constructor(editor) {
    this.editor = editor;
    this.tooltip = null;
    this.currentLink = null;
    this.hideTimeout = null;
    this.visibilityChangeHandler = null;
    this.isTooltipHovered = false;
    this.init();
  }
  init() {
    this.createTooltip();
    this.editor.textarea.addEventListener("selectionchange", () => this.checkCursorPosition());
    this.editor.textarea.addEventListener("keyup", (e) => {
      if (e.key.includes("Arrow") || e.key === "Home" || e.key === "End") {
        this.checkCursorPosition();
      }
    });
    this.editor.textarea.addEventListener("input", () => this.hide());
    this.editor.textarea.addEventListener("scroll", () => {
      if (this.currentLink) {
        this.positionTooltip(this.currentLink);
      }
    });
    this.editor.textarea.addEventListener("blur", () => {
      if (!this.isTooltipHovered) {
        this.hide();
      }
    });
    this.visibilityChangeHandler = () => {
      if (document.hidden) {
        this.hide();
      }
    };
    document.addEventListener("visibilitychange", this.visibilityChangeHandler);
    this.tooltip.addEventListener("mouseenter", () => {
      this.isTooltipHovered = true;
      this.cancelHide();
    });
    this.tooltip.addEventListener("mouseleave", () => {
      this.isTooltipHovered = false;
      this.scheduleHide();
    });
  }
  createTooltip() {
    this.tooltip = document.createElement("div");
    this.tooltip.className = "overtype-link-tooltip";
    this.tooltip.innerHTML = `
      <span style="display: flex; align-items: center; gap: 6px;">
        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style="flex-shrink: 0;">
          <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"></path>
          <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"></path>
        </svg>
        <span class="overtype-link-tooltip-url"></span>
      </span>
    `;
    this.tooltip.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.currentLink) {
        const safeUrl = MarkdownParser.sanitizeUrl(this.currentLink.url);
        if (safeUrl !== "#") {
          window.open(safeUrl, "_blank");
        }
        this.hide();
      }
    });
    this.editor.container.appendChild(this.tooltip);
  }
  checkCursorPosition() {
    const cursorPos = this.editor.textarea.selectionStart;
    const text = this.editor.textarea.value;
    const linkInfo = this.findLinkAtPosition(text, cursorPos);
    if (linkInfo) {
      if (!this.currentLink || this.currentLink.url !== linkInfo.url || this.currentLink.index !== linkInfo.index) {
        this.show(linkInfo);
      }
    } else {
      this.scheduleHide();
    }
  }
  findLinkAtPosition(text, position) {
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    let linkIndex = 0;
    while ((match = linkRegex.exec(text)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;
      if (position >= start && position <= end) {
        return {
          text: match[1],
          url: this.transformUrl(match[2]),
          index: linkIndex,
          start,
          end
        };
      }
      linkIndex++;
    }
    return null;
  }
  transformUrl(url) {
    const transform = this.editor.options.transformLinkUrl;
    if (typeof transform !== "function")
      return url;
    try {
      const result = transform(url);
      return typeof result === "string" ? result : url;
    } catch (e) {
      console.warn("transformLinkUrl threw:", e);
      return url;
    }
  }
  async show(linkInfo) {
    this.currentLink = linkInfo;
    this.cancelHide();
    const urlSpan = this.tooltip.querySelector(".overtype-link-tooltip-url");
    urlSpan.textContent = linkInfo.url;
    await this.positionTooltip(linkInfo);
    if (this.currentLink === linkInfo) {
      this.tooltip.classList.add("visible");
    }
  }
  async positionTooltip(linkInfo) {
    const anchorElement = this.findAnchorElement(linkInfo.index);
    if (!anchorElement) {
      return;
    }
    const rect = anchorElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }
    try {
      const { x, y } = await computePosition2(
        anchorElement,
        this.tooltip,
        {
          strategy: "fixed",
          placement: "bottom",
          middleware: [
            offset2(8),
            shift2({ padding: 8 }),
            flip2()
          ]
        }
      );
      Object.assign(this.tooltip.style, {
        left: `${x}px`,
        top: `${y}px`,
        position: "fixed"
      });
    } catch (error) {
      console.warn("Floating UI positioning failed:", error);
    }
  }
  findAnchorElement(linkIndex) {
    const preview = this.editor.preview;
    return preview.querySelector(`a[style*="--link-${linkIndex}"]`);
  }
  hide() {
    this.tooltip.classList.remove("visible");
    this.currentLink = null;
    this.isTooltipHovered = false;
  }
  scheduleHide() {
    this.cancelHide();
    this.hideTimeout = setTimeout(() => this.hide(), 300);
  }
  cancelHide() {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }
  destroy() {
    this.cancelHide();
    if (this.visibilityChangeHandler) {
      document.removeEventListener("visibilitychange", this.visibilityChangeHandler);
      this.visibilityChangeHandler = null;
    }
    if (this.tooltip && this.tooltip.parentNode) {
      this.tooltip.parentNode.removeChild(this.tooltip);
    }
    this.tooltip = null;
    this.currentLink = null;
    this.isTooltipHovered = false;
  }
};

// src/ir.js
var FENCE_RE = /^```/;
var HEADING_RE = /^#{1,3}\s/;
var HR_RE = /^(-{3,}|\*{3,}|_{3,})\s*$/;
var LIST_RE = /^(\s*)([-*+]|\d+\.)\s/;
var QUOTE_RE = /^>/;
function isSpecialStart(line) {
  return HEADING_RE.test(line) || HR_RE.test(line) || LIST_RE.test(line) || QUOTE_RE.test(line) || FENCE_RE.test(line);
}
function splitBlocks(text) {
  const lines = text.split("\n");
  const blocks = [];
  const n = lines.length;
  let i = 0;
  while (i < n) {
    const line = lines[i];
    if (FENCE_RE.test(line)) {
      let j = i + 1;
      while (j < n && !FENCE_RE.test(lines[j]))
        j++;
      if (j < n)
        j++;
      blocks.push({ lines: lines.slice(i, j), type: "code" });
      i = j;
    } else if (line.trim() === "") {
      blocks.push({ lines: [line], type: "empty" });
      i++;
    } else if (HEADING_RE.test(line)) {
      blocks.push({ lines: [line], type: "heading" });
      i++;
    } else if (HR_RE.test(line)) {
      blocks.push({ lines: [line], type: "hr" });
      i++;
    } else if (LIST_RE.test(line)) {
      let j = i + 1;
      while (j < n && lines[j].trim() !== "" && (LIST_RE.test(lines[j]) || !isSpecialStart(lines[j])))
        j++;
      blocks.push({ lines: lines.slice(i, j), type: "list" });
      i = j;
    } else if (QUOTE_RE.test(line)) {
      let j = i + 1;
      while (j < n && QUOTE_RE.test(lines[j]))
        j++;
      blocks.push({ lines: lines.slice(i, j), type: "quote" });
      i = j;
    } else {
      let j = i + 1;
      while (j < n && lines[j].trim() !== "" && !isSpecialStart(lines[j]))
        j++;
      blocks.push({ lines: lines.slice(i, j), type: "paragraph" });
      i = j;
    }
  }
  if (blocks.length === 0) {
    blocks.push({ lines: [""], type: "paragraph" });
  }
  let acc = 0;
  for (const b of blocks) {
    b.text = b.lines.join("\n");
    b.start = acc;
    acc += b.text.length + 1;
  }
  return blocks;
}
function buildRenderMap(sourceText, renderedEl) {
  const chars = [];
  const textNodeStarts = /* @__PURE__ */ new Map();
  (function walk(node, inMarker) {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        textNodeStarts.set(child, chars.length);
        for (const ch of child.textContent) {
          chars.push({ ch, visible: !inMarker, src: -1 });
        }
      } else if (child.nodeType === 1) {
        const isMarker = inMarker || child.classList && child.classList.contains("syntax-marker");
        walk(child, isMarker);
      }
    }
  })(renderedEl, false);
  if (sourceText == null)
    return { chars, textNodeStarts };
  const src = sourceText;
  let s = 0;
  let d = 0;
  const len = chars.length;
  while (d < len && s < src.length) {
    const dc = chars[d].ch;
    const sc = src[s];
    const eq = dc === sc || dc === "\xA0" && sc === " " || dc === " " && sc === "\xA0";
    if (eq) {
      chars[d].src = s;
      d++;
      s++;
      continue;
    }
    let k = d + 1;
    let skipped = 0;
    while (k < len && skipped < 3) {
      const kc = chars[k].ch;
      if (kc === sc || kc === "\xA0" && sc === " ")
        break;
      k++;
      skipped++;
    }
    if (skipped < 3 && k < len) {
      d = k;
      chars[d].src = s;
      d++;
      s++;
    } else {
      s++;
    }
  }
  return { chars, textNodeStarts };
}
var IRRenderer = class {
  constructor(editor) {
    this.editor = editor;
    this.value = "";
    this.blocks = [];
    this.activeIndex = -1;
    this.container = null;
    this._activeOverlay = null;
    this._boundMouseDown = this._onMouseDown.bind(this);
    this._boundClick = this._onClick.bind(this);
  }
  get isMode() {
    return this.editor.container && this.editor.container.dataset.mode === "ir" && this.container;
  }
  /** Enter IR mode: build block container, move textarea into the initial active block */
  activate() {
    if (this.isMode)
      return;
    this.value = this.editor.textarea.value;
    this.blocks = splitBlocks(this.value);
    this.activeIndex = -1;
    const wrapper = this.editor.wrapper;
    this.container = document.createElement("div");
    this.container.className = "overtype-ir-container";
    this.container.addEventListener("mousedown", this._boundMouseDown);
    this.container.addEventListener("click", this._boundClick);
    wrapper.appendChild(this.container);
    this.renderDiff();
    this.activateBlock(this.blocks.length - 1, null);
  }
  /** Leave IR mode: commit value and restore textarea/preview to their normal places */
  deactivate() {
    if (!this.container)
      return;
    this.commitActive();
    const wrapper = this.editor.wrapper;
    const editor = this.editor;
    wrapper.insertBefore(editor.textarea, editor.preview);
    editor.textarea.value = this.value;
    this.container.removeEventListener("mousedown", this._boundMouseDown);
    this.container.removeEventListener("click", this._boundClick);
    this.container.remove();
    this.container = null;
    this._activeOverlay = null;
    this.activeIndex = -1;
  }
  /** Commit the active block textarea content back into the full document value */
  commitActive() {
    if (this.activeIndex < 0 || !this.blocks[this.activeIndex])
      return;
    const b = this.blocks[this.activeIndex];
    const t2 = this.editor.textarea.value;
    if (t2 !== b.text) {
      b.text = t2;
      b.lines = t2.split("\n");
      this._recomputeStarts();
      this.value = this._blocksToText();
    }
  }
  getValue() {
    this.commitActive();
    return this.value;
  }
  setValue(text) {
    this.value = text;
    this.blocks = splitBlocks(text);
    this.activeIndex = -1;
    this.renderDiff();
    this.activateBlock(this.blocks.length - 1, null, false);
    this._updatePlaceholder();
  }
  handleInput(event) {
    if (event && (event.isComposing || event.inputType === "insertCompositionText")) {
      this.updateActiveOverlay();
      return;
    }
    const ta = this.editor.textarea;
    const newText = ta.value;
    const oldBlock = this.blocks[this.activeIndex];
    if (oldBlock && oldBlock.type !== "empty") {
      const newLines = newText.split("\n");
      let structural = false;
      for (let k = 1; k < newLines.length; k++) {
        const l = newLines[k];
        if (l.trim() === "" || isSpecialStart(l)) {
          structural = true;
          break;
        }
      }
      const firstSpecial = isSpecialStart(newLines[0] || "");
      const oldFirstSpecial = isSpecialStart(oldBlock.lines[0] || "");
      if (structural || firstSpecial !== oldFirstSpecial) {
      } else {
        oldBlock.text = newText;
        oldBlock.lines = newLines;
        this._recomputeStarts();
        this.value = this._blocksToText();
        this.renderDiff();
        this._updatePlaceholder();
        return;
      }
    }
    const oldIdx = this.activeIndex;
    const oldStart = oldIdx >= 0 ? this.blocks[oldIdx].start : 0;
    const sel = ta.selectionStart;
    this.commitActive();
    this.blocks = splitBlocks(this.value);
    const caretFull = oldStart + sel;
    let idx = this.blocks.length - 1;
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      if (caretFull >= b.start && caretFull <= b.start + b.text.length) {
        idx = i;
        break;
      }
    }
    if (idx === oldIdx && this.blocks[idx] && this.blocks[idx].text === this.editor.textarea.value) {
      this.updateActiveOverlay();
      this.renderDiff();
      return;
    }
    this.activeIndex = -1;
    this.renderDiff();
    this.activateBlock(idx, caretFull - (this.blocks[idx] ? this.blocks[idx].start : 0));
    this._updatePlaceholder();
  }
  /**
   * IR-specific key handling: block-level Enter, Backspace merge, cross-block arrows.
   * Returns true when the event is fully handled.
   */
  handleKeydown(event) {
    var _a;
    const ta = this.editor.textarea;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const collapsed = s === e;
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    const inList = LIST_RE.test(value.slice(lineStart));
    if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      const activeType = (_a = this.blocks[this.activeIndex]) == null ? void 0 : _a.type;
      if (inList || activeType === "code")
        return false;
      event.preventDefault();
      this.editor.insertAtCursor("\n\n");
      return true;
    }
    if (!collapsed)
      return false;
    if (event.key === "Backspace" && s === 0 && this.activeIndex > 0) {
      event.preventDefault();
      this.mergeWithPrevious();
      return true;
    }
    if (event.key === "ArrowLeft" && s === 0 && this.activeIndex > 0) {
      event.preventDefault();
      const prev = this.activeIndex - 1;
      this.activateBlock(prev, this.blocks[prev].text.length);
      return true;
    }
    if (event.key === "ArrowRight" && s === value.length && this.activeIndex < this.blocks.length - 1) {
      event.preventDefault();
      this.activateBlock(this.activeIndex + 1, 0);
      return true;
    }
    if (event.key === "ArrowUp" && !value.slice(0, s).includes("\n") && this.activeIndex > 0) {
      event.preventDefault();
      const prev = this.activeIndex - 1;
      this.activateBlock(prev, this.blocks[prev].text.length);
      return true;
    }
    if (event.key === "ArrowDown" && !value.slice(s).includes("\n") && this.activeIndex < this.blocks.length - 1) {
      event.preventDefault();
      this.activateBlock(this.activeIndex + 1, 0);
      return true;
    }
    return false;
  }
  /** Merge the active block into the previous one (removes the block boundary newline) */
  mergeWithPrevious() {
    this.commitActive();
    const a = this.activeIndex;
    if (a <= 0)
      return;
    const prev = this.blocks[a - 1];
    const cur = this.blocks[a];
    const caret = prev.text.length;
    const merged = { text: prev.text + cur.text, type: prev.type, start: prev.start };
    merged.lines = merged.text.split("\n");
    this.blocks.splice(a - 1, 2, merged);
    this.value = this._blocksToText();
    this.activeIndex = -1;
    this.renderDiff();
    this.activateBlock(a - 1, caret);
    this._updatePlaceholder();
  }
  /**
   * Activate a block: render its source in the textarea overlay and focus it.
   * @param {number} idx - block index
   * @param {number|null} domOffset - click offset in the rendered DOM (visible text), or null for end-of-block
   * @param {boolean} [focus=true] - focus the textarea and scroll it into view; false for programmatic calls
   */
  activateBlock(idx, domOffset, focus = true) {
    if (idx < 0 || idx >= this.blocks.length)
      return;
    this.commitActive();
    const b = this.blocks[idx];
    let srcCaret = null;
    if (domOffset != null && this.container && this.container.children[idx]) {
      srcCaret = this._mapDomOffsetToSource(b.text, this.container.children[idx], domOffset);
    }
    if (srcCaret == null || srcCaret < 0)
      srcCaret = b.text.length;
    srcCaret = Math.min(srcCaret, b.text.length);
    const ta = this.editor.textarea;
    ta.value = b.text;
    this.activeIndex = idx;
    this.renderDiff();
    if (focus) {
      ta.focus();
    }
    ta.setSelectionRange(srcCaret, srcCaret);
    if (focus) {
      const el = this.container.children[idx];
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ block: "nearest" });
      }
    }
    this._updatePlaceholder();
  }
  /** Refresh the overlay preview of the active block (source-style rendering) */
  updateActiveOverlay() {
    if (!this._activeOverlay || this.activeIndex < 0)
      return;
    const html = MarkdownParser.parse(
      this.editor.textarea.value,
      -1,
      false,
      this.editor.options.codeHighlighter,
      false
    );
    this._activeOverlay.innerHTML = html;
    this._applyCodeBackgrounds(this._activeOverlay);
  }
  /** Full diff render of all blocks against the current DOM */
  renderDiff() {
    if (!this.container)
      return;
    const children = Array.from(this.container.children);
    while (children.length > this.blocks.length) {
      const c = children.pop();
      if (c && c !== this.editor.textarea)
        c.remove();
    }
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      const isActive = i === this.activeIndex;
      let el = children[i];
      const elActive = el && el.classList.contains("active");
      if (isActive && elActive) {
        el.dataset.blockIndex = String(i);
        el.dataset.hash = b.text;
        this.updateActiveOverlay();
        continue;
      }
      const unchanged = el && el.dataset.hash === b.text && elActive === isActive;
      if (unchanged) {
        el.dataset.blockIndex = String(i);
        continue;
      }
      const newEl = this._createBlockEl(b, isActive, i);
      if (el) {
        this.container.replaceChild(newEl, el);
      } else {
        this.container.appendChild(newEl);
      }
      children[i] = newEl;
    }
    this._updatePlaceholder();
  }
  /** Render entry point used by editor.updatePreview() in IR mode */
  render() {
    if (!this.container)
      return;
    if (document.activeElement === this.editor.textarea && this.activeIndex >= 0) {
      const b = this.blocks[this.activeIndex];
      if (b && b.text === this.editor.textarea.value) {
        this.updateActiveOverlay();
        this.renderDiff();
        return;
      }
    }
    this.renderDiff();
  }
  // ===== internals =====
  _createBlockEl(block, isActive, index) {
    const el = document.createElement("div");
    el.className = "overtype-ir-block" + (isActive ? " active" : "");
    el.dataset.blockIndex = String(index);
    el.dataset.hash = block.text;
    el.dataset.type = block.type;
    if (isActive) {
      const preview = document.createElement("div");
      preview.className = "overtype-ir-block-preview overtype-preview";
      preview.setAttribute("aria-hidden", "true");
      el.appendChild(preview);
      el.appendChild(this.editor.textarea);
      this._activeOverlay = preview;
      this.updateActiveOverlay();
    } else {
      el.innerHTML = MarkdownParser.parse(
        block.text,
        -1,
        false,
        this.editor.options.codeHighlighter,
        true
      );
      this._applyCodeBackgrounds(el);
    }
    return el;
  }
  _applyCodeBackgrounds(scope) {
    const fences = scope.querySelectorAll(".code-fence");
    for (let i = 0; i < fences.length - 1; i += 2) {
      const openFence = fences[i];
      const closeFence = fences[i + 1];
      const openParent = openFence.parentElement;
      const closeParent = closeFence.parentElement;
      if (!openParent || !closeParent)
        continue;
      openFence.style.display = "block";
      closeFence.style.display = "block";
      openParent.classList.add("code-block-line");
      closeParent.classList.add("code-block-line");
    }
  }
  _onMouseDown(event) {
    if (event.button !== 0)
      return;
    const blockEl = event.target.closest(".overtype-ir-block");
    if (!blockEl || blockEl.classList.contains("active"))
      return;
    if ((event.metaKey || event.ctrlKey) && event.target.closest("a"))
      return;
    event.preventDefault();
    const idx = Number(blockEl.dataset.blockIndex);
    if (Number.isNaN(idx))
      return;
    const domOffset = this._getCaretDomOffset(event, blockEl);
    this.activateBlock(idx, domOffset);
  }
  /** Handle plain clicks on links inside rendered blocks.
   *  Mouse clicks are normally preceded by mousedown (which activates the
   *  block first), but keyboard-triggered clicks (Enter on a focused link)
   *  arrive without mousedown - so the guard below is NOT unreachable. */
  _onClick(event) {
    const blockEl = event.target.closest(".overtype-ir-block");
    if (!blockEl || blockEl.classList.contains("active"))
      return;
    if ((event.metaKey || event.ctrlKey) && event.target.closest("a"))
      return;
    if (event.target.closest("a"))
      event.preventDefault();
  }
  /** Get the clicked caret offset within the block's DOM char stream */
  _getCaretDomOffset(event, blockEl) {
    let node = null;
    let nodeOffset = 0;
    if (typeof document.caretRangeFromPoint === "function") {
      const range = document.caretRangeFromPoint(event.clientX, event.clientY);
      if (range) {
        node = range.startContainer;
        nodeOffset = range.startOffset;
      }
    } else if (typeof document.caretPositionFromPoint === "function") {
      const pos = document.caretPositionFromPoint(event.clientX, event.clientY);
      if (pos) {
        node = pos.offsetNode;
        nodeOffset = pos.offset;
      }
    }
    if (!node)
      return null;
    const { textNodeStarts } = buildRenderMap(null, blockEl);
    if (node.nodeType === 3) {
      const start = textNodeStarts.get(node);
      return start == null ? null : start + nodeOffset;
    }
    const starts = Array.from(textNodeStarts.values());
    return starts.length ? Math.min(...starts) : null;
  }
  /** Map a DOM char offset to a source caret offset using the render map */
  _mapDomOffsetToSource(sourceText, blockEl, domOffset) {
    const { chars } = buildRenderMap(sourceText, blockEl);
    let g = Math.min(domOffset, chars.length);
    while (g >= 0) {
      const c = chars[g];
      if (c && c.visible && c.src >= 0) {
        return c.src + 1;
      }
      if (c && !c.visible && g > 0) {
        let k = g;
        while (k >= 0 && !chars[k].visible)
          k--;
        if (k >= 0 && chars[k].src >= 0)
          return chars[k].src + 1;
        return 0;
      }
      g--;
    }
    return 0;
  }
  _recomputeStarts() {
    let acc = 0;
    for (const b of this.blocks) {
      b.start = acc;
      acc += b.text.length + 1;
    }
  }
  _blocksToText() {
    return this.blocks.map((b) => b.text).join("\n");
  }
  _updatePlaceholder() {
    const p = this.editor.placeholderEl;
    if (p)
      p.style.display = this.getValue() ? "none" : "";
  }
};

// src/p0-outline.js
function p0Outline(containerEl, label = "\u5927\u7EB2") {
  const host = containerEl;
  host.innerHTML = "";
  const heading = document.createElement("div");
  heading.className = "ow-outline-title";
  heading.textContent = label;
  host.appendChild(heading);
  const list = document.createElement("ul");
  list.className = "ow-outline-list";
  host.appendChild(list);
  const api = {
    el: host,
    /** Rebuild the outline from the core instance's preview DOM */
    update(inst) {
      list.innerHTML = "";
      if (!inst || !inst.preview) {
        const empty = document.createElement("li");
        empty.className = "ow-outline-empty";
        empty.textContent = "\u6682\u65E0\u6807\u9898";
        list.appendChild(empty);
        return;
      }
      const seen = /* @__PURE__ */ new Map();
      const headings = inst.preview.querySelectorAll("h1, h2, h3, h4, h5, h6");
      headings.forEach((h, idx) => {
        const text = (h.textContent || "").trim() || `heading-${idx + 1}`;
        let id = slugify(text);
        const count = seen.get(id) || 0;
        seen.set(id, count + 1);
        if (count > 0)
          id = `${id}-${count}`;
        h.id = id;
        h.classList.add("ow-anchor");
        const li = document.createElement("li");
        const level = parseInt(h.tagName[1], 10);
        li.className = `ow-outline-item ow-outline-h${level}`;
        const a = document.createElement("a");
        a.href = `#${id}`;
        a.textContent = text;
        a.addEventListener("click", (e) => {
          e.preventDefault();
          scrollToHeading(inst, h, id);
        });
        li.appendChild(a);
        list.appendChild(li);
      });
    },
    destroy() {
      host.innerHTML = "";
    }
  };
  return api;
}
function slugify(text) {
  return text.toLowerCase().replace(/[^\w\u4e00-\u9fa5-]+/g, "-").replace(/^-+|-+$/g, "").replace(/-+/g, "-");
}
function scrollToHeading(inst, headingEl, id) {
  if (inst.preview && inst.preview.contains(headingEl)) {
    const preview = inst.preview;
    preview.scrollTo({ top: headingEl.offsetTop - preview.offsetTop - 8, behavior: "smooth" });
    return;
  }
  if (inst.textarea) {
    const text = inst.getValue() || "";
    const lines = text.split("\n");
    let offset3 = 0;
    for (let i = 0; i < lines.length; i++) {
      const nextHasHeading = new RegExp(`^#{1,6}\\s+${escapeRegExp(headingEl.textContent)}`).test(lines[i]);
      if (nextHasHeading) {
        inst.textarea.focus();
        inst.textarea.setSelectionRange(offset3, offset3);
        return;
      }
      offset3 += lines[i].length + 1;
    }
  }
}
function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/p0-statusbar.js
function p0StatusBar(containerEl) {
  const host = containerEl;
  host.innerHTML = "";
  const left = document.createElement("span");
  left.className = "ow-status-item";
  const right = document.createElement("span");
  right.className = "ow-status-item ow-status-mode";
  host.appendChild(left);
  host.appendChild(right);
  const modeLabel = {
    normal: "\u666E\u901A\u7F16\u8F91",
    ir: "\u5373\u65F6\u6E32\u67D3",
    plain: "\u7EAF\u6587\u672C",
    preview: "\u9884\u89C8"
  };
  return {
    el: host,
    update(inst) {
      if (!inst)
        return;
      const value = inst.getValue() || "";
      const chars = value.length;
      const words = value.trim() ? value.trim().split(/\s+/).length : 0;
      const lines = value ? value.split("\n").length : 1;
      const mode = inst.container ? inst.container.dataset.mode || "normal" : "normal";
      left.textContent = `${words} \u8BCD \xB7 ${chars} \u5B57 \xB7 ${lines} \u884C`;
      right.textContent = modeLabel[mode] || mode;
    }
  };
}

// src/p0-cache.js
function p0Cache({ getValue, setValue }, { key, interval = 500, restore = true } = {}) {
  const storageKey = key || `overtype:draft:${defaultKey()}`;
  let timer = null;
  function save() {
    try {
      localStorage.setItem(storageKey, getValue());
    } catch (e) {
    }
  }
  function debouncedSave() {
    if (timer)
      clearTimeout(timer);
    timer = setTimeout(save, interval);
  }
  function restore() {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved != null) {
        setValue(saved);
        return saved;
      }
    } catch (e) {
    }
    return null;
  }
  function clear() {
    try {
      localStorage.removeItem(storageKey);
    } catch (e) {
    }
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }
  if (restore)
    restore();
  return { onEdit: debouncedSave, restore, clear, save, key: storageKey };
}
var _counter = 0;
function defaultKey() {
  return `inst-${++_counter}`;
}

// src/p0-copy.js
function p0Copy() {
  return {
    /** Call after each render to add/refresh copy buttons on code blocks */
    attach(preview) {
      scan(preview);
    }
  };
}
function scan(preview) {
  if (!preview)
    return;
  preview.querySelectorAll("pre > code").forEach((code) => {
    const pre = code.parentElement;
    if (pre.querySelector(".ow-copy-btn"))
      return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ow-copy-btn";
    btn.textContent = "\u590D\u5236";
    btn.setAttribute("aria-label", "\u590D\u5236\u4EE3\u7801\u5757");
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      copyText(code.innerText || "");
      const old = btn.textContent;
      btn.textContent = "\u5DF2\u590D\u5236";
      setTimeout(() => {
        btn.textContent = old;
      }, 1500);
    });
    pre.classList.add("ow-copyable");
    pre.appendChild(btn);
  });
}
async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  } catch (e) {
  }
}

// src/overtype-window.js
var OvertypeWindow = class {
  /**
   * @param {string|Element} el - target element (single)
   * @param {Object} options - OverType options; `medium` is consumed here
   */
  constructor(el, options = {}) {
    this.element = typeof el === "string" ? document.querySelector(el) : el;
    if (!this.element)
      throw new Error("OvertypeWindow: target element not found");
    this.options = { ...options };
    this.core = null;
    this.outline = null;
    this.statusbar = null;
    this.cache = null;
    this.copy = null;
    const { medium, title, outlineLabel, autosave, codeCopy, ...coreOptions } = this.options;
    this.titleOption = title;
    this.outlineLabel = outlineLabel || "\u5927\u7EB2";
    this.autosave = autosave || false;
    this.codeCopy = codeCopy || false;
    this._buildDOM();
    if (this.codeCopy)
      this.copy = p0Copy();
    if (this.autosave) {
      this.cache = p0Cache(
        { getValue: () => this.core.getValue(), setValue: (v) => this.core.setValue(v) },
        { key: autosave == null ? void 0 : autosave.key, interval: autosave == null ? void 0 : autosave.interval, restore: autosave == null ? void 0 : autosave.restore }
      );
    }
    const userOnChange = coreOptions.onChange || null;
    const userOnRender = coreOptions.onRender || null;
    coreOptions.onChange = (val, inst) => {
      if (this.outline)
        this.outline.update(inst);
      if (this.statusbar)
        this.statusbar.update(inst);
      if (this.cache)
        this.cache.onEdit();
      if (userOnChange)
        userOnChange(val, inst);
    };
    coreOptions.onRender = (previewEl, mode, inst) => {
      if (this.outline)
        this.outline.update(inst);
      if (this.copy)
        this.copy.attach(inst.preview);
      if (userOnRender)
        userOnRender(previewEl, mode, inst);
    };
    this.core = new OverType(this.editorEl, coreOptions)[0];
    this._wireResizer();
    requestAnimationFrame(() => {
      this._refreshOutline();
      if (this.statusbar)
        this.statusbar.update(this.core);
    });
  }
  /** Public: flush the autosave draft immediately */
  saveDraft() {
    if (this.cache)
      this.cache.save();
    return this;
  }
  /** Public: clear the autosave draft */
  clearDraft() {
    if (this.cache)
      this.cache.clear();
    return this;
  }
  /** Build the shell DOM (titlebar + body(outline|editor|resizer) + statusbar) */
  _buildDOM() {
    var _a;
    this.element.innerHTML = "";
    this.windowEl = document.createElement("div");
    this.windowEl.className = "overtype-window";
    this.titlebarEl = document.createElement("div");
    this.titlebarEl.className = "ow-titlebar";
    this.titleInput = document.createElement("input");
    this.titleInput.className = "ow-title-input";
    this.titleInput.type = "text";
    this.titleInput.placeholder = "\u672A\u547D\u540D\u6587\u6863";
    this.titleInput.value = (_a = this.titleOption) != null ? _a : "";
    this.titleInput.setAttribute("aria-label", "\u6587\u6863\u6807\u9898");
    this.collapseBtn = document.createElement("button");
    this.collapseBtn.className = "ow-collapse";
    this.collapseBtn.type = "button";
    this.collapseBtn.setAttribute("aria-label", "\u6536\u8D77/\u5C55\u5F00\u5927\u7EB2");
    this.titlebarEl.appendChild(this.titleInput);
    this.titlebarEl.appendChild(this.collapseBtn);
    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "ow-body";
    this.outlineEl = document.createElement("aside");
    this.outlineEl.className = "ow-outline";
    this.editorEl = document.createElement("div");
    this.editorEl.className = "ow-editor";
    this.resizerEl = document.createElement("div");
    this.resizerEl.className = "ow-resizer";
    this.resizerEl.setAttribute("role", "separator");
    this.resizerEl.setAttribute("aria-orientation", "vertical");
    this.bodyEl.appendChild(this.outlineEl);
    this.bodyEl.appendChild(this.resizerEl);
    this.bodyEl.appendChild(this.editorEl);
    this.statusbarEl = document.createElement("div");
    this.statusbarEl.className = "ow-statusbar";
    this.windowEl.appendChild(this.titlebarEl);
    this.windowEl.appendChild(this.bodyEl);
    this.windowEl.appendChild(this.statusbarEl);
    this.element.appendChild(this.windowEl);
    this.outline = p0Outline(this.outlineEl, this.outlineLabel);
    this.statusbar = p0StatusBar(this.statusbarEl);
  }
  /** Wire the draggable outline/editor gutter */
  _wireResizer() {
    let dragging = false;
    this._onResizerDown = (e) => {
      dragging = true;
      this.outlineEl.style.flexBasis = this.outlineEl.getBoundingClientRect().width + "px";
      document.body.classList.add("ow-resizing");
      e.preventDefault();
    };
    this._onResizerMove = (e) => {
      if (!dragging)
        return;
      const rect = this.bodyEl.getBoundingClientRect();
      let w = e.clientX - rect.left;
      const min2 = 140, max2 = rect.width - 200;
      w = Math.max(min2, Math.min(max2, w));
      this.outlineEl.style.flexBasis = w + "px";
      this.outlineEl.style.flexGrow = "0";
    };
    this._onResizerUp = () => {
      if (!dragging)
        return;
      dragging = false;
      document.body.classList.remove("ow-resizing");
    };
    this.resizerEl.addEventListener("mousedown", this._onResizerDown);
    document.addEventListener("mousemove", this._onResizerMove);
    document.addEventListener("mouseup", this._onResizerUp);
    this.collapseBtn.addEventListener("click", () => {
      this.bodyEl.classList.toggle("ow-outline-collapsed");
    });
  }
  /** Refresh the outline from the current core preview DOM */
  _refreshOutline() {
    if (!this.outline || !this.core)
      return;
    this.outline.update(this.core);
  }
  // ===== Forwarded public API =====
  getValue() {
    return this.core.getValue();
  }
  setValue(v) {
    this.core.setValue(v);
    this._refreshOutline();
    return this;
  }
  get() {
    return this.getValue();
  }
  set(v) {
    return this.setValue(v);
  }
  showNormalEditMode() {
    this.core.showNormalEditMode();
    return this;
  }
  showPlainTextarea() {
    this.core.showPlainTextarea();
    return this;
  }
  showPreviewMode() {
    this.core.showPreviewMode();
    return this;
  }
  showInstantRenderMode() {
    this.core.showInstantRenderMode();
    return this;
  }
  reinit(options = {}) {
    this.core.reinit(options);
    return this;
  }
  on(cb) {
    this.core.onChange = (v, inst) => cb(v, inst);
    return this;
  }
  // P2: forward render/export APIs to the core
  getRenderedHTML(options) {
    return this.core.getRenderedHTML(options);
  }
  getCleanHTML() {
    return this.core.getCleanHTML();
  }
  exportHTML(title) {
    return this.core.exportHTML(title != null ? title : this.titleInput.value);
  }
  exportWeChat() {
    return this.core.exportWeChat();
  }
  exportZhihu() {
    return this.core.exportZhihu();
  }
  exportPDF(title) {
    return this.core.exportPDF(title != null ? title : this.titleInput.value);
  }
  get container() {
    return this.core.container;
  }
  get textarea() {
    return this.core.textarea;
  }
  /** Textarea focus is handled by core; expose for convenience */
  focus() {
    this.core.textarea.focus();
    return this;
  }
  destroy() {
    this.resizerEl.removeEventListener("mousedown", this._onResizerDown);
    document.removeEventListener("mousemove", this._onResizerMove);
    document.removeEventListener("mouseup", this._onResizerUp);
    if (this.cache)
      this.cache.clear();
    if (this.core)
      this.core.destroy();
    if (this.windowEl && this.windowEl.parentNode) {
      this.windowEl.parentNode.removeChild(this.windowEl);
    }
    this.element.textContent = "";
  }
};

// src/deps.js
var CDN = {
  katexCss: "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css",
  katexJs: "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js",
  mermaidJs: "https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js",
  vizJs: "https://cdn.jsdelivr.net/npm/viz.js@2.1.2/viz.js"
};
var cache = /* @__PURE__ */ new Map();
function loadScript(src) {
  if (cache.has(src))
    return cache.get(src);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      cache.delete(src);
      reject(new Error("\u4F9D\u8D56\u52A0\u8F7D\u5931\u8D25: " + src));
    };
    document.head.appendChild(s);
  });
  cache.set(src, p);
  return p;
}
function loadStyleFile(href) {
  if (cache.has(href))
    return cache.get(href);
  const p = new Promise((resolve, reject) => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.onload = () => resolve();
    l.onerror = () => {
      cache.delete(href);
      reject(new Error("\u6837\u5F0F\u52A0\u8F7D\u5931\u8D25: " + href));
    };
    document.head.appendChild(l);
  });
  cache.set(href, p);
  return p;
}
var loaded = {
  katex: null,
  mermaid: null,
  viz: null
};
function loadKaTeX() {
  loaded.katex = loaded.katex || Promise.all([
    loadStyleFile(CDN.katexCss),
    loadScript(CDN.katexJs)
  ]);
  return loaded.katex;
}
function loadMermaid() {
  loaded.mermaid = loaded.mermaid || loadScript(CDN.mermaidJs);
  return loaded.mermaid;
}
function loadViz() {
  loaded.viz = loaded.viz || loadScript(CDN.vizJs);
  return loaded.viz;
}

// src/p1-render.js
var BLOCK_MATH_RE = /\$\$([\s\S]+?)\$\$/g;
var INLINE_MATH_RE = /\$([^$\n]+?)\$/g;
function renderProfessional(preview, config = {}) {
  if (!preview)
    return;
  const cfg = config.professional || config;
  if (cfg.math)
    renderMath(preview);
  if (cfg.mermaid)
    renderMermaid(preview, cfg);
  if (cfg.graphviz)
    renderGraphviz(preview);
}
function renderBlockMath(el, katex) {
  const t2 = el.textContent || "";
  const m = BLOCK_MATH_RE.exec(t2);
  const ok = m && BLOCK_MATH_RE.lastIndex >= t2.trimEnd().length;
  BLOCK_MATH_RE.lastIndex = 0;
  if (!ok)
    return;
  try {
    el.innerHTML = katex.renderToString(m[1], { displayMode: true, throwOnError: false });
  } catch (e) {
  }
}
function replaceInlineInText(textNode, katex) {
  const parts = [];
  let last = 0;
  const text = textNode.nodeValue;
  INLINE_MATH_RE.lastIndex = 0;
  let m;
  while ((m = INLINE_MATH_RE.exec(text)) !== null) {
    const expr = m[1].trim();
    if (!/[A-Za-z\\{}_^]/.test(expr))
      continue;
    if (m.index > last)
      parts.push(document.createTextNode(text.slice(last, m.index)));
    try {
      const span = document.createElement("span");
      span.innerHTML = katex.renderToString(expr, { throwOnError: false });
      parts.push(span);
    } catch (e) {
      parts.push(document.createTextNode(m[0]));
    }
    last = m.index + m[0].length;
  }
  if (parts.length === 0)
    return;
  if (last < text.length)
    parts.push(document.createTextNode(text.slice(last)));
  const frag = document.createDocumentFragment();
  parts.forEach((p) => frag.appendChild(p));
  textNode.parentNode.replaceChild(frag, textNode);
}
async function renderMath(preview) {
  try {
    await loadKaTeX();
  } catch (e) {
    return;
  }
  const katex = globalThis.katex;
  if (!katex)
    return;
  preview.querySelectorAll("p, div, li, h1, h2, h3, h4, h5, h6").forEach((el) => {
    if (el.querySelector("code, .code-block, pre"))
      return;
    if (el.childElementCount > 0)
      walkInlineText(el, katex);
    else
      renderBlockMath(el, katex);
  });
  walkInlineText(preview, katex);
}
function walkInlineText(root, katex) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
  const nodes = [];
  while (walker.nextNode())
    nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    if (!node.nodeValue || node.nodeValue.indexOf("$") === -1)
      return;
    if (node.parentElement && node.parentElement.closest("code, pre"))
      return;
    replaceInlineInText(node, katex);
  });
}
async function renderMermaid(preview, cfg) {
  const blocks = Array.from(preview.querySelectorAll("pre.code-block code.language-mermaid"));
  if (blocks.length === 0)
    return;
  try {
    await loadMermaid();
  } catch (e) {
    return;
  }
  const mermaid = globalThis.mermaid;
  if (!mermaid)
    return;
  let init = false;
  for (const code of blocks) {
    const pre = code.closest("pre.code-block");
    if (!pre)
      continue;
    const source = (code.textContent || "").trim();
    if (!source)
      continue;
    const holder = document.createElement("div");
    holder.className = "ow-mermaid";
    holder.textContent = source;
    pre.replaceWith(holder);
    if (!init) {
      mermaid.initialize({ startOnLoad: false, theme: cfg.mermaidTheme || "default" });
      init = true;
    }
    try {
      const { svg } = await mermaid.render("mmd" + Math.random().toString(36).slice(2, 8), source);
      holder.innerHTML = svg;
    } catch (e) {
    }
  }
}
async function renderGraphviz(preview) {
  const blocks = Array.from(preview.querySelectorAll(
    "pre.code-block code.language-graphviz, pre.code-block code.language-dot"
  ));
  if (blocks.length === 0)
    return;
  try {
    await loadViz();
  } catch (e) {
    return;
  }
  const Viz = globalThis.Viz || globalThis.viz;
  if (!Viz)
    return;
  for (const code of blocks) {
    const pre = code.closest("pre.code-block");
    if (!pre)
      continue;
    const source = (code.textContent || "").trim();
    if (!source)
      continue;
    const holder = document.createElement("div");
    holder.className = "ow-graphviz";
    pre.replaceWith(holder);
    try {
      const result = Viz(source);
      holder.innerHTML = typeof result === "string" ? result : (result == null ? void 0 : result.svg) || "";
    } catch (e) {
    }
  }
}

// src/p2-copy.js
function nodeToMd(node, out) {
  if (node.nodeType === Node.TEXT_NODE) {
    const t2 = node.textContent;
    out.push(t2.replace(/\s+/g, " "));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE)
    return;
  const el = node;
  const tag = el.tagName.toLowerCase();
  if (el.hidden)
    return;
  switch (tag) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const level = Number(tag[1]);
      out.push(`

${"#".repeat(level)} `);
      nodeToMdChildren(el, out);
      out.push("\n");
      break;
    }
    case "p":
      out.push("\n\n");
      nodeToMdChildren(el, out);
      out.push("\n");
      break;
    case "br":
      out.push("  \n");
      break;
    case "hr":
      out.push("\n\n---\n");
      break;
    case "strong":
    case "b":
      out.push("**");
      nodeToMdChildren(el, out);
      out.push("**");
      break;
    case "em":
    case "i":
      out.push("*");
      nodeToMdChildren(el, out);
      out.push("*");
      break;
    case "s":
    case "del":
    case "strike":
      out.push("~~");
      nodeToMdChildren(el, out);
      out.push("~~");
      break;
    case "code":
      out.push("`");
      nodeToMdChildren(el, out);
      out.push("`");
      break;
    case "a": {
      const href = el.getAttribute("href") || "";
      out.push("[");
      nodeToMdChildren(el, out);
      out.push(`](${href})`);
      break;
    }
    case "img": {
      const src = el.getAttribute("src") || "";
      const alt = el.getAttribute("alt") || "";
      out.push(`![${alt}](${src})`);
      break;
    }
    case "ul":
    case "ol": {
      out.push("\n\n");
      listToMd(el, tag === "ol", out);
      out.push("\n");
      break;
    }
    case "blockquote": {
      out.push("\n\n");
      const inner = [];
      nodeToMdChildren(el, inner);
      const text = inner.join("").replace(/^\s+|\s+$/g, "");
      text.split("\n").forEach((line) => out.push(`> ${line}
`));
      break;
    }
    case "pre": {
      out.push("\n\n```\n");
      out.push(el.textContent.replace(/^\n+|\n+$/g, ""));
      out.push("\n```\n");
      break;
    }
    case "table": {
      out.push("\n\n");
      tableToMd(el, out);
      out.push("\n");
      break;
    }
    default:
      nodeToMdChildren(el, out);
  }
}
function nodeToMdChildren(el, out) {
  for (const child of el.childNodes)
    nodeToMd(child, out);
}
function listToMd(listEl, ordered, out, depth = 0) {
  const items = Array.from(listEl.children).filter((c) => c.tagName === "LI");
  items.forEach((li, i) => {
    const indent = "  ".repeat(depth);
    const prefix = ordered ? `${i + 1}. ` : "- ";
    out.push(`${indent}${prefix}`);
    const inline2 = [];
    let nested = null;
    for (const child of li.childNodes) {
      if (child.nodeType === 1 && /^(UL|OL)$/.test(child.tagName)) {
        nested = child;
        continue;
      }
      nodeToMd(child, inline2);
    }
    out.push(inline2.join("").trim());
    out.push("\n");
    if (nested)
      listToMd(nested, nested.tagName === "OL", out, depth + 1);
  });
}
function tableToMd(tableEl, out) {
  const rows = Array.from(tableEl.querySelectorAll("tr"));
  if (!rows.length)
    return;
  const parseRow = (tr) => Array.from(tr.children).map((c) => c.textContent.replace(/\s+/g, " ").trim());
  const header = parseRow(rows[0]);
  out.push("| " + header.join(" | ") + " |\n");
  out.push("| " + header.map(() => "---").join(" | ") + " |\n");
  rows.slice(1).forEach((tr) => {
    const cells = parseRow(tr);
    out.push("| " + cells.join(" | ") + " |\n");
  });
}
function htmlToMarkdown(html) {
  if (typeof document === "undefined")
    return html;
  if (!html || typeof html !== "string")
    return "";
  const container = document.createElement("div");
  container.innerHTML = html;
  const out = [];
  for (const child of Array.from(container.childNodes))
    nodeToMd(child, out);
  return out.join("").replace(/\n{4,}/g, "\n\n\n").trim();
}
function installPasteHTML(editor) {
  const ta = editor.textarea;
  if (!ta)
    return () => {
    };
  const handler = (e) => {
    const data = e.clipboardData;
    if (!data)
      return;
    const html = data.getData("text/html");
    if (!html)
      return;
    e.preventDefault();
    const md2 = htmlToMarkdown(html);
    editor.insertAtCursor(md2);
  };
  ta.addEventListener("paste", handler);
  return () => ta.removeEventListener("paste", handler);
}

// src/p2-export.js
var EXPORT_CSS = `
  body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.7;color:#1f2328;max-width:760px;margin:24px auto;padding:0 16px;}
  h1,h2,h3{line-height:1.3;margin:1.2em 0 .5em;}
  pre{background:#f6f8fa;padding:12px 14px;border-radius:6px;overflow:auto;font-size:14px;}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#f6f8fa;border-radius:4px;padding:1px 5px;}
  pre code{background:none;padding:0;}
  blockquote{border-left:3px solid #d0d7de;margin:0;padding-left:14px;color:#57606a;}
  table{border-collapse:collapse;width:100%;}
  th,td{border:1px solid #d0d7de;padding:6px 10px;}
  img{max-width:100%;}
  hr{border:0;border-top:1px solid #d0d7de;margin:2em 0;}
`.trim();
function standaloneHTML(title, body) {
  return [
    "<!DOCTYPE html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8">',
    `<meta name="viewport" content="width=device-width, initial-scale=1.0">`,
    `<title>${escapeHtml(title)}</title>`,
    `<style>${EXPORT_CSS}</style>`,
    "</head>",
    "<body>",
    body,
    "</body>",
    "</html>"
  ].join("\n");
}
function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function cleanBody(editor) {
  return editor.getRenderedHTML({ cleanHTML: true }) || "";
}
function exportHTML(editor, title) {
  const t2 = title || "\u5BFC\u51FA\u6587\u6863";
  return standaloneHTML(t2, cleanBody(editor));
}
function exportWeChat(editor) {
  const body = cleanBody(editor);
  const container = document.createElement("div");
  container.innerHTML = body;
  container.querySelectorAll("*").forEach((el) => {
    const s = el.style;
    if (el.tagName === "PRE") {
      s.backgroundColor = "#f6f8fa";
      s.padding = "12px 14px";
      s.borderRadius = "6px";
      s.fontSize = "14px";
      s.lineHeight = "1.5";
      s.fontFamily = "Menlo, Consolas, monospace";
    } else if (el.tagName === "CODE") {
      s.backgroundColor = "#f6f8fa";
      s.borderRadius = "4px";
      s.padding = "1px 5px";
      s.fontFamily = "Menlo, Consolas, monospace";
    } else if (el.tagName === "BLOCKQUOTE") {
      s.borderLeft = "3px solid #d0d7de";
      s.padding = "0 0 0 12px";
      s.margin = "0";
      s.color = "#57606a";
    } else if (/^H[1-6]$/.test(el.tagName)) {
      s.fontWeight = "bold";
      s.margin = "1em 0 .5em";
      s.lineHeight = "1.4";
    }
  });
  return container.innerHTML;
}
function exportZhihu(editor) {
  const body = cleanBody(editor).replace(/<del(?:\s|>)/g, "<del$1");
  const container = document.createElement("div");
  container.innerHTML = body;
  container.querySelectorAll("pre").forEach((el) => {
    el.style.backgroundColor = "transparent";
    el.style.padding = "0";
    el.style.fontFamily = "Menlo, Consolas, monospace";
  });
  container.querySelectorAll("a").forEach((a) => a.setAttribute("rel", "nofollow noopener"));
  return container.innerHTML;
}
function exportPDF(editor, title) {
  const t2 = title || "\u5BFC\u51FA\u6587\u6863";
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    window.print();
    return;
  }
  win.document.write("");
  win.document.write('<html lang="zh-CN"><head><meta charset="utf-8">');
  win.document.write(`<title>${escapeHtml(t2)}</title>`);
  win.document.write(`<style>${EXPORT_CSS} @page{margin:2cm;} body{max-width:none;}</style>`);
  win.document.write("</head><body>");
  win.document.write(cleanBody(editor));
  win.document.write("</body></html>");
  win.document.close();
  win.focus();
  win.print();
}

// src/overtype.js
var _isSafariCache;
function isSafariBrowser() {
  if (_isSafariCache !== void 0)
    return _isSafariCache;
  _isSafariCache = false;
  if (typeof navigator !== "undefined") {
    const ua = navigator.userAgent || "";
    _isSafariCache = /^((?!chrome|android|crios|fxios|edg|opr).)*safari/i.test(ua) || /iPad|iPhone|iPod/.test(ua) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1 && /Safari/.test(ua);
  }
  return _isSafariCache;
}
function buildActionsMap(buttons) {
  const map = {};
  (buttons || []).forEach((btn) => {
    if (!btn || btn.name === "separator")
      return;
    const id = btn.actionId || btn.name;
    if (btn.action) {
      map[id] = btn.action;
    }
  });
  return map;
}
function normalizeButtons(buttons) {
  const list = buttons || defaultToolbarButtons;
  if (!Array.isArray(list))
    return null;
  return list.map((btn) => ({
    name: (btn == null ? void 0 : btn.name) || null,
    actionId: (btn == null ? void 0 : btn.actionId) || (btn == null ? void 0 : btn.name) || null,
    icon: (btn == null ? void 0 : btn.icon) || null,
    title: (btn == null ? void 0 : btn.title) || null
  }));
}
function toolbarButtonsChanged(prevButtons, nextButtons) {
  const prev = normalizeButtons(prevButtons);
  const next = normalizeButtons(nextButtons);
  if (prev === null || next === null)
    return prev !== next;
  if (prev.length !== next.length)
    return true;
  for (let i = 0; i < prev.length; i++) {
    const a = prev[i];
    const b = next[i];
    if (a.name !== b.name || a.actionId !== b.actionId || a.icon !== b.icon || a.title !== b.title) {
      return true;
    }
  }
  return false;
}
var _OverType = class _OverType {
  /**
   * Constructor - Always returns an array of instances
   * @param {string|Element|NodeList|Array} target - Target element(s)
   * @param {Object} options - Configuration options
   * @returns {Array} Array of OverType instances
   */
  constructor(target, options = {}) {
    const elements = _OverType._resolveTargets(target);
    if (typeof target === "string" && elements.length === 0) {
      throw new Error(`No elements found for selector: ${target}`);
    }
    const instances = elements.map((element) => {
      if (options.medium === "window") {
        element.overTypeInstance = null;
        const shell = new OvertypeWindow(element, options);
        element.overtypeShellInstance = shell;
        return shell;
      }
      if (element.overTypeInstance) {
        element.overTypeInstance.reinit(options);
        return element.overTypeInstance;
      }
      const instance = Object.create(_OverType.prototype);
      instance._init(element, options);
      element.overTypeInstance = instance;
      _OverType.instances.set(element, instance);
      return instance;
    });
    return instances;
  }
  /**
   * Internal initialization
   * @private
   */
  _init(element, options = {}) {
    this.element = element;
    this.instanceTheme = options.theme || null;
    this.options = this._mergeOptions(options);
    this.instanceId = ++_OverType.instanceCount;
    this.initialized = false;
    this._isSafari = isSafariBrowser();
    this._safariReflowRaf = null;
    _OverType.injectStyles();
    _OverType.initGlobalListeners();
    const container = element.querySelector(".overtype-container");
    const wrapper = element.querySelector(".overtype-wrapper");
    if (container || wrapper) {
      this._recoverFromDOM(container, wrapper);
    } else {
      this._buildFromScratch();
    }
    if (this.instanceTheme === "auto") {
      this.setTheme("auto");
    }
    this.shortcuts = new ShortcutsManager(this);
    this._rebuildActionsMap();
    this.linkTooltip = new LinkTooltip(this);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.textarea.scrollTop = this.preview.scrollTop;
        this.textarea.scrollLeft = this.preview.scrollLeft;
      });
    });
    this.initialized = true;
    this._pasteHTMLUninstall = this.options.pasteHTML ? installPasteHTML(this) : null;
    if (this.options.onChange) {
      this._notifyChange();
    }
  }
  /**
   * Merge user options with defaults
   * @private
   */
  _mergeOptions(options) {
    const defaults = {
      // Typography
      fontSize: "14px",
      lineHeight: 1.6,
      /* System-first, guaranteed monospaced; avoids Android 'ui-monospace' pitfalls */
      fontFamily: '"SF Mono", SFMono-Regular, Menlo, Monaco, "Cascadia Code", Consolas, "Roboto Mono", "Noto Sans Mono", "Droid Sans Mono", "Ubuntu Mono", "DejaVu Sans Mono", "Liberation Mono", "Courier New", Courier, monospace',
      padding: "16px",
      // Mobile styles
      mobile: {
        fontSize: "16px",
        // Prevent zoom on iOS
        padding: "12px",
        lineHeight: 1.5
      },
      // Native textarea properties
      textareaProps: {},
      // Behavior
      autofocus: false,
      autoResize: false,
      // Auto-expand height with content
      minHeight: "100px",
      // Minimum height for autoResize mode
      maxHeight: null,
      // Maximum height for autoResize mode (null = unlimited)
      placeholder: "\u5F00\u59CB\u8F93\u5165...",
      value: "",
      // Callbacks
      onChange: null,
      onKeydown: null,
      onRender: null,
      onFocus: null,
      onBlur: null,
      // Features
      showActiveLineRaw: false,
      showStats: false,
      toolbar: false,
      toolbarButtons: null,
      // Defaults to defaultToolbarButtons if toolbar: true
      lang: "zh",
      // P3: 工具栏/提示语种（'zh' | 'en'）
      statsFormatter: null,
      smartLists: true,
      // Enable smart list continuation
      codeHighlighter: null,
      // Per-instance code highlighter
      spellcheck: false,
      // Browser spellcheck (disabled by default)
      transformLinkUrl: null,
      // Transform URLs shown/opened in the link tooltip
      medium: "input",
      // Editor presentation: 'input' (box) | 'window' (full shell)
      disableShortcuts: null,
      // Array of keys to ignore, e.g. ['b','1']
      professional: null,
      // { math, mermaid, graphviz } - P1 on-demand rendering
      pasteHTML: false
      // P2: convert pasted HTML to Markdown on insert
    };
    const { theme, colors, ...cleanOptions } = options;
    return {
      ...defaults,
      ...cleanOptions
    };
  }
  /**
   * Recover from existing DOM structure
   * @private
   */
  _recoverFromDOM(container, wrapper) {
    if (container && container.classList.contains("overtype-container")) {
      this.container = container;
      this.wrapper = container.querySelector(".overtype-wrapper");
    } else if (wrapper) {
      this.wrapper = wrapper;
      this.container = document.createElement("div");
      this.container.className = "overtype-container";
      const themeToUse = this.instanceTheme || _OverType.currentTheme || solar;
      const themeName = typeof themeToUse === "string" ? themeToUse : themeToUse.name;
      if (themeName) {
        this.container.setAttribute("data-theme", themeName);
      }
      if (this.instanceTheme) {
        const themeObj = typeof this.instanceTheme === "string" ? getTheme(this.instanceTheme) : this.instanceTheme;
        if (themeObj && themeObj.colors) {
          const cssVars = themeToCSSVars(themeObj.colors);
          this.container.style.cssText += cssVars;
        }
      }
      wrapper.parentNode.insertBefore(this.container, wrapper);
      this.container.appendChild(wrapper);
    }
    if (!this.wrapper) {
      if (container)
        container.remove();
      if (wrapper)
        wrapper.remove();
      this._buildFromScratch();
      return;
    }
    this.textarea = this.wrapper.querySelector(".overtype-input");
    this.preview = this.wrapper.querySelector(".overtype-preview");
    if (!this.textarea || !this.preview) {
      this.container.remove();
      this._buildFromScratch();
      return;
    }
    this.wrapper._instance = this;
    this._applyInstanceCSSVars();
    this._configureTextarea();
    this._ensureTextareaId();
    this._syncPreviewInteractivity();
    this._applyOptions();
  }
  /**
   * Build editor from scratch
   * @private
   */
  _buildFromScratch() {
    const content = this._extractContent();
    this.element.innerHTML = "";
    this._createDOM();
    if (content || this.options.value) {
      this.setValue(content || this.options.value);
    }
    this._applyOptions();
  }
  /**
   * Extract content from element
   * @private
   */
  _extractContent() {
    const textarea = this.element.querySelector(".overtype-input");
    if (textarea)
      return textarea.value;
    return this.element.textContent || "";
  }
  /**
   * Create DOM structure
   * @private
   */
  _createDOM() {
    this.container = document.createElement("div");
    this.container.className = "overtype-container";
    const themeToUse = this.instanceTheme || _OverType.currentTheme || solar;
    const themeName = typeof themeToUse === "string" ? themeToUse : themeToUse.name;
    if (themeName) {
      this.container.setAttribute("data-theme", themeName);
    }
    if (this.instanceTheme) {
      const themeObj = typeof this.instanceTheme === "string" ? getTheme(this.instanceTheme) : this.instanceTheme;
      if (themeObj && themeObj.colors) {
        const cssVars = themeToCSSVars(themeObj.colors);
        this.container.style.cssText += cssVars;
      }
    }
    this.wrapper = document.createElement("div");
    this.wrapper.className = "overtype-wrapper";
    this._applyInstanceCSSVars();
    this.wrapper._instance = this;
    this.textarea = document.createElement("textarea");
    this.textarea.className = "overtype-input";
    this.textarea.placeholder = this.options.placeholder;
    this._configureTextarea();
    if (this.options.textareaProps) {
      Object.entries(this.options.textareaProps).forEach(([key, value]) => {
        if (key === "className" || key === "class") {
          this.textarea.className += " " + value;
        } else if (key === "style" && typeof value === "object") {
          Object.assign(this.textarea.style, value);
        } else {
          this.textarea.setAttribute(key, value);
        }
      });
    }
    this._ensureTextareaId();
    this.preview = document.createElement("div");
    this.preview.className = "overtype-preview";
    this.preview.setAttribute("aria-hidden", "true");
    this.placeholderEl = document.createElement("div");
    this.placeholderEl.className = "overtype-placeholder";
    this.placeholderEl.setAttribute("aria-hidden", "true");
    this.placeholderEl.textContent = this.options.placeholder;
    this.wrapper.appendChild(this.textarea);
    this.wrapper.appendChild(this.preview);
    this.wrapper.appendChild(this.placeholderEl);
    this.container.appendChild(this.wrapper);
    if (this.options.showStats) {
      this.statsBar = document.createElement("div");
      this.statsBar.className = "overtype-stats";
      this.container.appendChild(this.statsBar);
      this._updateStats();
    }
    this.element.appendChild(this.container);
    if (this.options.autoResize) {
      this._setupAutoResize();
    } else {
      this.container.classList.remove("overtype-auto-resize");
    }
    this._syncPreviewInteractivity();
  }
  /**
   * Configure textarea attributes
   * @private
   */
  _configureTextarea() {
    this.textarea.setAttribute("autocomplete", "off");
    this.textarea.setAttribute("autocorrect", "off");
    this.textarea.setAttribute("autocapitalize", "off");
    this.textarea.setAttribute("spellcheck", String(this.options.spellcheck));
    this.textarea.setAttribute("data-gramm", "false");
    this.textarea.setAttribute("data-gramm_editor", "false");
    this.textarea.setAttribute("data-enable-grammarly", "false");
  }
  /**
   * Ensure the textarea can be referenced by aria-controls
   * @private
   */
  _ensureTextareaId() {
    if (!this.textarea.id) {
      this.textarea.id = `overtype-${this.instanceId}-input`;
    }
  }
  /**
   * Keep rendered preview content out of keyboard navigation until Preview mode.
   * @private
   */
  _syncPreviewInteractivity() {
    if (!this.preview || !this.container)
      return;
    const isPreviewMode = this.container.dataset.mode === "preview";
    this.preview.inert = !isPreviewMode;
    this.preview.toggleAttribute("inert", !isPreviewMode);
    if (isPreviewMode) {
      this.preview.removeAttribute("aria-hidden");
      return;
    }
    this.preview.setAttribute("aria-hidden", "true");
  }
  /**
   * Create and setup toolbar
   * @private
   */
  _createToolbar() {
    var _a;
    let toolbarButtons2 = this.options.toolbarButtons || defaultToolbarButtons;
    if (((_a = this.options.fileUpload) == null ? void 0 : _a.enabled) && !toolbarButtons2.some((b) => (b == null ? void 0 : b.name) === "upload")) {
      const viewModeIdx = toolbarButtons2.findIndex((b) => (b == null ? void 0 : b.name) === "viewMode");
      if (viewModeIdx !== -1) {
        toolbarButtons2 = [...toolbarButtons2];
        toolbarButtons2.splice(viewModeIdx, 0, toolbarButtons.separator, toolbarButtons.upload);
      } else {
        toolbarButtons2 = [...toolbarButtons2, toolbarButtons.separator, toolbarButtons.upload];
      }
    }
    this.toolbar = new Toolbar(this, { toolbarButtons: toolbarButtons2, lang: this.options.lang });
    this.toolbar.create();
    this._toolbarSelectionListener = () => {
      if (this.toolbar) {
        this.toolbar.updateButtonStates();
      }
    };
    this._toolbarInputListener = () => {
      if (this.toolbar) {
        this.toolbar.updateButtonStates();
      }
    };
    this.textarea.addEventListener("selectionchange", this._toolbarSelectionListener);
    this.textarea.addEventListener("input", this._toolbarInputListener);
  }
  /**
   * Cleanup toolbar event listeners
   * @private
   */
  _cleanupToolbarListeners() {
    if (this._toolbarSelectionListener) {
      this.textarea.removeEventListener("selectionchange", this._toolbarSelectionListener);
      this._toolbarSelectionListener = null;
    }
    if (this._toolbarInputListener) {
      this.textarea.removeEventListener("input", this._toolbarInputListener);
      this._toolbarInputListener = null;
    }
  }
  /**
   * Rebuild the action map from current toolbar button configuration
   * Called during init and reinit to keep shortcuts in sync with toolbar buttons
   * @private
   */
  _rebuildActionsMap() {
    var _a;
    this.actionsById = buildActionsMap(defaultToolbarButtons);
    Object.assign(this.actionsById, buildActionsMap(moreToolbarButtons));
    if (this.options.toolbarButtons) {
      Object.assign(this.actionsById, buildActionsMap(this.options.toolbarButtons));
    }
    if ((_a = this.options.fileUpload) == null ? void 0 : _a.enabled) {
      Object.assign(this.actionsById, buildActionsMap([toolbarButtons.upload]));
    }
  }
  /**
   * Apply instance-specific styles via CSS custom properties on the wrapper.
   * Called from init paths and from _applyOptions so reinit() propagates
   * font/padding changes.
   * @private
   */
  _applyInstanceCSSVars() {
    if (!this.wrapper)
      return;
    if (this.options.fontSize) {
      this.wrapper.style.setProperty("--instance-font-size", this.options.fontSize);
    }
    if (this.options.lineHeight) {
      this.wrapper.style.setProperty("--instance-line-height", String(this.options.lineHeight));
    }
    if (this.options.padding) {
      this.wrapper.style.setProperty("--instance-padding", this.options.padding);
    }
    if (this.options.fontFamily) {
      this.wrapper.style.setProperty("--instance-font-family", this.options.fontFamily);
    }
  }
  /**
   * Apply options to the editor
   * @private
   */
  _applyOptions() {
    this._applyInstanceCSSVars();
    if (this.options.autofocus) {
      this.textarea.focus();
    }
    if (this.options.autoResize) {
      if (!this.container.classList.contains("overtype-auto-resize")) {
        this._setupAutoResize();
      } else {
        this._updateAutoHeight();
      }
    } else {
      this.container.classList.remove("overtype-auto-resize");
    }
    if (this.options.toolbar && !this.toolbar) {
      this._createToolbar();
    } else if (!this.options.toolbar && this.toolbar) {
      this._cleanupToolbarListeners();
      this.toolbar.destroy();
      this.toolbar = null;
    }
    if (this.placeholderEl) {
      this.placeholderEl.textContent = this.options.placeholder;
    }
    if (this.options.fileUpload && !this.fileUploadInitialized) {
      this._initFileUpload();
    } else if (!this.options.fileUpload && this.fileUploadInitialized) {
      this._destroyFileUpload();
    }
    this.updatePreview();
  }
  _initFileUpload() {
    const options = this.options.fileUpload;
    if (!options || !options.enabled)
      return;
    options.maxSize = options.maxSize || 10 * 1024 * 1024;
    options.mimeTypes = options.mimeTypes || [];
    options.batch = options.batch || false;
    if (!options.onInsertFile || typeof options.onInsertFile !== "function") {
      console.warn("OverType: fileUpload.onInsertFile callback is required for file uploads.");
      return;
    }
    this._fileUploadCounter = 0;
    this._uploadedFiles = /* @__PURE__ */ new Map();
    this._boundHandleFilePaste = this._handleFilePaste.bind(this);
    this._boundHandleFileDrop = this._handleFileDrop.bind(this);
    this._boundHandleDragOver = this._handleDragOver.bind(this);
    this.textarea.addEventListener("paste", this._boundHandleFilePaste);
    this.textarea.addEventListener("drop", this._boundHandleFileDrop);
    this.textarea.addEventListener("dragover", this._boundHandleDragOver);
    this.fileUploadInitialized = true;
  }
  /**
   * Extract URLs from markdown link syntax: [text](url) or ![text](url).
   * @private
   */
  _extractMarkdownUrls(text) {
    const urls = [];
    const re = /!?\[[^\]]*\]\(([^)\s]+)/g;
    let m;
    while ((m = re.exec(text)) !== null)
      urls.push(m[1]);
    return urls;
  }
  /**
   * Track URLs that were just inserted, pairing each with the source File.
   * If multiple URLs appear in one inserted block, all get associated with
   * the same file (rare; happens if onInsertFile returns several links).
   * @private
   */
  _trackInsertedUrls(insertedText, file) {
    if (!this._uploadedFiles || !file || !insertedText)
      return;
    for (const url of this._extractMarkdownUrls(insertedText)) {
      this._uploadedFiles.set(url, { filename: file.name, file });
    }
  }
  /**
   * Diff the tracked-URL set against the current value and fire
   * fileUpload.onRemoveFile for any URL no longer present.
   * @private
   */
  _checkForRemovedUploads() {
    var _a;
    if (!this._uploadedFiles || this._uploadedFiles.size === 0)
      return;
    const cb = (_a = this.options.fileUpload) == null ? void 0 : _a.onRemoveFile;
    const value = this.getValue();
    const removed = [];
    for (const [url, info] of this._uploadedFiles) {
      if (!value.includes(url))
        removed.push({ url, info });
    }
    for (const { url, info } of removed) {
      this._uploadedFiles.delete(url);
      if (cb)
        cb({ url, filename: info.filename, file: info.file });
    }
  }
  _handleFilePaste(e) {
    var _a, _b;
    if (!((_b = (_a = e == null ? void 0 : e.clipboardData) == null ? void 0 : _a.files) == null ? void 0 : _b.length))
      return;
    e.preventDefault();
    this._handleDataTransfer(e.clipboardData);
  }
  _handleFileDrop(e) {
    var _a, _b;
    if (!((_b = (_a = e == null ? void 0 : e.dataTransfer) == null ? void 0 : _a.files) == null ? void 0 : _b.length))
      return;
    e.preventDefault();
    this._handleDataTransfer(e.dataTransfer);
  }
  _handleDataTransfer(dataTransfer) {
    const files = [];
    for (const file of dataTransfer.files) {
      if (file.size > this.options.fileUpload.maxSize)
        continue;
      if (this.options.fileUpload.mimeTypes.length > 0 && !this.options.fileUpload.mimeTypes.includes(file.type))
        continue;
      const id = ++this._fileUploadCounter;
      const prefix = file.type.startsWith("image/") ? "!" : "";
      const placeholder = `${prefix}[Uploading ${file.name} (#${id})...]()`;
      this.insertAtCursor(`${placeholder}
`);
      if (this.options.fileUpload.batch) {
        files.push({ file, placeholder });
        continue;
      }
      this.options.fileUpload.onInsertFile(file).then((text) => {
        this.textarea.value = this.textarea.value.replace(placeholder, text);
        this._trackInsertedUrls(text, file);
        this.textarea.dispatchEvent(new Event("input", { bubbles: true }));
      }, (error) => {
        console.error("OverType: File upload failed", error);
        this.textarea.value = this.textarea.value.replace(placeholder, "[Upload failed]()");
        this.textarea.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    if (this.options.fileUpload.batch && files.length > 0) {
      this.options.fileUpload.onInsertFile(files.map((f) => f.file)).then((result) => {
        const texts = Array.isArray(result) ? result : [result];
        texts.forEach((text, index) => {
          this.textarea.value = this.textarea.value.replace(files[index].placeholder, text);
          this._trackInsertedUrls(text, files[index].file);
        });
        this.textarea.dispatchEvent(new Event("input", { bubbles: true }));
      }, (error) => {
        console.error("OverType: File upload failed", error);
        files.forEach(({ placeholder }) => {
          this.textarea.value = this.textarea.value.replace(placeholder, "[Upload failed]()");
        });
        this.textarea.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
  }
  _handleDragOver(e) {
    e.preventDefault();
  }
  _destroyFileUpload() {
    this.textarea.removeEventListener("paste", this._boundHandleFilePaste);
    this.textarea.removeEventListener("drop", this._boundHandleFileDrop);
    this.textarea.removeEventListener("dragover", this._boundHandleDragOver);
    this._boundHandleFilePaste = null;
    this._boundHandleFileDrop = null;
    this._boundHandleDragOver = null;
    this._uploadedFiles = null;
    this.fileUploadInitialized = false;
  }
  insertAtCursor(text) {
    const start = this.textarea.selectionStart;
    const end = this.textarea.selectionEnd;
    let inserted = false;
    try {
      inserted = document.execCommand("insertText", false, text);
    } catch (_) {
    }
    if (!inserted) {
      const before = this.textarea.value.slice(0, start);
      const after = this.textarea.value.slice(end);
      this.textarea.value = before + text + after;
      this.textarea.setSelectionRange(start + text.length, start + text.length);
    }
    this.textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }
  /**
   * Update preview with parsed markdown
   */
  updatePreview() {
    if (this.container && this.container.dataset.mode === "ir" && this.ir) {
      this.ir.render();
      return;
    }
    const text = this.textarea.value;
    const cursorPos = this.textarea.selectionStart;
    const activeLine = this._getCurrentLine(text, cursorPos);
    const isPreviewMode = this.container.dataset.mode === "preview";
    const html = MarkdownParser.parse(text, activeLine, this.options.showActiveLineRaw, this.options.codeHighlighter, isPreviewMode);
    this.preview.innerHTML = html;
    if (this.placeholderEl) {
      this.placeholderEl.style.display = text ? "none" : "";
    }
    this._applyCodeBlockBackgrounds();
    if (this.options.showStats && this.statsBar) {
      this._updateStats();
    }
    if (this.options.onRender) {
      this.options.onRender(this.preview, isPreviewMode ? "preview" : "normal", this);
    }
    if (this.options.professional) {
      renderProfessional(this.preview, this.options);
    }
  }
  /**
   * Notify listeners that the editor value changed
   * @private
   */
  _notifyChange() {
    if (!this.initialized)
      return;
    this._checkForRemovedUploads();
    if (this.options.onChange) {
      this.options.onChange(this.getValue(), this);
    }
  }
  /**
   * Apply background styling to code blocks
   * @private
   */
  _applyCodeBlockBackgrounds() {
    const codeFences = this.preview.querySelectorAll(".code-fence");
    for (let i = 0; i < codeFences.length - 1; i += 2) {
      const openFence = codeFences[i];
      const closeFence = codeFences[i + 1];
      const openParent = openFence.parentElement;
      const closeParent = closeFence.parentElement;
      if (!openParent || !closeParent)
        continue;
      openFence.style.display = "block";
      closeFence.style.display = "block";
      openParent.classList.add("code-block-line");
      closeParent.classList.add("code-block-line");
    }
  }
  /**
   * Get current line number from cursor position
   * @private
   */
  _getCurrentLine(text, cursorPos) {
    const lines = text.substring(0, cursorPos).split("\n");
    return lines.length - 1;
  }
  /**
   * Handle input events
   * @private
   */
  handleInput(event) {
    if (this.container && this.container.dataset.mode === "ir" && this.ir) {
      this.ir.handleInput(event);
      this._notifyChange();
      return;
    }
    this.updatePreview();
    this._notifyChange();
    this._scheduleSafariReflow();
  }
  /**
   * Force Safari to re-shape stale textarea text after an edit.
   * Safari can leave a textarea's glyph layout cached after incremental edits,
   * desyncing the caret/wrap from the styled preview overlay. Toggling
   * letter-spacing (with !important to beat the stylesheet rule) and reading
   * offsetHeight forces a synchronous re-shape. Safari-only, coalesced to one
   * run per animation frame.
   * @private
   */
  _scheduleSafariReflow() {
    if (!this._isSafari || this._safariReflowRaf)
      return;
    this._safariReflowRaf = requestAnimationFrame(() => {
      this._safariReflowRaf = null;
      const ta = this.textarea;
      if (!ta)
        return;
      ta.style.setProperty("letter-spacing", "-0.001px", "important");
      void ta.offsetHeight;
      ta.style.removeProperty("letter-spacing");
    });
  }
  /**
   * Handle focus events
   * @private
   */
  handleFocus(event) {
    if (this.options.onFocus) {
      this.options.onFocus(event, this);
    }
  }
  /**
   * Handle blur events
   * @private
   */
  handleBlur(event) {
    if (this.options.onBlur) {
      this.options.onBlur(event, this);
    }
  }
  /**
   * Handle keydown events
   * @private
   */
  handleKeydown(event) {
    if (this.container && this.container.dataset.mode === "ir" && this.ir) {
      if (this.ir.handleKeydown(event))
        return;
    }
    if (event.key === "Tab") {
      const start = this.textarea.selectionStart;
      const end = this.textarea.selectionEnd;
      if (start !== end && this._canEditTextarea()) {
        event.preventDefault();
        event.shiftKey ? this.outdentSelection() : this.indentSelection();
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey && this.options.smartLists) {
      if (this.handleSmartListContinuation()) {
        event.preventDefault();
        return;
      }
    }
    const disabled = this.options.disableShortcuts;
    const isMac = navigator.platform && navigator.platform.toLowerCase().includes("mac");
    const mod = isMac ? event.metaKey : event.ctrlKey;
    const hit = disabled && disabled.some(
      (k) => k.toLowerCase() === event.key.toLowerCase() || /^[1-6]$/.test(k) && event.code === "Digit" + k || /^Digit[1-6]$/.test(k) && k.slice(-1) === event.key
    );
    let handled = false;
    if (mod && !hit) {
      handled = this.shortcuts.handleKeydown(event);
    }
    if (!handled && this.options.onKeydown) {
      this.options.onKeydown(event, this);
    }
  }
  /**
   * Handle smart list continuation
   * @returns {boolean} Whether the event was handled
   */
  handleSmartListContinuation() {
    const textarea = this.textarea;
    const cursorPos = textarea.selectionStart;
    const context = MarkdownParser.getListContext(textarea.value, cursorPos);
    if (!context || !context.inList)
      return false;
    if (context.content.trim() === "" && cursorPos >= context.markerEndPos) {
      this.deleteListMarker(context);
      return true;
    }
    if (cursorPos > context.markerEndPos && cursorPos < context.lineEnd) {
      this.splitListItem(context, cursorPos);
    } else {
      this.insertNewListItem(context);
    }
    if (context.listType === "numbered") {
      this.scheduleNumberedListUpdate();
    }
    return true;
  }
  /**
   * Delete list marker and exit list
   * @private
   */
  deleteListMarker(context) {
    this.textarea.setSelectionRange(context.lineStart, context.markerEndPos);
    document.execCommand("delete");
    this.textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }
  /**
   * Insert new list item
   * @private
   */
  insertNewListItem(context) {
    const newItem = MarkdownParser.createNewListItem(context);
    document.execCommand("insertText", false, "\n" + newItem);
    this.textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }
  /**
   * Split list item at cursor position
   * @private
   */
  splitListItem(context, cursorPos) {
    const textAfterCursor = context.content.substring(cursorPos - context.markerEndPos);
    this.textarea.setSelectionRange(cursorPos, context.lineEnd);
    document.execCommand("delete");
    const newItem = MarkdownParser.createNewListItem(context);
    document.execCommand("insertText", false, "\n" + newItem + textAfterCursor);
    const newCursorPos = this.textarea.selectionStart - textAfterCursor.length;
    this.textarea.setSelectionRange(newCursorPos, newCursorPos);
    this.textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }
  /**
   * Schedule numbered list renumbering
   * @private
   */
  scheduleNumberedListUpdate() {
    if (this.numberUpdateTimeout) {
      clearTimeout(this.numberUpdateTimeout);
    }
    this.numberUpdateTimeout = setTimeout(() => {
      this.updateNumberedLists();
    }, 10);
  }
  /**
   * Update/renumber all numbered lists
   * @private
   */
  updateNumberedLists() {
    const value = this.textarea.value;
    const cursorPos = this.textarea.selectionStart;
    const newValue = MarkdownParser.renumberLists(value);
    if (newValue !== value) {
      let offset3 = 0;
      const oldLines = value.split("\n");
      const newLines = newValue.split("\n");
      let charCount = 0;
      for (let i = 0; i < oldLines.length && charCount < cursorPos; i++) {
        if (oldLines[i] !== newLines[i]) {
          const diff = newLines[i].length - oldLines[i].length;
          if (charCount + oldLines[i].length < cursorPos) {
            offset3 += diff;
          }
        }
        charCount += oldLines[i].length + 1;
      }
      this.textarea.value = newValue;
      const newCursorPos = cursorPos + offset3;
      this.textarea.setSelectionRange(newCursorPos, newCursorPos);
      this.textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  /**
   * Handle scroll events
   * @private
   */
  handleScroll(event) {
    if (this.container && this.container.dataset.mode === "ir")
      return;
    this.preview.scrollTop = this.textarea.scrollTop;
    this.preview.scrollLeft = this.textarea.scrollLeft;
  }
  /**
   * Get editor content
   * @returns {string} Current markdown content
   */
  getValue() {
    if (this.container && this.container.dataset.mode === "ir" && this.ir) {
      return this.ir.getValue();
    }
    return this.textarea.value;
  }
  /**
   * Set editor content
   * @param {string} value - Markdown content to set
   */
  setValue(value) {
    if (this.container && this.container.dataset.mode === "ir" && this.ir) {
      const didChange2 = this.getValue() !== value;
      this.ir.setValue(value);
      if (this.options.autoResize) {
        this._updateAutoHeight();
      }
      if (didChange2) {
        this._notifyChange();
      }
      return;
    }
    const didChange = this.textarea.value !== value;
    this.textarea.value = value;
    this.updatePreview();
    if (this.options.autoResize) {
      this._updateAutoHeight();
    }
    if (didChange) {
      this._notifyChange();
      this._scheduleSafariReflow();
    }
  }
  /**
   * Return a read-only syntax tree (AST) of the current markdown content.
   * Convenience wrapper around MarkdownParser.buildTree, respecting IR mode.
   * @returns {object} { type:'document', children: [...] }
   */
  getSyntaxTree() {
    return MarkdownParser.buildTree(this.getValue());
  }
  /**
   * Get editor statistics.
   * Field names follow the Stats contract declared in overtype.d.ts
   * (chars, not characters).
   * @returns {{words:number, chars:number, lines:number, line:number, column:number}|null}
   */
  getStats() {
    const value = this.getValue();
    if (value == null)
      return null;
    const lines = value.split("\n");
    const words = value.split(/\s+/).filter((w) => w.length > 0).length;
    const selectionStart = this.textarea ? this.textarea.selectionStart : value.length;
    const linesBefore = value.substring(0, selectionStart).split("\n");
    return {
      words,
      chars: value.length,
      lines: lines.length,
      line: linesBefore.length,
      column: linesBefore[linesBefore.length - 1].length + 1
    };
  }
  /**
   * Switch the UI language at runtime (re-renders toolbar labels).
   * @param {string} lang - 'zh' | 'en'
   */
  setLang(lang) {
    this.options.lang = lang;
    if (this.toolbar && typeof this.toolbar.setLang === "function") {
      this.toolbar.setLang(lang);
    }
  }
  /**
   * Execute an action by ID
   * Central dispatcher used by toolbar clicks, keyboard shortcuts, and programmatic calls
   * @param {string} actionId - The action identifier (e.g., 'toggleBold', 'insertLink')
   * @param {Event|null} event - Optional event that triggered the action
   * @returns {Promise<boolean>} Whether the action was executed successfully
   */
  async performAction(actionId, event = null) {
    var _a;
    const textarea = this.textarea;
    if (!textarea)
      return false;
    const action = (_a = this.actionsById) == null ? void 0 : _a[actionId];
    if (!action) {
      console.warn(`OverType: Unknown action "${actionId}"`);
      return false;
    }
    textarea.focus();
    try {
      await action({
        editor: this,
        getValue: () => this.getValue(),
        setValue: (value) => this.setValue(value),
        event
      });
      return true;
    } catch (error) {
      console.error(`OverType: Action "${actionId}" error:`, error);
      this.wrapper.dispatchEvent(new CustomEvent("button-error", {
        detail: { actionId, error }
      }));
      return false;
    }
  }
  /**
   * Get the rendered HTML of the current content
   * @param {Object} options - Rendering options
   * @param {boolean} options.cleanHTML - If true, removes syntax markers and OverType-specific classes
   * @returns {string} Rendered HTML
   */
  getRenderedHTML(options = {}) {
    const markdown = this.getValue();
    let html = MarkdownParser.parse(markdown, -1, false, this.options.codeHighlighter);
    if (options.cleanHTML) {
      html = html.replace(/<span class="syntax-marker[^"]*">.*?<\/span>/g, "");
      html = html.replace(/\sclass="(bullet-list|ordered-list|code-fence|hr-marker|blockquote|url-part)"/g, "");
      html = html.replace(/\sclass=""/g, "");
    }
    return html;
  }
  /**
   * Render the current content into an arbitrary element.
   * Intended for the style-preview pane: HTML is cleaned of syntax markers,
   * then professional blocks (math / mermaid / graphviz) render in place.
   * @param {HTMLElement} el - Target element
   * @param {Object} options - Forwarded to getRenderedHTML and renderProfessional
   */
  renderInto(el, options = {}) {
    if (!el)
      return;
    el.innerHTML = this.getRenderedHTML({ cleanHTML: true, ...options });
    renderProfessional(el, { ...this.options, ...options });
  }
  /**
   * Get the current preview element's HTML
   * This includes all syntax markers and OverType styling
   * @returns {string} Current preview HTML (as displayed)
   */
  getPreviewHTML() {
    if (this.container && this.container.dataset.mode === "ir" && this.ir) {
      return MarkdownParser.parse(this.getValue(), -1, false, this.options.codeHighlighter, true);
    }
    return this.preview.innerHTML;
  }
  /**
   * Indent the current line or selected lines by two spaces.
   */
  indentSelection() {
    this._replaceSelectedLines((line) => `  ${line}`);
  }
  /**
   * Outdent the current line or selected lines by up to two spaces or one tab.
   */
  outdentSelection() {
    this._replaceSelectedLines((line) => line.replace(/^( {1,2}|\t)/, ""));
  }
  /**
   * Replace full lines touched by the current selection.
   * @private
   */
  _replaceSelectedLines(transformLine) {
    if (!this._canEditTextarea())
      return false;
    const textarea = this.textarea;
    const { selectionStart, selectionEnd, value } = textarea;
    const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
    const effectiveEnd = this._effectiveSelectionEnd(value, selectionStart, selectionEnd);
    const lineEndOffset = value.indexOf("\n", effectiveEnd);
    const lineEnd = lineEndOffset === -1 ? value.length : lineEndOffset;
    const selectedLines = value.slice(lineStart, lineEnd);
    const replacement = selectedLines.split("\n").map(transformLine).join("\n");
    if (replacement === selectedLines)
      return false;
    textarea.setSelectionRange(lineStart, lineEnd);
    let inserted = false;
    try {
      inserted = document.execCommand("insertText", false, replacement);
    } catch (_) {
    }
    if (!inserted) {
      textarea.setRangeText(replacement, lineStart, lineEnd, "preserve");
    }
    textarea.setSelectionRange(lineStart, lineStart + replacement.length);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  /**
   * @private
   */
  _effectiveSelectionEnd(value, selectionStart, selectionEnd) {
    if (selectionEnd > selectionStart && value[selectionEnd - 1] === "\n") {
      return selectionEnd - 1;
    }
    return selectionEnd;
  }
  /**
   * @private
   */
  _canEditTextarea() {
    return this.textarea && !this.textarea.disabled && !this.textarea.readOnly;
  }
  /**
   * Get clean HTML without any OverType-specific markup
   * Useful for exporting to other formats or storage
   * @returns {string} Clean HTML suitable for export
   */
  getCleanHTML() {
    return this.getRenderedHTML({ cleanHTML: true });
  }
  // ===== P2 转换导出 =====
  /** 导出为独立 HTML 文档字符串 */
  exportHTML(title) {
    return exportHTML(this, title);
  }
  /** 导出为面向微信等富文本编辑器的内联样式 HTML */
  exportWeChat() {
    return exportWeChat(this);
  }
  /** 导出为知乎兼容 HTML */
  exportZhihu() {
    return exportZhihu(this);
  }
  /** 通过浏览器打印对话框导出 PDF */
  exportPDF(title) {
    return exportPDF(this, title);
  }
  /**
   * Focus the editor
   */
  focus() {
    this.textarea.focus();
  }
  /**
   * Blur the editor
   */
  blur() {
    this.textarea.blur();
  }
  /**
   * Check if editor is initialized
   * @returns {boolean}
   */
  isInitialized() {
    return this.initialized;
  }
  /**
   * Re-initialize with new options
   * @param {Object} options - New options to apply
   */
  reinit(options = {}) {
    var _a;
    const prevToolbarButtons = (_a = this.options) == null ? void 0 : _a.toolbarButtons;
    this.options = this._mergeOptions({ ...this.options, ...options });
    const toolbarNeedsRebuild = this.toolbar && this.options.toolbar && toolbarButtonsChanged(prevToolbarButtons, this.options.toolbarButtons);
    this._rebuildActionsMap();
    if (toolbarNeedsRebuild) {
      this._cleanupToolbarListeners();
      this.toolbar.destroy();
      this.toolbar = null;
      this._createToolbar();
    }
    if (this.fileUploadInitialized) {
      this._destroyFileUpload();
    }
    if (this.options.fileUpload) {
      this._initFileUpload();
    }
    this._applyOptions();
    this.updatePreview();
  }
  showToolbar() {
    if (this.toolbar) {
      this.toolbar.show();
    } else {
      this._createToolbar();
    }
  }
  hideToolbar() {
    if (this.toolbar) {
      this.toolbar.hide();
    }
  }
  /**
   * Set theme for this instance
   * @param {string|Object} theme - Theme name or custom theme object
   * @returns {this} Returns this for chaining
   */
  setTheme(theme) {
    _OverType._autoInstances.delete(this);
    this.instanceTheme = theme;
    if (theme === "auto") {
      _OverType._autoInstances.add(this);
      _OverType._startAutoListener();
      this._applyResolvedTheme(resolveAutoTheme("auto"));
    } else {
      const themeObj = typeof theme === "string" ? getTheme(theme) : theme;
      const themeName = typeof themeObj === "string" ? themeObj : themeObj.name;
      if (themeName) {
        this.container.setAttribute("data-theme", themeName);
      }
      if (themeObj && themeObj.colors) {
        const cssVars = themeToCSSVars(themeObj.colors, themeObj.previewColors);
        this.container.style.cssText += cssVars;
      }
      this.updatePreview();
    }
    _OverType._stopAutoListener();
    return this;
  }
  _applyResolvedTheme(themeName) {
    const themeObj = getTheme(themeName);
    this.container.setAttribute("data-theme", themeName);
    if (themeObj && themeObj.colors) {
      this.container.style.cssText = themeToCSSVars(themeObj.colors, themeObj.previewColors);
    }
    this.updatePreview();
  }
  /**
   * Set instance-specific code highlighter
   * @param {Function|null} highlighter - Function that takes (code, language) and returns highlighted HTML
   */
  setCodeHighlighter(highlighter) {
    this.options.codeHighlighter = highlighter;
    this.updatePreview();
  }
  /**
   * Update stats bar
   * @private
   */
  _updateStats() {
    if (!this.statsBar)
      return;
    const isIR = this.container && this.container.dataset.mode === "ir" && this.ir;
    const value = this.getValue();
    const lines = value.split("\n");
    const chars = value.length;
    const words = value.split(/\s+/).filter((w) => w.length > 0).length;
    let selectionStart;
    if (isIR) {
      const b = this.ir.blocks[this.ir.activeIndex];
      selectionStart = (b ? b.start : 0) + this.textarea.selectionStart;
    } else {
      selectionStart = this.textarea.selectionStart;
    }
    const beforeCursor = value.substring(0, selectionStart);
    const linesBeforeCursor = beforeCursor.split("\n");
    const currentLine = linesBeforeCursor.length;
    const currentColumn = linesBeforeCursor[linesBeforeCursor.length - 1].length + 1;
    if (this.options.statsFormatter) {
      this.statsBar.innerHTML = this.options.statsFormatter({
        chars,
        words,
        lines: lines.length,
        line: currentLine,
        column: currentColumn
      });
    } else {
      this.statsBar.innerHTML = `
          <div class="overtype-stat">
            <span class="live-dot"></span>
            <span>${chars} \u5B57 \xB7 ${words} \u8BCD \xB7 ${lines.length} \u884C</span>
          </div>
          <div class="overtype-stat">\u7B2C ${currentLine} \u884C\uFF0C\u7B2C ${currentColumn} \u5217</div>
        `;
    }
  }
  /**
   * Setup auto-resize functionality
   * @private
   */
  _setupAutoResize() {
    this.container.classList.add("overtype-auto-resize");
    this.previousHeight = null;
    this._updateAutoHeight();
    this.textarea.addEventListener("input", () => this._updateAutoHeight());
    window.addEventListener("resize", () => this._updateAutoHeight());
  }
  /**
   * Update height based on scrollHeight
   * @private
   */
  _updateAutoHeight() {
    if (!this.options.autoResize)
      return;
    const textarea = this.textarea;
    const preview = this.preview;
    const wrapper = this.wrapper;
    const isPreviewMode = this.container.dataset.mode === "preview";
    const isIRMode = this.container.dataset.mode === "ir";
    if (isIRMode) {
      wrapper.style.removeProperty("height");
      preview.style.removeProperty("height");
      preview.style.removeProperty("overflow-y");
      textarea.style.removeProperty("height");
      textarea.style.removeProperty("overflow-y");
      return;
    }
    if (isPreviewMode) {
      wrapper.style.removeProperty("height");
      preview.style.removeProperty("height");
      preview.style.removeProperty("overflow-y");
      textarea.style.removeProperty("height");
      textarea.style.removeProperty("overflow-y");
      return;
    }
    const scrollTop = textarea.scrollTop;
    wrapper.style.setProperty("height", "auto", "important");
    textarea.style.setProperty("height", "auto", "important");
    let newHeight = textarea.scrollHeight;
    if (this.options.minHeight) {
      const minHeight = parseInt(this.options.minHeight);
      newHeight = Math.max(newHeight, minHeight);
    }
    let overflow = "hidden";
    if (this.options.maxHeight) {
      const maxHeight = parseInt(this.options.maxHeight);
      if (newHeight > maxHeight) {
        newHeight = maxHeight;
        overflow = "auto";
      }
    }
    const heightPx = newHeight + "px";
    textarea.style.setProperty("height", heightPx, "important");
    textarea.style.setProperty("overflow-y", overflow, "important");
    preview.style.setProperty("height", heightPx, "important");
    preview.style.setProperty("overflow-y", overflow, "important");
    wrapper.style.setProperty("height", heightPx, "important");
    textarea.scrollTop = scrollTop;
    preview.scrollTop = scrollTop;
    if (this.previousHeight !== newHeight) {
      this.previousHeight = newHeight;
    }
  }
  /**
   * Show or hide stats bar
   * @param {boolean} show - Whether to show stats
   */
  showStats(show) {
    this.options.showStats = show;
    if (show && !this.statsBar) {
      this.statsBar = document.createElement("div");
      this.statsBar.className = "overtype-stats";
      this.container.appendChild(this.statsBar);
      this._updateStats();
    } else if (show && this.statsBar) {
      this._updateStats();
    } else if (!show && this.statsBar) {
      this.statsBar.remove();
      this.statsBar = null;
    }
  }
  /**
   * Show normal edit mode (overlay with markdown preview)
   * @returns {this} Returns this for chaining
   */
  showNormalEditMode() {
    if (this.container.dataset.mode === "ir" && this.ir) {
      this.ir.deactivate();
    }
    this.container.dataset.mode = "normal";
    this._syncPreviewInteractivity();
    this.updatePreview();
    this._updateAutoHeight();
    requestAnimationFrame(() => {
      this.textarea.scrollTop = this.preview.scrollTop;
      this.textarea.scrollLeft = this.preview.scrollLeft;
    });
    return this;
  }
  /**
   * Show plain textarea mode (no overlay)
   * @returns {this} Returns this for chaining
   */
  showPlainTextarea() {
    if (this.container.dataset.mode === "ir" && this.ir) {
      this.ir.deactivate();
    }
    this.container.dataset.mode = "plain";
    this._syncPreviewInteractivity();
    this._updateAutoHeight();
    if (this.toolbar) {
      const toggleBtn = this.container.querySelector('[data-action="toggle-plain"]');
      if (toggleBtn) {
        toggleBtn.classList.remove("active");
        toggleBtn.title = "Show markdown preview";
      }
    }
    return this;
  }
  /**
   * Show preview mode (read-only view)
   * @returns {this} Returns this for chaining
   */
  showPreviewMode() {
    if (this.container.dataset.mode === "ir" && this.ir) {
      this.ir.deactivate();
    }
    this.container.dataset.mode = "preview";
    this._syncPreviewInteractivity();
    this.updatePreview();
    this._updateAutoHeight();
    return this;
  }
  /**
   * Show instant-render mode (block-level WYSIWYG):
   * the caret block shows raw markdown, all other blocks render live.
   * @returns {this} Returns this for chaining
   */
  showInstantRenderMode() {
    if (!this.ir) {
      this.ir = new IRRenderer(this);
    }
    if (this.container.dataset.mode !== "ir") {
      this.ir.activate();
    }
    this.container.dataset.mode = "ir";
    this._syncPreviewInteractivity();
    this._updateAutoHeight();
    return this;
  }
  /**
   * Destroy the editor instance
   */
  destroy() {
    _OverType._autoInstances.delete(this);
    _OverType._stopAutoListener();
    if (this.fileUploadInitialized) {
      this._destroyFileUpload();
    }
    if (this._pasteHTMLUninstall) {
      this._pasteHTMLUninstall();
      this._pasteHTMLUninstall = null;
    }
    this.element.overTypeInstance = null;
    _OverType.instances.delete(this.element);
    if (this.shortcuts) {
      this.shortcuts.destroy();
    }
    if (this._safariReflowRaf) {
      cancelAnimationFrame(this._safariReflowRaf);
      this._safariReflowRaf = null;
    }
    if (this.wrapper) {
      if (this.ir) {
        this.ir.deactivate();
      }
      const content = this.getValue();
      this.wrapper.remove();
      this.element.textContent = content;
    }
    this.ir = null;
    this.initialized = false;
  }
  // ===== Static Methods =====
  /**
   * Initialize multiple editors (static convenience method)
   * @param {string|Element|NodeList|Array} target - Target element(s)
   * @param {Object} options - Configuration options
   * @returns {Array} Array of OverType instances
   */
  static init(target, options = {}) {
    return new _OverType(target, options);
  }
  /**
   * Initialize editors with options from data-ot-* attributes
   * @param {string} selector - CSS selector for target elements
   * @param {Object} defaults - Default options (data attrs override these)
   * @returns {Array<OverType>} Array of OverType instances
   * @example
   * // HTML: <div class="editor" data-ot-toolbar="true" data-ot-theme="cave"></div>
   * OverType.initFromData('.editor', { fontSize: '14px' });
   */
  static initFromData(target, defaults = {}) {
    const elements = _OverType._resolveTargets(target);
    return elements.map((el) => {
      const options = { ...defaults };
      for (const attr of el.attributes) {
        if (!attr.name.startsWith("data-ot-"))
          continue;
        const kebab = attr.name.slice(8);
        if (kebab.startsWith("textarea-") && kebab !== "textarea-props") {
          const propKey = kebab.slice(9).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          options.textareaProps = { ...options.textareaProps || {}, [propKey]: _OverType._parseDataValue(attr.value) };
          continue;
        }
        const key = kebab.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        options[key] = _OverType._parseDataValue(attr.value);
      }
      return new _OverType(el, options)[0];
    });
  }
  /**
   * Normalize various target shapes to an array of Elements
   * @private
   * @param {string|Element|NodeList|Element[]} target
   * @returns {Element[]}
   */
  static _resolveTargets(target) {
    if (target == null) {
      throw new Error("Invalid target: must be selector string, Element, NodeList, or Array");
    }
    if (typeof target === "string") {
      return Array.from(document.querySelectorAll(target));
    }
    if (target instanceof Element) {
      return [target];
    }
    if (target instanceof NodeList) {
      return Array.from(target);
    }
    if (Array.isArray(target)) {
      return target;
    }
    if (typeof target.length === "number") {
      return Array.from(target);
    }
    throw new Error("Invalid target: must be selector string, Element, NodeList, or Array");
  }
  /**
   * Parse a data attribute value to the appropriate type
   * @private
   */
  static _parseDataValue(value) {
    if (value === "true")
      return true;
    if (value === "false")
      return false;
    if (value === "null")
      return null;
    if (value !== "" && !isNaN(Number(value)))
      return Number(value);
    const trimmed = value.trim();
    if (trimmed[0] === "{" || trimmed[0] === "[") {
      try {
        return JSON.parse(trimmed);
      } catch (e) {
        return value;
      }
    }
    return value;
  }
  /**
   * Get instance from a target. Accepts the same shapes as the constructor;
   * for multi-element targets, returns the instance for the first matching
   * element, or null if none.
   * @param {string|Element|NodeList|Element[]} target
   * @returns {OverType|null}
   */
  static getInstance(target) {
    let element;
    if (target instanceof Element) {
      element = target;
    } else {
      const elements = _OverType._resolveTargets(target);
      element = elements[0];
    }
    if (!element)
      return null;
    return element.overTypeInstance || _OverType.instances.get(element) || null;
  }
  /**
   * Destroy all instances
   */
  static destroyAll() {
    const elements = document.querySelectorAll("[data-overtype-instance]");
    elements.forEach((element) => {
      const instance = _OverType.getInstance(element);
      if (instance) {
        instance.destroy();
      }
    });
  }
  /**
   * Inject styles into the document
   * @param {boolean} force - Force re-injection
   */
  static injectStyles(force = false) {
    if (_OverType.stylesInjected && !force)
      return;
    const existing = document.querySelector("style.overtype-styles");
    if (existing) {
      existing.remove();
    }
    const theme = _OverType.currentTheme || solar;
    const styles = generateStyles({ theme });
    const styleEl = document.createElement("style");
    styleEl.className = "overtype-styles";
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
    _OverType.stylesInjected = true;
  }
  /**
   * Set global theme for all OverType instances
   * @param {string|Object} theme - Theme name or custom theme object
   * @param {Object} customColors - Optional color overrides
   */
  static setTheme(theme, customColors = null) {
    _OverType._globalAutoTheme = false;
    _OverType._globalAutoCustomColors = null;
    if (theme === "auto") {
      _OverType._globalAutoTheme = true;
      _OverType._globalAutoCustomColors = customColors;
      _OverType._startAutoListener();
      _OverType._applyGlobalTheme(resolveAutoTheme("auto"), customColors);
      return;
    }
    _OverType._stopAutoListener();
    _OverType._applyGlobalTheme(theme, customColors);
  }
  static _applyGlobalTheme(theme, customColors = null) {
    let themeObj = typeof theme === "string" ? getTheme(theme) : theme;
    if (customColors) {
      themeObj = mergeTheme(themeObj, customColors);
    }
    _OverType.currentTheme = themeObj;
    _OverType.injectStyles(true);
    const themeName = typeof themeObj === "string" ? themeObj : themeObj.name;
    document.querySelectorAll(".overtype-container").forEach((container) => {
      if (themeName) {
        container.setAttribute("data-theme", themeName);
      }
    });
    document.querySelectorAll(".overtype-wrapper").forEach((wrapper) => {
      if (!wrapper.closest(".overtype-container")) {
        if (themeName) {
          wrapper.setAttribute("data-theme", themeName);
        }
      }
      const instance = wrapper._instance;
      if (instance) {
        instance.updatePreview();
      }
    });
    document.querySelectorAll("overtype-editor").forEach((webComponent) => {
      if (themeName && typeof webComponent.setAttribute === "function") {
        webComponent.setAttribute("theme", themeName);
      }
      if (typeof webComponent.refreshTheme === "function") {
        webComponent.refreshTheme();
      }
    });
  }
  static _startAutoListener() {
    if (_OverType._autoMediaQuery)
      return;
    if (!window.matchMedia)
      return;
    _OverType._autoMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    _OverType._autoMediaListener = (e) => {
      const resolved = e.matches ? "cave" : "solar";
      if (_OverType._globalAutoTheme) {
        _OverType._applyGlobalTheme(resolved, _OverType._globalAutoCustomColors);
      }
      _OverType._autoInstances.forEach((inst) => inst._applyResolvedTheme(resolved));
    };
    _OverType._autoMediaQuery.addEventListener("change", _OverType._autoMediaListener);
  }
  static _stopAutoListener() {
    if (_OverType._autoInstances.size > 0 || _OverType._globalAutoTheme)
      return;
    if (!_OverType._autoMediaQuery)
      return;
    _OverType._autoMediaQuery.removeEventListener("change", _OverType._autoMediaListener);
    _OverType._autoMediaQuery = null;
    _OverType._autoMediaListener = null;
  }
  /**
   * Set global code highlighter for all OverType instances
   * @param {Function|null} highlighter - Function that takes (code, language) and returns highlighted HTML
   */
  static setCodeHighlighter(highlighter) {
    MarkdownParser.setCodeHighlighter(highlighter);
    document.querySelectorAll(".overtype-wrapper").forEach((wrapper) => {
      const instance = wrapper._instance;
      if (instance && instance.updatePreview) {
        instance.updatePreview();
      }
    });
    document.querySelectorAll("overtype-editor").forEach((webComponent) => {
      if (typeof webComponent.getEditor === "function") {
        const instance = webComponent.getEditor();
        if (instance && instance.updatePreview) {
          instance.updatePreview();
        }
      }
    });
  }
  /**
   * Set custom syntax processor for extending markdown parsing
   * @param {Function|null} processor - Function that takes (html) and returns modified HTML
   * @example
   * OverType.setCustomSyntax((html) => {
   *   // Highlight footnote references [^1]
   *   return html.replace(/\[\^(\w+)\]/g, '<span class="footnote-ref">$&</span>');
   * });
   */
  static setCustomSyntax(processor) {
    MarkdownParser.setCustomSyntax(processor);
    document.querySelectorAll(".overtype-wrapper").forEach((wrapper) => {
      const instance = wrapper._instance;
      if (instance && instance.updatePreview) {
        instance.updatePreview();
      }
    });
    document.querySelectorAll("overtype-editor").forEach((webComponent) => {
      if (typeof webComponent.getEditor === "function") {
        const instance = webComponent.getEditor();
        if (instance && instance.updatePreview) {
          instance.updatePreview();
        }
      }
    });
  }
  /**
   * Initialize global event listeners
   */
  static initGlobalListeners() {
    const globalScope = typeof window !== "undefined" ? window : globalThis;
    const globalListenersKey = "__overtypeGlobalListenersInitialized";
    if (_OverType.globalListenersInitialized || globalScope[globalListenersKey]) {
      _OverType.globalListenersInitialized = true;
      return;
    }
    globalScope[globalListenersKey] = true;
    document.addEventListener("input", (e) => {
      if (e.target && e.target.classList && e.target.classList.contains("overtype-input")) {
        const wrapper = e.target.closest(".overtype-wrapper");
        const instance = wrapper == null ? void 0 : wrapper._instance;
        if (instance)
          instance.handleInput(e);
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.target && e.target.classList && e.target.classList.contains("overtype-input")) {
        const wrapper = e.target.closest(".overtype-wrapper");
        const instance = wrapper == null ? void 0 : wrapper._instance;
        if (instance)
          instance.handleKeydown(e);
      }
    });
    document.addEventListener("focus", (e) => {
      if (e.target && e.target.classList && e.target.classList.contains("overtype-input")) {
        const wrapper = e.target.closest(".overtype-wrapper");
        const instance = wrapper == null ? void 0 : wrapper._instance;
        if (instance)
          instance.handleFocus(e);
      }
    }, true);
    document.addEventListener("blur", (e) => {
      if (e.target && e.target.classList && e.target.classList.contains("overtype-input")) {
        const wrapper = e.target.closest(".overtype-wrapper");
        const instance = wrapper == null ? void 0 : wrapper._instance;
        if (instance)
          instance.handleBlur(e);
      }
    }, true);
    document.addEventListener("scroll", (e) => {
      if (e.target && e.target.classList && e.target.classList.contains("overtype-input")) {
        const wrapper = e.target.closest(".overtype-wrapper");
        const instance = wrapper == null ? void 0 : wrapper._instance;
        if (instance)
          instance.handleScroll(e);
      }
    }, true);
    document.addEventListener("selectionchange", (e) => {
      const activeElement = document.activeElement;
      if (activeElement && activeElement.classList.contains("overtype-input")) {
        const wrapper = activeElement.closest(".overtype-wrapper");
        const instance = wrapper == null ? void 0 : wrapper._instance;
        if (instance) {
          if (instance.options.showStats && instance.statsBar) {
            instance._updateStats();
          }
          clearTimeout(instance._selectionTimeout);
          instance._selectionTimeout = setTimeout(() => {
            instance.updatePreview();
          }, 50);
        }
      }
    });
    _OverType.globalListenersInitialized = true;
  }
};
// Static properties
__publicField(_OverType, "instances", /* @__PURE__ */ new WeakMap());
__publicField(_OverType, "stylesInjected", false);
__publicField(_OverType, "globalListenersInitialized", false);
__publicField(_OverType, "instanceCount", 0);
__publicField(_OverType, "_autoMediaQuery", null);
__publicField(_OverType, "_autoMediaListener", null);
__publicField(_OverType, "_autoInstances", /* @__PURE__ */ new Set());
__publicField(_OverType, "_globalAutoTheme", false);
__publicField(_OverType, "_globalAutoCustomColors", null);
var OverType = _OverType;
OverType.MarkdownParser = MarkdownParser;
OverType.ShortcutsManager = ShortcutsManager;
OverType.themes = { solar, cave: getTheme("cave") };
OverType.getTheme = getTheme;
OverType.currentTheme = solar;
var overtype_default = OverType;
export {
  OverType,
  overtype_default as default,
  defaultToolbarButtons,
  markdown_actions_esm_exports as markdownActions,
  renderProfessional,
  toolbarButtons
};
/**
 * OverType - A lightweight markdown editor library with perfect WYSIWYG alignment
 * @version 1.0.0
 * @license MIT
 */
//# sourceMappingURL=overtype.esm.js.map
