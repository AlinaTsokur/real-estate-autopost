import { NextResponse } from 'next/server';
import { getSheetData, getGoogleSheetsClient } from '@/lib/google/sheets';
import { getGoogleDriveClient } from '@/lib/google/drive';

const OBJECTS_ID = process.env.GOOGLE_SHEETS_OBJECTS_ID ?? '';

const SOLD_VARIANTS    = ['продано через нас', 'продано'];
const REMOVED_VARIANTS = ['снято с продажи', 'снять с продажи', 'снато с продажи'];

function matchesVariant(comment: string, variants: string[]): boolean {
  return variants.some(v => comment === v || comment.startsWith(v + ' ') || comment.startsWith(v + ','));
}

// #f4cccc = sold row highlight
function isSoldColor(bg: { red?: number; green?: number; blue?: number } | null | undefined): boolean {
  if (!bg) return false;
  const r = bg.red   ?? 1;
  const g = bg.green ?? 1;
  const b = bg.blue  ?? 1;
  return Math.abs(r - 0.9568) < 0.03 && Math.abs(g - 0.800) < 0.03 && Math.abs(b - 0.800) < 0.03;
}

async function getUnitCellColors(sheets: Awaited<ReturnType<typeof getGoogleSheetsClient>>, unitColIndex: number): Promise<Map<number, boolean>> {
  const colLetter = String.fromCharCode(65 + unitColIndex);
  const res2 = await sheets.spreadsheets.get({
    spreadsheetId: OBJECTS_ID,
    ranges: [`'Abu Dhabi'!${colLetter}:${colLetter}`],
    fields: 'sheets.data.rowData.values.userEnteredFormat.backgroundColor',
    includeGridData: true,
  });

  const rowData = res2.data.sheets?.[0]?.data?.[0]?.rowData ?? [];
  const colorMap = new Map<number, boolean>();
  rowData.forEach((rd: any, i: number) => {
    const bg = rd?.values?.[0]?.userEnteredFormat?.backgroundColor;
    colorMap.set(i, isSoldColor(bg));
  });
  return colorMap;
}

function normalizeComment(v: unknown): string {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function extractFolderId(urlOrId: unknown): string {
  const s = String(urlOrId ?? '').trim();
  const m = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s;
  return '';
}

// Same pattern as App Script: DF_makeCodePattern_
function makeCodePattern(cleanCode: string): RegExp {
  return new RegExp('(^|[^0-9])#?' + cleanCode + '([^0-9]|$)', 'i');
}

type ExpectedLocation = 'search' | 'sold' | 'removed';

export interface AuditRow {
  rowNum: number;
  unit: string;
  code: string;
  comment: string;
  unitFolderId: string;
  folderName: string;
  expected: ExpectedLocation;
  actualParentId: string;
  actualParentName: string;
  status: 'ok' | 'wrong' | 'not_found' | 'config_missing';
  detail: string;
}

async function listSubfolders(
  drive: Awaited<ReturnType<typeof getGoogleDriveClient>>,
  parentId: string
): Promise<{ id: string; name: string }[]> {
  const items: { id: string; name: string }[] = [];
  let pageToken: string | undefined;
  do {
    const res: any = await drive.files.list({
      q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'nextPageToken,files(id,name)',
      pageSize: 1000,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      ...(pageToken ? { pageToken } : {}),
    });
    for (const f of res.data.files ?? []) items.push({ id: f.id!, name: f.name ?? '' });
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return items;
}

export async function GET() {
  try {
    const drive  = await getGoogleDriveClient();
    const sheets = await getGoogleSheetsClient();

    const [abuRows, cfgRows] = await Promise.all([
      getSheetData(OBJECTS_ID, 'Abu Dhabi') as Promise<unknown[][]>,
      getSheetData(OBJECTS_ID, 'CONFIG_DRIVE') as Promise<unknown[][]>,
    ]);

    // ── Parse CONFIG_DRIVE ──────────────────────────────────────────────────
    const cfgHeaders = (cfgRows[0] ?? []).map(h => String(h).trim());
    const ci = {
      prefix:  cfgHeaders.indexOf('Code Prefix'),
      search:  cfgHeaders.indexOf('Search Folder Link'),
      sold:    cfgHeaders.indexOf('Sold Folder Link'),
      removed: cfgHeaders.indexOf('Removed Folder Link'),
    };

    type PrefixConfig = { searchIds: Set<string>; soldIds: Set<string>; removedIds: Set<string> };
    const prefixMap = new Map<string, PrefixConfig>();
    const allParentIds = new Set<string>(); // all Search/Sold/Removed folder IDs to scan

    for (let i = 1; i < cfgRows.length; i++) {
      const r = cfgRows[i] as unknown[];
      const searchLink = String(r[ci.search] ?? '').trim();
      if (!searchLink) continue;

      const prefix = String(r[ci.prefix] ?? '').replace(/\D/g, '').padStart(4, '0').slice(0, 4);
      if (!prefix || prefix === '0000') continue;

      if (!prefixMap.has(prefix)) prefixMap.set(prefix, { searchIds: new Set(), soldIds: new Set(), removedIds: new Set() });
      const pc = prefixMap.get(prefix)!;

      const sId  = extractFolderId(searchLink);
      const soId = extractFolderId(String(r[ci.sold]    ?? ''));
      const rId  = extractFolderId(String(r[ci.removed] ?? ''));

      if (sId)  { pc.searchIds.add(sId);  allParentIds.add(sId); }
      if (soId) { pc.soldIds.add(soId);   allParentIds.add(soId); }
      if (rId)  { pc.removedIds.add(rId); allParentIds.add(rId); }
    }

    // ── Scan all parent folders → build index ──────────────────────────────
    // folderId → { parentId, parentName, folderName }
    const byId   = new Map<string, { parentId: string; parentName: string; folderName: string }>();
    // parentId → folder name (for display)
    const parentNames = new Map<string, string>();

    const parentIds = [...allParentIds];
    const BATCH = 10;

    for (let i = 0; i < parentIds.length; i += BATCH) {
      await Promise.allSettled(
        parentIds.slice(i, i + BATCH).map(async parentId => {
          let parentName = parentId;
          try {
            const pRes = await drive.files.get({ fileId: parentId, fields: 'name', supportsAllDrives: true });
            parentName = pRes.data.name ?? parentId;
          } catch {}
          parentNames.set(parentId, parentName);

          const children = await listSubfolders(drive, parentId);
          for (const child of children) {
            byId.set(child.id, { parentId, parentName, folderName: child.name });
          }
        })
      );
    }

    // ── Reverse map: parentId → category (for no-code unit lookup) ───────────
    const parentCategory = new Map<string, { category: ExpectedLocation; pc: PrefixConfig }>();
    for (const [, pc] of prefixMap) {
      for (const id of pc.searchIds)  parentCategory.set(id, { category: 'search',  pc });
      for (const id of pc.soldIds)    parentCategory.set(id, { category: 'sold',    pc });
      for (const id of pc.removedIds) parentCategory.set(id, { category: 'removed', pc });
    }

    // ── Parse Abu Dhabi ──────────────────────────────────────────────────────
    const abuHeaders = (abuRows[0] ?? []).map(h => String(h).trim());
    const ai = {
      unit:         abuHeaders.indexOf('Unit'),
      code:         abuHeaders.indexOf('Код'),
      comment:      abuHeaders.indexOf('Комментарии'),
      unitFolderId: abuHeaders.indexOf('Unit Folder ID'),
    };

    // Fetch cell fill colors for Unit column (sold = #f4cccc)
    const soldColorMap = await getUnitCellColors(sheets, ai.unit);

    const results: AuditRow[] = [];

    for (let i = 1; i < abuRows.length; i++) {
      const r = abuRows[i] as unknown[];
      const unit     = String(r[ai.unit] ?? '').trim();
      const code     = String(r[ai.code] ?? '').replace(/\s/g, '').replace(/^#/, '');
      const hasCode  = code.length > 0;
      if (!unit && !code) continue; // skip fully empty rows

      const comment  = normalizeComment(r[ai.comment]);
      const folderId = String(r[ai.unitFolderId] ?? '').trim();

      const isSoldByColor = soldColorMap.get(i) === true;

      // Comment takes priority; color only used when comment gives no signal
      const expected: ExpectedLocation =
        matchesVariant(comment, SOLD_VARIANTS)    ? 'sold' :
        matchesVariant(comment, REMOVED_VARIANTS) ? 'removed' :
        isSoldByColor                             ? 'sold' :
                                                    'search';

      const row: AuditRow = {
        rowNum:           i + 1,
        unit,
        code:             hasCode ? '#' + code : '',
        comment,
        unitFolderId:     folderId,
        folderName:       '',
        expected,
        actualParentId:   '',
        actualParentName: '',
        status:           'ok',
        detail:           '',
      };

      // ── Rows WITH code: prefix-based lookup ──────────────────────────────
      if (hasCode) {
        const prefix = code.replace(/\D/g, '').slice(0, 4);
        const pc = prefixMap.get(prefix);
        if (!pc) {
          row.status = 'config_missing';
          row.detail = `Prefix ${prefix} не найден в CONFIG_DRIVE`;
          results.push(row);
          continue;
        }

        let indexed = folderId ? byId.get(folderId) : undefined;
        if (!indexed) {
          const pattern = makeCodePattern(code);
          for (const [id, info] of byId) {
            if (pattern.test(info.folderName)) { indexed = info; row.unitFolderId = id; break; }
          }
        }

        if (!indexed) {
          row.status = 'not_found';
          row.detail = 'Папка не найдена в Drive';
          results.push(row);
          continue;
        }

        row.folderName       = indexed.folderName;
        row.actualParentId   = indexed.parentId;
        row.actualParentName = indexed.parentName;

        const expectedIds =
          expected === 'sold'    ? pc.soldIds :
          expected === 'removed' ? pc.removedIds :
                                   pc.searchIds;

        row.status = expectedIds.has(indexed.parentId) ? 'ok' : 'wrong';
        if (row.status === 'wrong') {
          row.detail = `Ожидается в: ${[...expectedIds].map(id =>
            `https://drive.google.com/drive/folders/${id}`
          ).join(', ')}`;
        }

      // ── Rows WITHOUT code: search by unit name ───────────────────────────
      } else {
        if (!unit) { results.push(row); continue; }

        let indexed = folderId ? byId.get(folderId) : undefined;
        if (!indexed) {
          const unitLower = unit.toLowerCase();
          for (const [id, info] of byId) {
            if (info.folderName.toLowerCase().includes(unitLower)) {
              indexed = info; row.unitFolderId = id; break;
            }
          }
        }

        if (!indexed) {
          row.status = 'not_found';
          row.detail = 'Папка не найдена в Drive';
          results.push(row);
          continue;
        }

        row.folderName       = indexed.folderName;
        row.actualParentId   = indexed.parentId;
        row.actualParentName = indexed.parentName;

        // Determine correctness via reverse map
        const rev = parentCategory.get(indexed.parentId);
        if (!rev) {
          row.status = 'config_missing';
          row.detail = 'Родительская папка не найдена в CONFIG_DRIVE';
        } else if (rev.category === expected) {
          row.status = 'ok';
        } else {
          row.status = 'wrong';
          const expectedIds =
            expected === 'sold'    ? rev.pc.soldIds :
            expected === 'removed' ? rev.pc.removedIds :
                                     rev.pc.searchIds;
          row.detail = `Ожидается в: ${[...expectedIds].map(id =>
            `https://drive.google.com/drive/folders/${id}`
          ).join(', ')}`;
        }
      }

      results.push(row);
    }

    const ok      = results.filter(r => r.status === 'ok').length;
    const wrong   = results.filter(r => r.status === 'wrong').length;
    const missing = results.filter(r => r.status === 'not_found' || r.status === 'config_missing').length;

    return NextResponse.json({ rows: results, total: results.length, ok, wrong, missing });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
