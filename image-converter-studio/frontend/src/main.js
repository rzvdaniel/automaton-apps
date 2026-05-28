import './style.css';
import { convertSvgToPng, extractSvgText, getSvgMetadata } from './converters/svg-to-png.js';

const PRESETS = [128, 256, 512, 1024];

const state = {
  svgText: '',
  metadata: null,
  width: 512,
  height: 512,
  keepAspectRatio: true,
  useBackground: false,
  backgroundColor: '#10141f',
  isDragging: false,
  isConverting: false,
  convertedImage: null,
  error: '',
  success: '',
  activePreset: 512,
  fileName: 'converted-image',
  sourceMode: 'upload',
  editorExpanded: false,
  conversionVersion: 0
};

const app = document.querySelector('#app');

app.innerHTML = `
  <div class="shell">
    <div class="shell__glow shell__glow--left"></div>
    <div class="shell__glow shell__glow--right"></div>
    <header class="hero">
      <div class="hero__content">
        <h1>Image Converter Studio</h1>
        <p class="subtitle">Convert and export images directly in your browser.</p>
      </div>
    </header>
    <main class="workspace" aria-live="polite">
      <section class="panel panel--upload" aria-labelledby="upload-title">
        <div class="panel__header">
          <div>
            <p class="panel__kicker">Source</p>
            <h2 id="upload-title">Drop an SVG or paste the markup</h2>
          </div>
        </div>
        <div class="source-switcher" role="tablist" aria-label="Source input mode">
          <button id="source-upload-tab" class="source-tab source-tab--active" type="button" role="tab" aria-selected="true">Upload file</button>
          <button id="source-editor-tab" class="source-tab" type="button" role="tab" aria-selected="false">Paste source</button>
        </div>
        <label class="dropzone" id="dropzone" tabindex="0" for="svg-file-input">
          <input id="svg-file-input" class="sr-only" type="file" accept=".svg,image/svg+xml" />
          <div class="dropzone__icon" aria-hidden="true"></div>
          <div class="dropzone__copy">
            <strong id="dropzone-title">Drag and drop your SVG here</strong>
            <span id="dropzone-subtitle">or click to upload from your device</span>
          </div>
          <div id="dropzone-hint" class="dropzone__hint">Transparent PNG export, sharp scaling, and instant preview.</div>
        </label>
        <div class="editor-toggle-row">
          <div class="editor-toggle-copy">
            <strong>Raw SVG editor</strong>
            <span>Use the source editor for direct markup changes and live export updates.</span>
          </div>
          <button id="editor-toggle" class="ghost-button" type="button" aria-expanded="false">Open source editor</button>
        </div>
        <div class="editor-block" id="editor-block" hidden>
          <div class="editor-block__header">
            <label for="svg-editor">Raw SVG editor</label>
            <button id="clear-input" class="ghost-button" type="button">Clear</button>
          </div>
          <textarea
            id="svg-editor"
            spellcheck="false"
            placeholder="Paste raw SVG markup here to preview and export."
          ></textarea>
        </div>
        <div id="status-banner" class="status-banner" hidden></div>
      </section>

      <section class="panel panel--controls" aria-labelledby="controls-title">
        <div class="panel__header">
          <div>
            <p class="panel__kicker">Export</p>
            <h2 id="controls-title">PNG output settings</h2>
          </div>
        </div>
        <div class="preset-grid" id="preset-grid"></div>
        <div class="control-grid">
          <label class="field">
            <span>Width</span>
            <input id="width-input" type="number" min="1" step="1" inputmode="numeric" />
          </label>
          <label class="field">
            <span>Height</span>
            <input id="height-input" type="number" min="1" step="1" inputmode="numeric" />
          </label>
        </div>
        <button id="convert-button" class="primary-button" type="button" disabled>Download PNG</button>
        <div class="advanced-controls">
          <div class="advanced-controls__header">Advanced options</div>
          <label class="toggle">
            <input id="aspect-ratio-toggle" type="checkbox" checked />
            <span>Keep aspect ratio</span>
          </label>
          <label class="toggle">
            <input id="background-toggle" type="checkbox" />
            <span>Use solid background</span>
          </label>
          <label class="field" id="background-field" hidden>
            <span>Background color</span>
            <input id="background-color-input" type="color" value="#10141f" />
          </label>
        </div>
        <p class="fine-print">More formats coming soon: PNG to WebP, JPG to PNG, PNG to ICO, and batch conversion.</p>
      </section>

      <section class="panel panel--preview" aria-labelledby="preview-title">
        <div class="panel__header">
          <div>
            <p class="panel__kicker">Preview</p>
            <h2 id="preview-title">Live preview</h2>
          </div>
        </div>
        <div class="preview-grid">
          <article class="preview-card">
            <div class="preview-card__header">
              <span>SVG preview</span>
              <small id="svg-dimensions">Waiting for input</small>
            </div>
            <div class="preview-surface checkerboard" id="svg-preview-surface">
              <div class="empty-state" id="svg-empty-state">
                <h3>Your source preview appears here</h3>
                <p>Drop an SVG file, paste markup, or try one of your design assets.</p>
              </div>
              <div id="svg-preview" class="preview-render" hidden></div>
            </div>
          </article>
          <article class="preview-card">
            <div class="preview-card__header">
              <span>Generated PNG</span>
              <small id="png-dimensions">No export yet</small>
            </div>
            <button class="preview-surface preview-surface--interactive checkerboard" id="png-preview-surface" type="button" aria-label="Download generated PNG" aria-disabled="true" tabindex="-1">
              <div class="empty-state" id="png-empty-state">
                <h3>PNG export appears instantly</h3>
                <p>Upload an SVG and the download-ready result will appear here automatically.</p>
              </div>
              <img id="png-preview" alt="Generated PNG preview" hidden />
              <div id="png-ready-badge" class="preview-badge" hidden>Ready to download</div>
            </button>
          </article>
        </div>
      </section>
    </main>
  </div>
`;

const elements = {
  dropzone: document.querySelector('#dropzone'),
  fileInput: document.querySelector('#svg-file-input'),
  sourceUploadTab: document.querySelector('#source-upload-tab'),
  sourceEditorTab: document.querySelector('#source-editor-tab'),
  dropzoneTitle: document.querySelector('#dropzone-title'),
  dropzoneSubtitle: document.querySelector('#dropzone-subtitle'),
  dropzoneHint: document.querySelector('#dropzone-hint'),
  editorToggle: document.querySelector('#editor-toggle'),
  editorBlock: document.querySelector('#editor-block'),
  editor: document.querySelector('#svg-editor'),
  clearInput: document.querySelector('#clear-input'),
  statusBanner: document.querySelector('#status-banner'),
  presetGrid: document.querySelector('#preset-grid'),
  widthInput: document.querySelector('#width-input'),
  heightInput: document.querySelector('#height-input'),
  aspectRatioToggle: document.querySelector('#aspect-ratio-toggle'),
  backgroundToggle: document.querySelector('#background-toggle'),
  backgroundField: document.querySelector('#background-field'),
  backgroundColorInput: document.querySelector('#background-color-input'),
  convertButton: document.querySelector('#convert-button'),
  svgPreview: document.querySelector('#svg-preview'),
  svgEmptyState: document.querySelector('#svg-empty-state'),
  pngPreviewSurface: document.querySelector('#png-preview-surface'),
  pngPreview: document.querySelector('#png-preview'),
  pngEmptyState: document.querySelector('#png-empty-state'),
  pngReadyBadge: document.querySelector('#png-ready-badge'),
  svgDimensions: document.querySelector('#svg-dimensions'),
  pngDimensions: document.querySelector('#png-dimensions')
};

function revokeConvertedUrl() {
  if (state.convertedImage?.url) {
    URL.revokeObjectURL(state.convertedImage.url);
  }
}

function setStatus(type, message) {
  state.error = type === 'error' ? message : '';
  state.success = '';

  if (!message) {
    elements.statusBanner.hidden = true;
    elements.statusBanner.textContent = '';
    elements.statusBanner.className = 'status-banner';
    return;
  }

  elements.statusBanner.hidden = false;
  elements.statusBanner.textContent = message;
  elements.statusBanner.className = `status-banner status-banner--${type}`;
}

function sanitizeFileName(name) {
  return (name || 'converted-image')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'converted-image';
}

function syncSizeInputs(changedDimension) {
  if (!state.metadata || !state.keepAspectRatio) {
    return;
  }

  if (changedDimension === 'width') {
    state.height = Math.max(1, Math.round(state.width / state.metadata.aspectRatio));
  }

  if (changedDimension === 'height') {
    state.width = Math.max(1, Math.round(state.height * state.metadata.aspectRatio));
  }
}

function updatePresetState() {
  const activePreset = PRESETS.find((preset) => preset === state.width && preset === state.height) || null;
  state.activePreset = activePreset;
}

function renderPresets() {
  elements.presetGrid.innerHTML = PRESETS.map((preset) => `
    <button class="preset ${state.activePreset === preset ? 'preset--active' : ''}" type="button" data-preset="${preset}">
      <strong>${preset}x${preset} px</strong>
    </button>
  `).join('') + `
    <button class="preset ${state.activePreset === null ? 'preset--active' : ''}" type="button" data-preset="custom">
      <strong>Custom size</strong>
    </button>
  `;
}

function renderSvgPreview() {
  if (!state.svgText || !state.metadata) {
    elements.svgPreview.hidden = true;
    elements.svgPreview.innerHTML = '';
    elements.svgEmptyState.hidden = false;
    elements.svgDimensions.textContent = 'Waiting for input';
    return;
  }

  elements.svgPreview.hidden = false;
  elements.svgEmptyState.hidden = true;
  elements.svgPreview.innerHTML = state.svgText;
  elements.svgDimensions.textContent = `${Math.round(state.metadata.width)} x ${Math.round(state.metadata.height)} source`;
}

function renderPngPreview() {
  if (!state.convertedImage) {
    elements.pngPreview.hidden = true;
    elements.pngPreview.removeAttribute('src');
    elements.pngEmptyState.hidden = false;
    elements.pngDimensions.textContent = 'No export yet';
    elements.pngReadyBadge.hidden = true;
    elements.convertButton.disabled = true;
    elements.convertButton.textContent = state.isConverting ? 'Rendering PNG...' : 'Download PNG';
    elements.pngPreviewSurface.classList.remove('preview-surface--ready');
    elements.pngPreviewSurface.setAttribute('aria-disabled', 'true');
    elements.pngPreviewSurface.tabIndex = -1;
    elements.pngPreviewSurface.title = '';
    return;
  }

  elements.pngPreview.hidden = false;
  elements.pngPreview.src = state.convertedImage.url;
  elements.pngEmptyState.hidden = true;
  elements.pngDimensions.textContent = `${state.convertedImage.width} x ${state.convertedImage.height} PNG ready`;
  elements.pngReadyBadge.hidden = false;
  elements.convertButton.disabled = false;
  elements.convertButton.textContent = 'Download PNG';
  elements.pngPreviewSurface.classList.add('preview-surface--ready');
  elements.pngPreviewSurface.setAttribute('aria-disabled', 'false');
  elements.pngPreviewSurface.tabIndex = 0;
  elements.pngPreviewSurface.title = 'Click preview to download PNG';
}

function renderControls() {
  elements.widthInput.value = String(state.width);
  elements.heightInput.value = String(state.height);
  elements.aspectRatioToggle.checked = state.keepAspectRatio;
  elements.backgroundToggle.checked = state.useBackground;
  elements.backgroundField.hidden = !state.useBackground;
  elements.backgroundColorInput.value = state.backgroundColor;
  elements.convertButton.disabled = state.isConverting || !state.convertedImage;
  elements.convertButton.textContent = state.isConverting ? 'Rendering PNG...' : 'Download PNG';
  elements.dropzone.classList.toggle('is-dragging', state.isDragging);
  elements.sourceUploadTab.classList.toggle('source-tab--active', state.sourceMode === 'upload');
  elements.sourceUploadTab.setAttribute('aria-selected', String(state.sourceMode === 'upload'));
  elements.sourceEditorTab.classList.toggle('source-tab--active', state.sourceMode === 'editor');
  elements.sourceEditorTab.setAttribute('aria-selected', String(state.sourceMode === 'editor'));
  elements.dropzoneTitle.textContent = state.sourceMode === 'upload' ? 'Drag and drop your SVG here' : 'Paste raw SVG markup';
  elements.dropzoneSubtitle.textContent = state.sourceMode === 'upload' ? 'or click to upload from your device' : 'Use the source editor below for live preview and PNG export';
  elements.dropzoneHint.textContent = state.sourceMode === 'upload'
    ? 'Transparent PNG export, sharp scaling, and instant preview.'
    : 'Raw SVG changes re-render the PNG output automatically.';
  elements.editorBlock.hidden = !state.editorExpanded;
  elements.editorToggle.setAttribute('aria-expanded', String(state.editorExpanded));
  elements.editorToggle.textContent = state.editorExpanded ? 'Hide source editor' : 'Open source editor';
  renderPresets();
}

function render() {
  renderControls();
  renderSvgPreview();
  renderPngPreview();
}

function resetExport() {
  revokeConvertedUrl();
  state.convertedImage = null;
}

async function refreshConvertedImage(options = {}) {
  const { silent = false } = options;

  if (!state.svgText || !state.metadata) {
    resetExport();
    render();
    return;
  }

  const currentVersion = ++state.conversionVersion;
  state.isConverting = true;
  if (!silent) {
    setStatus('', '');
  }
  render();

  try {
    const nextImage = await convertSvgToPng({
      svgText: state.svgText,
      width: state.width,
      height: state.height,
      backgroundColor: state.useBackground ? state.backgroundColor : null
    });

    if (currentVersion !== state.conversionVersion) {
      URL.revokeObjectURL(nextImage.url);
      return;
    }

    resetExport();
    state.convertedImage = nextImage;
  } catch (error) {
    if (currentVersion !== state.conversionVersion) {
      return;
    }

    resetExport();
    setStatus('error', error.message || 'The SVG could not be converted.');
  } finally {
    if (currentVersion === state.conversionVersion) {
      state.isConverting = false;
      render();
    }
  }
}

function applySvgText(svgText, fileName = state.fileName) {
  const metadata = getSvgMetadata(svgText);
  state.svgText = svgText;
  state.metadata = metadata;
  state.fileName = sanitizeFileName(fileName);
  state.editorExpanded = state.sourceMode === 'editor';
  state.width = Math.round(metadata.width);
  state.height = Math.round(metadata.height);
  elements.editor.value = svgText;
  updatePresetState();
  resetExport();
  setStatus('', '');
  render();
  void refreshConvertedImage();
}

async function handleFileSelection(file) {
  if (!file) {
    return;
  }

  try {
    const svgText = await extractSvgText(file);
    applySvgText(svgText, file.name);
  } catch (error) {
    setStatus('error', error.message || 'The selected file is not a valid SVG.');
  }
}

function handleDownload() {
  if (!state.convertedImage) {
    return;
  }

  const link = document.createElement('a');
  link.href = state.convertedImage.url;
  link.download = `${state.fileName || 'converted-image'}-${state.convertedImage.width}x${state.convertedImage.height}.png`;
  link.click();
}

elements.fileInput.addEventListener('change', async (event) => {
  const [file] = event.target.files || [];
  await handleFileSelection(file);
  event.target.value = '';
});

elements.dropzone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    elements.fileInput.click();
  }
});

['dragenter', 'dragover'].forEach((eventName) => {
  elements.dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    state.isDragging = true;
    renderControls();
  });
});

['dragleave', 'dragend', 'drop'].forEach((eventName) => {
  elements.dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    state.isDragging = false;
    renderControls();
  });
});

elements.dropzone.addEventListener('drop', async (event) => {
  const [file] = event.dataTransfer?.files || [];
  await handleFileSelection(file);
});

elements.sourceUploadTab.addEventListener('click', () => {
  state.sourceMode = 'upload';
  state.editorExpanded = false;
  renderControls();
});

elements.sourceEditorTab.addEventListener('click', () => {
  state.sourceMode = 'editor';
  state.editorExpanded = true;
  renderControls();
  elements.editor.focus();
});

elements.editorToggle.addEventListener('click', () => {
  state.editorExpanded = !state.editorExpanded;
  if (state.editorExpanded) {
    state.sourceMode = 'editor';
  }
  renderControls();
  if (state.editorExpanded) {
    elements.editor.focus();
  }
});

elements.editor.addEventListener('input', (event) => {
  const nextValue = event.target.value.trim();
  if (!nextValue) {
    state.svgText = '';
    state.metadata = null;
    state.conversionVersion += 1;
    resetExport();
    setStatus('', '');
    render();
    return;
  }

  try {
    state.sourceMode = 'editor';
    state.editorExpanded = true;
    applySvgText(nextValue);
  } catch (error) {
    state.svgText = nextValue;
    state.metadata = null;
    resetExport();
    render();
    setStatus('error', error.message || 'The SVG markup is invalid.');
  }
});

elements.clearInput.addEventListener('click', () => {
  elements.editor.value = '';
  state.svgText = '';
  state.metadata = null;
  state.fileName = 'converted-image';
  state.conversionVersion += 1;
  resetExport();
  setStatus('', '');
  render();
});

elements.widthInput.addEventListener('input', (event) => {
  const width = Math.max(1, Number.parseInt(event.target.value, 10) || 1);
  state.width = width;
  syncSizeInputs('width');
  updatePresetState();
  render();
  void refreshConvertedImage({ silent: true });
});

elements.heightInput.addEventListener('input', (event) => {
  const height = Math.max(1, Number.parseInt(event.target.value, 10) || 1);
  state.height = height;
  syncSizeInputs('height');
  updatePresetState();
  render();
  void refreshConvertedImage({ silent: true });
});

elements.aspectRatioToggle.addEventListener('change', (event) => {
  state.keepAspectRatio = event.target.checked;
  if (state.keepAspectRatio && state.metadata) {
    syncSizeInputs('width');
  }
  render();
  void refreshConvertedImage({ silent: true });
});

elements.backgroundToggle.addEventListener('change', (event) => {
  state.useBackground = event.target.checked;
  renderControls();
  void refreshConvertedImage({ silent: true });
});

elements.backgroundColorInput.addEventListener('input', (event) => {
  state.backgroundColor = event.target.value;
  void refreshConvertedImage({ silent: true });
});

elements.presetGrid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-preset]');
  if (!button) {
    return;
  }

  const { preset } = button.dataset;
  if (preset === 'custom') {
    state.activePreset = null;
    renderPresets();
    return;
  }

  const size = Number.parseInt(preset, 10);
  state.width = size;
  state.height = size;
  state.activePreset = size;
  render();
  void refreshConvertedImage({ silent: true });
});

elements.convertButton.addEventListener('click', handleDownload);

elements.pngPreviewSurface.addEventListener('click', handleDownload);

window.addEventListener('beforeunload', () => {
  revokeConvertedUrl();
});

render();
