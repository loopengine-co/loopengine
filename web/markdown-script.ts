// The console pages' markdown renderer, as inline script: the
// workflow pages and the Inbox put it in their own <script>, inside their
// template literal, so it's kept here as a string of browser JS with the
// same escaping rules as those pages (no backslash-letter sequences, no
// template placeholders). renderMarkdownPreview(md) returns HTML; it
// escapes first, so no markdown can inject raw HTML.
export const renderMarkdownScript: string = `
  function markdownEscapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // A small, deliberately non-CommonMark markdown-to-HTML renderer for
  // the skill Body field's Preview toggle (see wireSkillsHandlers) — this
  // page stays a self-contained string, no build step, no CDN (same
  // reasoning as devUiCss's own header comment), so pulling in a real
  // markdown library isn't an option without breaking that. Covers what
  // an actual SKILL.md body realistically uses (headings, bold/italic,
  // inline code, fenced code blocks, links, lists, rules, paragraphs) —
  // good enough for "does this read the way it will on GitHub", not a
  // spec-complete parser. Escapes first, so no markdown source can inject
  // raw HTML into the preview.
  function renderMarkdownPreview(md) {
    var lines = markdownEscapeHtml(md).split('\\n');
    var html = '';
    var inCode = false;
    var codeBuffer = '';
    var listType = null;
    var paragraph = [];

    // This whole page is one outer TS template literal AND its output is
    // itself served as JS source text a browser then parses again — two
    // layers of "escape sequences get processed", not one. The unicode
    // escape used for the backtick patterns below survives both layers fine, since
    // it's a real, recognized escape at both of them. A star/bracket/
    // paren/s/d/dot escape (\*, \[, \s, \d, \.) is *not* a recognized
    // escape at either layer, so each layer that touches it silently
    // drops the backslash and keeps just the character — confirmed by
    // extracting and executing the actually-served page during
    // development, where every regex built the "obvious" way here ended
    // up with its escapes stripped entirely, sometimes still parsing
    // (silently wrong) and sometimes throwing ("nothing to repeat").
    // Building these particular patterns from a runtime backslash
    // character instead sidesteps the whole problem: there is no
    // backslash-followed-by-letter sequence anywhere in this source for
    // either layer to misinterpret.
    var bs = String.fromCharCode(92);
    var inlineCodePattern = new RegExp('\\u0060([^\\u0060]+)\\u0060', 'g');
    var fencePattern = new RegExp('^\\u0060\\u0060\\u0060');
    var boldPattern = new RegExp(bs + '*' + bs + '*([^*]+)' + bs + '*' + bs + '*', 'g');
    var italicPattern = new RegExp(bs + '*([^*]+)' + bs + '*', 'g');
    var linkPattern = new RegExp(bs + '[([^' + bs + ']]+)' + bs + ']' + bs + '(([^)]+)' + bs + ')', 'g');
    var headingPattern = new RegExp('^(#{1,6})' + bs + 's+(.*)$');
    var hrPattern = new RegExp('^(---|' + bs + '*' + bs + '*' + bs + '*)' + bs + 's*$');
    var ulPattern = new RegExp('^[-*]' + bs + 's+(.*)$');
    var olPattern = new RegExp('^' + bs + 'd+' + bs + '.' + bs + 's+(.*)$');
    function inlineFormat(text) {
      return text
        .replace(inlineCodePattern, '<code>$1</code>')
        .replace(boldPattern, '<strong>$1</strong>')
        .replace(italicPattern, '<em>$1</em>')
        .replace(linkPattern, function (_, label, href) {
          var lowerHref = href.toLowerCase();
          var safeHref = lowerHref.indexOf('https://') === 0 || lowerHref.indexOf('http://') === 0 || lowerHref.indexOf('mailto:') === 0;
          return safeHref ? '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + label + '</a>' : label;
        });
    }
    function flushParagraph() {
      if (paragraph.length) {
        html += '<p>' + inlineFormat(paragraph.join(' ')) + '</p>';
        paragraph = [];
      }
    }
    function closeList() {
      if (listType) {
        html += '</' + listType + '>';
        listType = null;
      }
    }
    function tableCells(line) {
      var value = line.trim();
      if (value.charAt(0) === '|') value = value.slice(1);
      if (value.charAt(value.length - 1) === '|') value = value.slice(0, -1);
      return value.split('|').map(function (cell) { return cell.trim(); });
    }
    function isTableDivider(line) {
      if (line.indexOf('|') < 0) return false;
      var cells = tableCells(line);
      return cells.length > 0 && cells.every(function (cell) {
        var value = cell.replace(/:/g, '').replace(/-/g, '').trim();
        return cell.indexOf('-') >= 0 && value === '';
      });
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (fencePattern.test(line)) {
        if (!inCode) {
          flushParagraph();
          closeList();
          inCode = true;
          codeBuffer = '';
        } else {
          html += '<pre><code>' + codeBuffer + '</code></pre>';
          inCode = false;
        }
        continue;
      }
      if (inCode) {
        codeBuffer += line + '\\n';
        continue;
      }

      if (line.indexOf('|') >= 0 && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
        flushParagraph();
        closeList();
        var headers = tableCells(line);
        html += '<div class="workflow-markdown-table"><table><thead><tr>' + headers.map(function (cell) { return '<th>' + inlineFormat(cell) + '</th>'; }).join('') + '</tr></thead><tbody>';
        i += 2;
        while (i < lines.length && lines[i].indexOf('|') >= 0 && lines[i].trim() !== '') {
          var cells = tableCells(lines[i]);
          html += '<tr>' + headers.map(function (_, index) { return '<td>' + inlineFormat(cells[index] || '') + '</td>'; }).join('') + '</tr>';
          i++;
        }
        html += '</tbody></table></div>';
        i--;
        continue;
      }

      var heading = line.match(headingPattern);
      if (heading) {
        flushParagraph();
        closeList();
        var level = heading[1].length;
        html += '<h' + level + '>' + inlineFormat(heading[2]) + '</h' + level + '>';
        continue;
      }
      if (hrPattern.test(line)) {
        flushParagraph();
        closeList();
        html += '<hr>';
        continue;
      }
      var ul = line.match(ulPattern);
      var ol = line.match(olPattern);
      if (ul || ol) {
        flushParagraph();
        var wantType = ul ? 'ul' : 'ol';
        if (listType !== wantType) {
          closeList();
          html += '<' + wantType + '>';
          listType = wantType;
        }
        html += '<li>' + inlineFormat((ul || ol)[1]) + '</li>';
        continue;
      }
      closeList();

      if (line.trim() === '') {
        flushParagraph();
        continue;
      }
      paragraph.push(line.trim());
    }
    flushParagraph();
    closeList();
    return html || '<p class="hint">Nothing to preview yet.</p>';
  }
`
