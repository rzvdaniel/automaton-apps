import { runConvert } from './convert.js';

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
    mode: 'encode',
    type: 'base64',
    inputValue: '',
    outputValue: '',
};

// ── Layout switching ───────────────────────────────────────────────────────────
// Both layouts start in the HTML (ensuring correct first paint from CSS classes).
// On boot and on every xl breakpoint change, we remove the unused layout from the
// DOM so only one set of elements is live at a time.

const xlQuery = window.matchMedia('(min-width: 1280px)');
const mobileLayout = document.querySelector('[data-layout="mobile"]');
const desktopLayout = document.querySelector('[data-layout="desktop"]');
const layoutContainer = mobileLayout?.parentElement;

const swapLayout = ({ matches: isDesktop }) => {
    const [show, hide] = isDesktop
        ? [desktopLayout, mobileLayout]
        : [mobileLayout, desktopLayout];

    if (show?.isConnected && hide?.isConnected) {
        // Initial boot: both in DOM — remove the one we don't need.
        hide.remove();
    } else if (show && !show.isConnected) {
        // Breakpoint change: current active layout is wrong — swap it out.
        hide?.replaceWith(show);
    }

    refreshDomRefs();
    renderModeButtons();
    renderTypeButtons();
    syncFields();
    updateStats();
};

xlQuery.addEventListener('change', swapLayout);

// ── DOM references ─────────────────────────────────────────────────────────────
// Re-queried after every layout swap so we always point at live elements.

let inputs = [], outputs = [], inputStats = [], inputLines = [];
let outputStats = [], outputLines = [], inputMeta = [], outputMeta = [];

const modeButtons = [...document.querySelectorAll('.mode-toggle')];
const typeButtons = [...document.querySelectorAll('.type-toggle')];
const toastContainer = document.querySelector('[data-role="toast-container"]');

const q = (sel) => [...document.querySelectorAll(sel)];

const refreshDomRefs = () => {
    inputs      = q('[data-role="input"]');
    outputs     = q('[data-role="output"]');
    inputStats  = q('[data-role="input-stats"]');
    inputLines  = q('[data-role="input-lines"]');
    outputStats = q('[data-role="output-stats"]');
    outputLines = q('[data-role="output-lines"]');
    inputMeta   = q('[data-role="input-meta"]');
    outputMeta  = q('[data-role="output-meta"]');
};

// ── Theme ──────────────────────────────────────────────────────────────────────

const initTheme = () => {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', saved ? saved === 'dark' : prefersDark);
};

const toggleTheme = () => {
    const isDark = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
};

// ── Button class rendering ─────────────────────────────────────────────────────
// These functions set button.className directly to keep active/inactive state
// in sync. The base class string mirrors what is set in the HTML initially.

const BTN_BASE = 'native-ring min-w-0 flex-1 rounded-[0.6rem] px-1 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] sm:flex-none sm:rounded-[0.9rem] sm:px-4 sm:py-2 sm:text-xs';

const renderModeButtons = () => {
    for (const btn of modeButtons) {
        const active = btn.dataset.mode === state.mode;
        btn.className = `${BTN_BASE} mode-toggle ${active
            ? 'bg-gradient-to-r from-coral to-orange-400 text-white shadow-panel'
            : 'bg-transparent text-[var(--text-secondary)] hover:bg-white/70 dark:hover:bg-white/5'}`;
    }
};

const renderTypeButtons = () => {
    for (const btn of typeButtons) {
        const active = btn.dataset.type === state.type;
        btn.className = `${BTN_BASE} type-toggle ${active
            ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900'
            : 'border border-white/60 bg-white/80 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200'}`;
    }
};

// ── Field sync & stats ─────────────────────────────────────────────────────────

const syncFields = () => {
    for (const el of inputs) {
        if (el.value !== state.inputValue) el.value = state.inputValue;
    }
    for (const el of outputs) {
        if (el.value !== state.outputValue) el.value = state.outputValue;
    }
};

const fmtChars = (v) => {
    const n = v.length;
    return `${n.toLocaleString()} character${n === 1 ? '' : 's'}`;
};

const fmtLines = (v) => {
    const n = v.length ? v.split(/\r?\n/).length : 1;
    return `${n} line${n === 1 ? '' : 's'}`;
};

const updateStats = () => {
    for (const el of inputStats)  el.textContent = fmtChars(state.inputValue);
    for (const el of inputLines)  el.textContent = fmtLines(state.inputValue);
    for (const el of outputStats) el.textContent = fmtChars(state.outputValue);
    for (const el of outputLines) el.textContent = fmtLines(state.outputValue);
    for (const el of inputMeta)   el.textContent = state.inputValue  ? 'Live input'   : 'Ready';
    for (const el of outputMeta)  el.textContent = state.outputValue ? 'Updated'      : 'Synchronized';
};

// ── Conversion ─────────────────────────────────────────────────────────────────

const convert = () => {
    try {
        state.outputValue = runConvert(state.inputValue, state.mode, state.type);
    } catch (err) {
        state.outputValue = '';
        showToast(err.message, 'error');
    }
    syncFields();
    updateStats();
};

// ── Clipboard ──────────────────────────────────────────────────────────────────

const pasteFromClipboard = async () => {
    try {
        state.inputValue = await navigator.clipboard.readText();
        syncFields();
        updateStats();
        convert();
        showToast('Text pasted from clipboard.', 'success');
    } catch {
        showToast('Clipboard access was blocked.', 'error');
    }
};

const copyToClipboard = async () => {
    if (!state.outputValue) {
        showToast('There is no output to copy yet.', 'info');
        return;
    }
    try {
        await navigator.clipboard.writeText(state.outputValue);
        showToast('Output copied to clipboard.', 'success');
    } catch {
        showToast('Copy failed. Try selecting the text manually.', 'error');
    }
};

const clearAll = () => {
    state.inputValue = '';
    state.outputValue = '';
    syncFields();
    updateStats();
    showToast('Both fields cleared.', 'info');
};

// ── Toast ──────────────────────────────────────────────────────────────────────

const TOAST_STYLES = {
    success: 'border-emerald-200/70 bg-emerald-500 text-white dark:border-emerald-400/20 dark:bg-emerald-500',
    error:   'border-rose-200/70 bg-rose-500 text-white dark:border-rose-400/20 dark:bg-rose-500',
    info:    'border-sky-200/70 bg-sky-500 text-white dark:border-sky-400/20 dark:bg-sky-500',
};

const showToast = (message, type = 'success') => {
    const toast = document.createElement('div');
    toast.className = `pointer-events-auto rounded-[1.25rem] border px-4 py-3 text-sm font-semibold shadow-panel ${TOAST_STYLES[type] ?? TOAST_STYLES.info}`;
    toast.textContent = message;
    toast.animate(
        [{ opacity: 0, transform: 'translateY(12px) scale(0.98)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }],
        { duration: 220, easing: 'ease-out' }
    );
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.animate(
            [{ opacity: 1, transform: 'translateY(0) scale(1)' }, { opacity: 0, transform: 'translateY(12px) scale(0.98)' }],
            { duration: 180, easing: 'ease-in', fill: 'forwards' }
        );
        setTimeout(() => toast.remove(), 170);
    }, 2600);
};

// ── Actions ────────────────────────────────────────────────────────────────────

const ACTIONS = {
    'toggle-theme': toggleTheme,
    'paste': pasteFromClipboard,
    'copy': copyToClipboard,
    'clear': clearAll,
};

// ── Event delegation ───────────────────────────────────────────────────────────
// All events are bound to the document once. This avoids rebinding after layout
// swaps and works correctly with dynamically rendered elements.

let debounceTimer;

document.addEventListener('input', (e) => {
    if (!e.target.matches('[data-role="input"]')) return;
    state.inputValue = e.target.value;
    syncFields();
    updateStats();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(convert, 180);
});

document.addEventListener('paste', (e) => {
    if (!e.target.matches('[data-role="input"]')) return;
    setTimeout(() => {
        state.inputValue = e.target.value;
        syncFields();
        convert();
    }, 0);
});

document.addEventListener('click', (e) => {
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
        ACTIONS[actionBtn.dataset.action]?.();
        return;
    }

    const modeBtn = e.target.closest('.mode-toggle');
    if (modeBtn) {
        state.mode = modeBtn.dataset.mode;
        renderModeButtons();
        convert();
        return;
    }

    const typeBtn = e.target.closest('.type-toggle');
    if (typeBtn) {
        state.type = typeBtn.dataset.type;
        renderTypeButtons();
        convert();
    }
});

document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    if (e.key === 'Enter') { e.preventDefault(); convert(); }
    if (e.key.toLowerCase() === 'k') { e.preventDefault(); clearAll(); }
});

// ── Boot ───────────────────────────────────────────────────────────────────────

initTheme();
swapLayout(xlQuery);   // removes unused layout, then initialises DOM refs + renders
