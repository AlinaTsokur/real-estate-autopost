import { google } from 'googleapis';
import { getGoogleSheetsClient } from './sheets';
import { normalizeText } from '../parsing/row-parser';
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
      
      const match = url.match(/\\/folders\\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (match) return match[1];
      throw new Error(`Could not parse Folder ID from URL: ${url}`);
    }
  }

  throw new Error(`Project ${projectName} not found in PROJECT_MEDIA`);
}

export async function getDriveImages(folderId: string, limit = 5): Promise<Buffer[]> {
  const drive = await getGoogleDriveClient();
  
  const res = await drive.files.list({
    q: `'${folderId}' in parents and (mimeType='image/jpeg' or mimeType='image/png' or mimeType='image/webp') and trashed=false`,
    fields: 'files(id, name)',
    orderBy: 'name',
    pageSize: limit,
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

// TODO: cache photo IDs
