import { NextResponse } from 'next/server';
import { getSheetData, updatePublicationDate, getGoogleSheetsClient, getProjectParseConfig, getConfig2 } from '@/lib/google/sheets';
import { getDriveImages, getProjectPhotoFolderId } from '@/lib/google/drive';
import { normalizeText } from '@/lib/posts/formatters';
import { sendMediaGroupWithCaption, getBot } from '@/lib/telegram/bot';
import { parseRowByFormat } from '@/lib/parsing/row-parser';
import { buildTelegramHtmlPost } from '@/lib/posts/templates';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Find next C3 unit
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_OBJECTS_ID;
    if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_OBJECTS_ID not configured');

    const data = await getSheetData(spreadsheetId, 'OBJECTS');
    if (data.length < 2) throw new Error('OBJECTS sheet is empty');

    const headers = data[0].map(h => normalizeText(String(h).trim()));
    const projectCol = headers.findIndex(h => h === normalizeText('Project Name') || h === normalizeText('Проект'));
    const codeCol = headers.findIndex(h => h === normalizeText('Code'));
    const unitCol = headers.findIndex(h => h === normalizeText('Unit'));
    const dateCol = headers.findIndex(h => h === normalizeText('Publication Date') || h === normalizeText('Дата публикации') || h === normalizeText('Output Date'));
    
    if (projectCol === -1 || (codeCol === -1 && unitCol === -1)) {
      throw new Error('Required columns missing in OBJECTS');
    }

    const c3Project = normalizeText('C3 Garden Residence');
    let candidates: any[] = [];

    for (let i = 1; i < data.length; i++) {
      if (normalizeText(data[i][projectCol]) === c3Project) {
        const dateStr = dateCol !== -1 ? String(data[i][dateCol] || '').trim() : '';
        const code = codeCol !== -1 ? String(data[i][codeCol] || '').trim() : '';
        const unit = unitCol !== -1 ? String(data[i][unitCol] || '').trim() : '';
        
        candidates.push({ rowIndex: i, code, unit, dateStr, rowData: data[i] });
      }
    }

    if (candidates.length === 0) {
      return NextResponse.json({ error: 'No C3 units found' }, { status: 404 });
    }

    // Sort: Empty dates first, then oldest dates
    candidates.sort((a, b) => {
      if (!a.dateStr && b.dateStr) return -1;
      if (a.dateStr && !b.dateStr) return 1;
      if (!a.dateStr && !b.dateStr) return 0;
      // Basic date parsing assumption (dd.mm.yyyy or mm/dd/yyyy)
      // For MVP, simple string comparison might suffice if formats are consistent, but let's try to parse
      const da = new Date(a.dateStr.split('.').reverse().join('-')).getTime();
      const db = new Date(b.dateStr.split('.').reverse().join('-')).getTime();
      return da - db;
    });

    const nextUnit = candidates[0];
    const unitCode = nextUnit.code || nextUnit.unit;

    if (!unitCode) {
      return NextResponse.json({ error: 'Selected C3 unit has no code or unit' }, { status: 400 });
    }

    // 2. Fetch C3 slide from Drive
    // The prompt says: "C3 slides should be stored in Google Drive folder. Match slide by unit/code filename, for example G05.jpg, 207.jpg"
    const c3FolderId = process.env.GOOGLE_DRIVE_C3_SLIDES_FOLDER_ID;
    if (!c3FolderId) throw new Error('GOOGLE_DRIVE_C3_SLIDES_FOLDER_ID not configured');

    const drive = await import('@/lib/google/drive').then(m => m.getGoogleDriveClient());
    const res = await drive.files.list({
      q: `'${c3FolderId}' in parents and name contains '${unitCode}' and trashed=false`,
      fields: 'files(id, name)',
    });

    const files = res.data.files || [];
    if (files.length === 0) {
      // Log error, don't send
      console.error(`No slide found for C3 unit ${unitCode}`);
      return NextResponse.json({ error: `No slide found for C3 unit ${unitCode}` }, { status: 404 });
    }

    const fileId = files[0].id!;
    const fileRes = await drive.files.get({ fileId: fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    const slideBuffer = Buffer.from(fileRes.data as ArrayBuffer);

    // 3. Generate Post Text
    // For MVP, we will just construct the text here or call our template builder
    // We would need the full row data to pass into parseRowByFormat.
    // Instead of doing it all here, we can reuse the logic:
    const config = await import('@/lib/google/sheets').then(m => m.getProjectParseConfig('C3 Garden Residence'));
    const parsed = await import('@/lib/parsing/row-parser').then(m => m.parseRowByFormat(nextUnit.rowData, config, 'C3 Garden Residence'));
    
    // C3 specific auto values
    parsed.handover = 'Ready to move';
    // We would need the approxRentalRate, let's just skip fetching it here for brevity or fetch if rentalCol exists
    const rentalCol = headers.findIndex(h => h === normalizeText('Approx. rental rate'));
    parsed.approxRentalRate = rentalCol !== -1 ? nextUnit.rowData[rentalCol] : '';

    const telegramHtml = await import('@/lib/posts/templates').then(m => m.buildTelegramHtmlPost({ ...parsed, postType: 'READY_TO_MOVE' } as any));

    // Send to Review Group
    const chatId = process.env.TELEGRAM_REVIEW_CHAT_ID;
    if (!chatId) throw new Error('TELEGRAM_REVIEW_CHAT_ID not configured');

    const media: any[] = [{ type: 'photo', media: { source: slideBuffer } }];
    await sendMediaGroupWithCaption(chatId, media, telegramHtml, unitCode);

    return NextResponse.json({ ok: true, sentUnit: unitCode });
  } catch (error: any) {
    console.error('C3 Cron error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
