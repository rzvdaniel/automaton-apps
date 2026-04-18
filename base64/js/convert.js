/**
 * Encodes a UTF-8 string to Base64.
 * Uses TextEncoder to correctly handle multi-byte characters.
 */
export const encodeBase64 = (value) => {
    try {
        const bytes = new TextEncoder().encode(value);
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        return btoa(binary);
    } catch {
        throw new Error('Unable to encode this input as Base64.');
    }
};

/**
 * Decodes a Base64 string to UTF-8.
 * Strips whitespace before decoding to tolerate line-wrapped Base64.
 */
export const decodeBase64 = (value) => {
    try {
        const binary = atob(value.replace(/\s+/g, ''));
        return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
    } catch {
        throw new Error('Invalid Base64 input.');
    }
};

/**
 * Escapes HTML special characters to their entity equivalents.
 */
export const encodeHtml = (value) => {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' };
    return value.replace(/[&<>"']/g, c => entities[c]);
};

/**
 * Decodes HTML entities back to plain text.
 * Delegates to a temporary textarea to leverage the browser's own parser.
 */
export const decodeHtml = (value) => {
    const el = document.createElement('textarea');
    el.innerHTML = value;
    return el.value;
};

/**
 * Runs the conversion for the current state and returns the result string.
 * Throws on invalid input so the caller can display an error.
 */
export const runConvert = (inputValue, mode, type) => {
    if (!inputValue) return '';
    return type === 'base64'
        ? (mode === 'encode' ? encodeBase64(inputValue) : decodeBase64(inputValue))
        : (mode === 'encode' ? encodeHtml(inputValue) : decodeHtml(inputValue));
};
