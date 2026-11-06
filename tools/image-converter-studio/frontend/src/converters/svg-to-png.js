const SVG_MIME_TYPE = 'image/svg+xml';

function readBlobAsText(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read the selected SVG file.'));
    reader.readAsText(blob);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to render the SVG for export.'));
    image.decoding = 'async';
    image.src = src;
  });
}

function parseNumericDimension(value) {
  if (!value) {
    return null;
  }

  const match = String(value).trim().match(/^([0-9]*\.?[0-9]+)/);
  if (!match) {
    return null;
  }

  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getSvgMetadata(svgText) {
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(svgText, SVG_MIME_TYPE);
  const svgElement = documentNode.documentElement;

  if (!svgElement || svgElement.nodeName.toLowerCase() !== 'svg') {
    throw new Error('The provided content is not a valid SVG document.');
  }

  if (documentNode.querySelector('parsererror')) {
    throw new Error('The SVG markup could not be parsed.');
  }

  const width = parseNumericDimension(svgElement.getAttribute('width'));
  const height = parseNumericDimension(svgElement.getAttribute('height'));
  const viewBox = svgElement.getAttribute('viewBox')?.trim().split(/\s+|,/).map(Number) || [];
  const viewBoxWidth = viewBox.length === 4 && Number.isFinite(viewBox[2]) ? viewBox[2] : null;
  const viewBoxHeight = viewBox.length === 4 && Number.isFinite(viewBox[3]) ? viewBox[3] : null;

  const intrinsicWidth = width || viewBoxWidth || 512;
  const intrinsicHeight = height || viewBoxHeight || 512;

  if (!intrinsicWidth || !intrinsicHeight) {
    throw new Error('The SVG must define a width/height or a valid viewBox.');
  }

  return {
    width: intrinsicWidth,
    height: intrinsicHeight,
    aspectRatio: intrinsicWidth / intrinsicHeight
  };
}

export async function extractSvgText(file) {
  const text = await readBlobAsText(file);
  getSvgMetadata(text);
  return text;
}

export async function convertSvgToPng(options) {
  const {
    svgText,
    width,
    height,
    backgroundColor = null,
    pixelRatio = Math.max(window.devicePixelRatio || 1, 1)
  } = options;

  getSvgMetadata(svgText);

  const svgBlob = new Blob([svgText], { type: SVG_MIME_TYPE });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await loadImage(svgUrl);
    const canvas = document.createElement('canvas');
    const exportWidth = Math.max(1, Math.round(width));
    const exportHeight = Math.max(1, Math.round(height));
    canvas.width = Math.max(exportWidth, Math.round(exportWidth * pixelRatio));
    canvas.height = Math.max(exportHeight, Math.round(exportHeight * pixelRatio));

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas rendering is not available in this browser.');
    }

    context.scale(canvas.width / exportWidth, canvas.height / exportHeight);
    context.clearRect(0, 0, exportWidth, exportHeight);

    if (backgroundColor) {
      context.fillStyle = backgroundColor;
      context.fillRect(0, 0, exportWidth, exportHeight);
    }

    context.imageSmoothingEnabled = true;
    context.drawImage(image, 0, 0, exportWidth, exportHeight);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (pngBlob) => {
          if (!pngBlob) {
            reject(new Error('The browser could not encode the PNG output.'));
            return;
          }

          resolve(pngBlob);
        },
        'image/png',
        1
      );
    });

    return {
      blob,
      width: exportWidth,
      height: exportHeight,
      url: URL.createObjectURL(blob)
    };
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
