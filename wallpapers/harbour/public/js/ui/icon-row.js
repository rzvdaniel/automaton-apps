/**
 * A row of round buttons, one of them chosen: the settings panel's way to pick one of a few things (weather, wind, waves...).
 * Each button is about 44 px (the touch-target size), carries an icon and a label (`title` and visually hidden text), and
 * says whether it is the chosen one with `aria-pressed`. A button without an icon is a text pill instead.
 * The model (`states`) and the markup are plain functions so tests can read them; `show` and `onPick` work on the page.
 */
export class IconRow {
  /** The options with `pressed` added: true for the one whose value is `value`, false for the rest. */
  static states(options, value) {
    return options.map(o => ({ ...o, pressed: String(o.value) === String(value) }));
  }

  /**
   * The row's markup.
   * @param {{ id: string, labelId: string, options: { value: string | number, label: string, icon?: string }[], value?: string | number | null }} row
   * `labelId` is the id of the heading that names the row; `icon` is inline SVG markup.
   */
  static markup({ id, labelId, options, value = null }) {
    const esc = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const buttons = IconRow.states(options, value).map(o => o.icon
      ? `<button type="button" class="icon-btn" data-value="${esc(o.value)}" title="${esc(o.label)}" aria-pressed="${o.pressed}">${o.icon}<span class="a-sr">${esc(o.label)}</span></button>`
      : `<button type="button" class="icon-btn icon-btn--text" data-value="${esc(o.value)}" title="${esc(o.label)}" aria-pressed="${o.pressed}">${esc(o.label)}</button>`).join('');
    return `<div class="icon-row" id="${id}" role="group" aria-labelledby="${labelId}">${buttons}</div>`;
  }

  /** Marks the button whose value is `value` as chosen, and no other. */
  static show(group, value) {
    group.querySelectorAll('button[data-value]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value) === String(value) ? 'true' : 'false'));
  }

  /** Calls `fn(value)` (a string) when a button of the row is pressed. */
  static onPick(group, fn) {
    group.addEventListener('click', e => {
      const b = e.target?.closest?.('button[data-value]');
      if (b) fn(b.dataset.value);
    });
  }
}
