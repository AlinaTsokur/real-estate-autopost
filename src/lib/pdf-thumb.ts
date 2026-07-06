import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

export async function pdfToThumb(pdfBuffer: Buffer): Promise<Buffer | null> {
  const id = `pdf-thumb-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const pdfPath = join(tmpdir(), `${id}.pdf`);
  const jpgPath = join(tmpdir(), `${id}.jpg`);

  try {
    await writeFile(pdfPath, pdfBuffer);

    await execFileAsync('/opt/homebrew/bin/gs', [
      '-dNOPAUSE', '-dBATCH', '-dSAFER',
      '-sDEVICE=jpeg', '-r72',
      '-dFirstPage=1', '-dLastPage=1',
      '-dJPEGQ=70',
      `-sOutputFile=${jpgPath}`,
      pdfPath,
    ]);

    const raw = await readFile(jpgPath);

    // Resize to max 320x320 as Telegram requires
    return await sharp(raw)
      .resize(320, 320, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
  } catch {
    return null;
  } finally {
    await unlink(pdfPath).catch(() => {});
    await unlink(jpgPath).catch(() => {});
  }
}
