import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

export async function verifySiteIcons(directory, assetPrefix, errors) {
  try {
    const ico = await readFile(join(directory, 'favicon.ico'));
    if (ico.length < 6 || ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1) throw new Error();
    const count = ico.readUInt16LE(4);
    if (count !== 3 || ico.length < 6 + count * 16) throw new Error();
    const sizes = [];
    for (let i = 0; i < count; i++) {
      const offset = 6 + i * 16;
      const width = ico[offset] || 256, height = ico[offset + 1] || 256;
      const length = ico.readUInt32LE(offset + 8), start = ico.readUInt32LE(offset + 12);
      if (width !== height || !length || start < 6 + count * 16 || start + length > ico.length) throw new Error();
      sizes.push(width);
    }
    if (sizes.sort((a, b) => a - b).join(',') !== '16,32,48') throw new Error();
  } catch {
    errors.push('favicon.ico: нужен корректный ICO с изображениями 16/32/48');
  }

  for (const [name, size, opaque] of [
    ['favicon-96x96.png', 96, false], ['apple-touch-icon.png', 180, true],
    ['web-app-manifest-192x192.png', 192, true], ['web-app-manifest-512x512.png', 512, true],
  ]) {
    try {
      const image = sharp(await readFile(join(directory, name)));
      const metadata = await image.metadata();
      if (metadata.format !== 'png' || metadata.width !== size || metadata.height !== size) throw new Error();
      // Decode the image too: a valid PNG header alone does not prove a usable icon.
      const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      if (opaque) for (let p = info.channels - 1; p < data.length; p += info.channels) {
        if (data[p] !== 255) throw new Error();
      }
    } catch {
      errors.push(`${name}: нужен корректный PNG ${size}x${size}${opaque ? ' без прозрачности' : ''}`);
    }
  }

  try {
    const manifest = JSON.parse(await readFile(join(directory, 'site.webmanifest'), 'utf8'));
    if (typeof manifest.name !== 'string' || !manifest.name.trim() || manifest.lang !== 'ru'
      || manifest.id !== '/' || manifest.start_url !== '/' || manifest.scope !== '/' || manifest.display !== 'browser') {
      throw new Error();
    }
    if (!Array.isArray(manifest.icons) || manifest.icons.length !== 2) throw new Error();
    for (const [size, purpose] of [[192, 'any'], [512, 'any maskable']]) {
      const matches = manifest.icons.filter(icon => icon.src === `${assetPrefix}/web-app-manifest-${size}x${size}.png`
        && icon.sizes === `${size}x${size}` && icon.type === 'image/png' && icon.purpose === purpose);
      if (matches.length !== 1) throw new Error();
    }
  } catch {
    errors.push('site.webmanifest: нужны имя, ru, корневые id/start_url/scope, display=browser и PNG 192/512 текущего артефакта');
  }
}
