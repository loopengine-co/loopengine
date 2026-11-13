// The Policies, Special cases and Example buttons, shared by the workflow
// editor (web/agents-config-page.ts) and the plan review screen
// (web/workflow-page.ts): browser code, put into each page's script.
//
// They add what isn't a step to a workflow's instructions: rules that
// always hold, cases that need a different answer, and worked examples.
// Each starts as a template to fill in, at the end of the instructions
// (a run adds its long inputs after them); once the instructions have the
// section, a click adds another item to it.
/** The buttons' look, in the theme's accent, for each page's styles. */
export const WORKFLOW_SECTIONS_CSS = `
  .wp-sections { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  button.wp-section, button.wp-preview { height: 28px; padding: 0 10px; font-size: 12.5px; font-weight: 600; border-radius: 6px; border: 1px solid var(--accent); background: var(--accent-soft); color: var(--accent-ink); cursor: pointer; }
  button.wp-section:hover:not(:disabled), button.wp-preview:hover:not(:disabled) { background: var(--accent); color: var(--on-accent); }
`

export const WORKFLOW_SECTIONS_SCRIPT = String.raw`
  var WORKFLOW_SECTIONS = {
    policies: { label: 'Policies', match: 'policies', heading: 'Policies (always follow these):', item: '- [A rule with its real numbers, e.g. Orders lost for over 15 days are reshipped, not refunded.] (edit this)' },
    cases: { label: 'Special cases', match: 'special cases', heading: 'Special cases (check these before acting; when one applies, follow it over the steps):', item: '- When [what you would notice]: [what to do, and what not to do or promise]. (edit this)' },
    example: { label: 'Example', match: 'example', heading: 'Examples (follow their judgment and tone, not their exact words):', item: 'Situation: [what came in, and what the lookups showed] (edit this)\nGood result: [what the agent should write or do] (edit this)', gap: true },
  };

  function workflowSectionButtonsHtml() {
    return Object.keys(WORKFLOW_SECTIONS).map(function (k) {
      return '<button type="button" class="wp-section" data-section="' + k + '">' + WORKFLOW_SECTIONS[k].label + '</button>';
    }).join('');
  }

  // Where a section ends: its items, and the lines that carry them on
  // (an example's Situation and Good result), blank lines between items
  // included, up to the next part of the instructions.
  function workflowSectionEnd(lines, from) {
    var end = from;
    for (var j = from + 1; j < lines.length; j++) {
      var t = lines[j].trim();
      if (t === '') continue;
      if (/^[-*]/.test(t) || /^(situation|good result)/i.test(t) || lines[j - 1].trim() !== '') { end = j; continue; }
      break;
    }
    return end;
  }

  // Adds the section (or an item to it) to a textarea, and selects its
  // first placeholder to type over. False for an unknown key.
  function addWorkflowSection(area, key) {
    var section = WORKFLOW_SECTIONS[key];
    if (!section) return false;
    var lines = area.value.replace(/\s+$/, '').split('\n');
    // The section's heading, if the instructions already have it.
    var at = -1;
    for (var k = 0; k < lines.length && at < 0; k++) {
      var h = lines[k].trim().toLowerCase();
      if (h.indexOf(section.match) === 0 && h.charAt(h.length - 1) === ':') at = k;
    }
    var before;
    if (at >= 0) {
      var end = workflowSectionEnd(lines, at);
      before = lines.slice(0, end + 1).join('\n');
      var after = lines.slice(end + 1).join('\n').replace(/^\s+/, '');
      area.value = before + '\n' + (section.gap && end > at ? '\n' : '') + section.item + (after ? '\n\n' + after : '');
    } else {
      before = area.value.replace(/\s+$/, '');
      area.value = (before ? before + '\n\n' : '') + section.heading + '\n' + section.item;
    }
    var start = area.value.indexOf('[', before.length);
    area.focus();
    if (start >= 0) area.setSelectionRange(start, area.value.indexOf(']', start) + 1);
    return true;
  }
`
