import { google } from 'googleapis';
import { getGoogleSheetsClient } from './sheets';
import { normalizeText } from '../posts/formatters';
import { getGoogleAuthClient } from './auth';

export async function getGoogleDriveClient() {
  const auth = await getGoogleAuthClient();
  return google.drive({ version: 'v3', auth });
}

export async function getProjectPhotoFolderId(projectName: string): Promise<string> {
  const sheets = await getGoogleSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_CONFIG_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_CONFIG_ID not configured');

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'PROJECT_MEDIA',
  });

  const data = response.data.values || [];
  if (data.length < 2) throw new Error('PROJECT_MEDIA sheet is empty');

  const headers = data[0].map(h => String(h).trim());
  const projectCol = headers.indexOf('Project Name');
  const folderCol = headers.indexOf('Photos Folder URL');

  if (projectCol === -1 || folderCol === -1) {
    throw new Error('PROJECT_MEDIA missing required columns');
  }

  const target = normalizeText(projectName);
  for (let i = 1; i < data.length; i++) {
    if (normalizeText(data[i][projectCol]) === target) {
      const url = String(data[i][folderCol] || '').trim();
      if (!url) throw new Error(`Photos Folder URL is empty for project ${projectName}`);
      
      const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (match) return match[1];
      throw new Error(`Could not parse Folder ID from URL: ${url}`);
    }
  }

  throw new Error(`Project ${projectName} not found in PROJECT_MEDIA`);
}

export async function getDriveImageUrls(folderId: string, limit = 5): Promise<string[]> {
  const drive = await getGoogleDriveClient();

  const res = await drive.files.list({
    q: `'${folderId}' in parents and (mimeType='image/jpeg' or mimeType='image/png' or mimeType='image/webp') and trashed=false`,
    fields: 'files(id, name)',
    orderBy: 'name',
    pageSize: limit,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const files = res.data.files || [];
  return files.filter(f => f.id).map(f => `https://drive.google.com/uc?export=view&id=${f.id}`);
}

export async function getDriveImages(folderId: string, limit = 5): Promise<Buffer[]> {
  const drive = await getGoogleDriveClient();
  
  const res = await drive.files.list({
    q: `'${folderId}' in parents and (mimeType='image/jpeg' or mimeType='image/png' or mimeType='image/webp') and trashed=false`,
    fields: 'files(id, name)',
    orderBy: 'name',
    pageSize: limit,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const files = res.data.files || [];
  if (files.length === 0) return [];

  const buffers: Buffer[] = [];
  
  for (const file of files) {
    if (!file.id) continue;
    const fileRes = await drive.files.get(
      { fileId: file.id, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    buffers.push(Buffer.from(fileRes.data as ArrayBuffer));
  }

  return buffers;
}

export async function uploadCatalogCover(
  fileBuffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<string> {
  const drive = await getGoogleDriveClient();

  // Get or create CATALOG_COVERS folder in the OAuth account's Drive
  const folderName = 'CATALOG_COVERS';
  const folderSearch = await drive.files.list({
    q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    pageSize: 1,
  });

  let folderId: string;
  if (folderSearch.data.files?.length) {
    folderId = folderSearch.data.files[0].id!;
  } else {
    const created = await drive.files.create({
      requestBody: { name: folderName, mimeType: 'application/vnd.google-apps.folder' },
      fields: 'id',
    });
    folderId = created.data.id!;
  }

  // Upload file (overwrite if same name exists)
  const existing = await drive.files.list({
    q: `'${folderId}' in parents and name='${fileName}' and trashed=false`,
    fields: 'files(id)',
    pageSize: 1,
  });

  let fileId: string;
  const { Readable } = await import('stream');
  const stream = Readable.from(fileBuffer);

  if (existing.data.files?.length) {
    const updated = await drive.files.update({
      fileId: existing.data.files[0].id!,
      media: { mimeType, body: stream },
      fields: 'id',
    });
    fileId = updated.data.id!;
  } else {
    const uploaded = await drive.files.create({
      requestBody: { name: fileName, parents: [folderId] },
      media: { mimeType, body: stream },
      fields: 'id',
    });
    fileId = uploaded.data.id!;
  }

  // Make publicly accessible
  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return `https://drive.google.com/uc?export=view&id=${fileId}`;
}

// TODO: cache photo IDs

export async function findC3SlideByUnit(unit: string): Promise<string> {
  const folderId = process.env.GOOGLE_DRIVE_C3_SLIDES_FOLDER_ID;
  if (!folderId) throw new Error('GOOGLE_DRIVE_C3_SLIDES_FOLDER_ID not configured');

  const drive = await getGoogleDriveClient();
  
  const res = await drive.files.list({
    q: `'${folderId}' in parents and (mimeType='image/jpeg' or mimeType='image/png' or mimeType='image/webp') and trashed=false`,
    fields: 'files(id, name)',
    pageSize: 1000,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const files = res.data.files || [];
  if (files.length === 0) throw new Error('No slide images found in C3 folder');

  const targetName = String(unit).toLowerCase().trim();

  const matchedFile = files.find(f => {
    if (!f.name) return false;
    const nameWithoutExt = f.name.replace(/\.[^/.]+$/, '').toLowerCase().trim();
    return nameWithoutExt === targetName;
  });

  if (!matchedFile || !matchedFile.id) {
    throw new Error(`Slide image not found for unit: ${unit}`);
  }

  const fileRes = await drive.files.get(
    { fileId: matchedFile.id, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  
  const buffer = Buffer.from(fileRes.data as ArrayBuffer);
  let mimeType = 'image/jpeg';
  if (matchedFile.name?.toLowerCase().endsWith('.png')) mimeType = 'image/png';
  if (matchedFile.name?.toLowerCase().endsWith('.webp')) mimeType = 'image/webp';
  
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}
