import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const svgPath = path.join(publicDir, 'icon.svg');

const iconSizes = [180, 192, 512];

await mkdir(publicDir, { recursive: true });

for (const size of iconSizes) {
  const outputPath = path.join(publicDir, `icon-${size}.png`);

  await sharp(svgPath)
    .resize(size, size)
    .png()
    .toFile(outputPath);
}

await writeFile(
  path.join(publicDir, 'icon-generated.json'),
  JSON.stringify({ generatedFrom: 'icon.svg', sizes: iconSizes }, null, 2) + '\n',
  'utf8'
);