// Таблица-черновик для ручного заполнения каталога в Meta Commerce Manager.
// Собирается по всем проектам разом, без обложек — из неё копируют заголовок
// и текст.
//
// Главная особенность раскладки: описание разложено по строкам, каждая строка
// в своей ячейке. Если положить весь текст в одну ячейку, Google Sheets при
// копировании оборачивает его в кавычки — а так выделяешь столбик ячеек и
// вставляешь чистый текст с переносами.
import { google } from 'googleapis';
import { getGoogleAuthClient } from '@/lib/google/auth';
import { listAllAvailableUnits } from '@/lib/units-db/units';
import { mapRawUnitToPostData } from '@/lib/units-db/map';
import { listProjectMeta } from '@/lib/post-meta/emoji';
import { selectLowestByExactType } from '@/lib/parsing/table-parser';
import { buildCatalogRow } from '@/lib/catalog/build-row';

const FOLDER_ID = '1Wrxwg7BAAlc7eyG3WhTJmvh3Wd1Qa8Xh'; // «Каталоги Whats» на общем диске

const HEADERS = ['Проект', 'Тип', 'Заголовок', 'Описание', 'Цена', 'Площадь, м²', 'Спален'];

export interface DraftResult {
  url: string;
  title: string;
  projects: number;
  listings: number;
}

export async function buildCatalogDraftSheet(): Promise<DraftResult> {
  const [raws, metas] = await Promise.all([listAllAvailableUnits(), listProjectMeta()]);
  if (!raws.length) throw new Error('В базе нет доступных юнитов Абу-Даби');

  const metaByProject = new Map(metas.map(m => [m.projectId, m]));

  // Группируем по проекту, внутри проекта оставляем самый дешёвый юнит на тип.
  const byProject = new Map<string, typeof raws>();
  for (const r of raws) {
    const list = byProject.get(r.project_name) ?? [];
    list.push(r);
    byProject.set(r.project_name, list);
  }

  const rows: string[][] = [HEADERS];
  let listings = 0;

  for (const projectName of [...byProject.keys()].sort()) {
    const projectRaws = byProject.get(projectName)!;
    const meta = metaByProject.get(projectRaws[0].project_id);
    const island = meta?.island || projectRaws[0].island || '';
    const emoji = meta?.emoji || '';

    const mapped = projectRaws
      .map(raw => mapRawUnitToPostData(raw, emoji))
      .filter(p => p.type && Number(p.sellingPrice) > 0)
      .map(p => ({ ...p, sellingPriceNumber: Number(p.sellingPrice) }));
    if (!mapped.length) continue;

    for (const item of selectLowestByExactType(mapped) as any[]) {
      const card = buildCatalogRow(
        {
          code: item.code || '',
          type: item.type || '',
          objectType: item.objectType || 'Apartment',
          view: item.view || '',
          sellingPrice: String(item.sellingPrice || ''),
          areaM2: String(item.areaM2 || ''),
          grossAreaM2: String(item.grossAreaM2 || ''),
          plotAreaM2: String(item.plotAreaM2 || ''),
          unit: item.unit || '',
          handover: item.handover || '',
        },
        projectName, island, emoji, '', [],
      );

      const lines = card.description.split('\n');
      lines.forEach((line, i) => {
        rows.push(i === 0
          ? [projectName, item.type || '', card.name, line, card.price, card.area_size, card.num_beds]
          : ['', '', '', line, '', '', '']);
      });
      rows.push(['', '', '', '', '', '', '']); // пустая строка между карточками
      listings++;
    }
  }

  const auth = await getGoogleAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const drive = google.drive({ version: 'v3', auth });

  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const title = `${stamp} Каталог`;

  // Создаём сразу в нужной папке — иначе файл упадёт в «Мой диск» владельца токена.
  const file = await drive.files.create({
    requestBody: { name: title, mimeType: 'application/vnd.google-apps.spreadsheet', parents: [FOLDER_ID] },
    fields: 'id',
    supportsAllDrives: true,
  });
  const spreadsheetId = file.data.id!;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'A1',
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });

  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const sheetId = meta.data.sheets![0].properties!.sheetId!;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        // шапка: закреплена, выделена цветом, по центру
        { updateSheetProperties: {
          properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
          fields: 'gridProperties.frozenRowCount',
        } },
        { repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: { userEnteredFormat: {
            backgroundColor: { red: 0.85, green: 0.93, blue: 1 },
            textFormat: { bold: true },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
          } },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
        } },
        // данные: прижаты к верху, текст не переносится — иначе строки описания
        // разъезжаются по высоте и столбик неудобно выделять
        { repeatCell: {
          range: { sheetId, startRowIndex: 1 },
          cell: { userEnteredFormat: { verticalAlignment: 'TOP', wrapStrategy: 'CLIP' } },
          fields: 'userEnteredFormat(verticalAlignment,wrapStrategy)',
        } },
        // ширины: описанию много, служебным колонкам мало
        { updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 2 },
          properties: { pixelSize: 170 }, fields: 'pixelSize',
        } },
        { updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 },
          properties: { pixelSize: 330 }, fields: 'pixelSize',
        } },
        { updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 },
          properties: { pixelSize: 460 }, fields: 'pixelSize',
        } },
        { updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 7 },
          properties: { pixelSize: 110 }, fields: 'pixelSize',
        } },
      ],
    },
  });

  return {
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    title,
    projects: byProject.size,
    listings,
  };
}
