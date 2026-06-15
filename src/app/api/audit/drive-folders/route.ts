import { NextResponse } from 'next/server';
import { getSheetData } from '@/lib/google/sheets';
import { getGoogleDriveClient } from '@/lib/google/drive';

const OBJECTS_ID = process.env.GOOGLE_SHEETS_OBJECTS_ID ?? '';

// Normalize comment — also handle typos from the data
const SOLD_VARIANTS    = new Set(['продано через нас', 'продано']);
const REMOVED_VARIANTS = new Set(['снято с продажи', 'снять с продажи', 'снато с продажи']);

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
    const drive = await getGoogleDriveClient();

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

    // ── Parse Abu Dhabi ──────────────────────────────────────────────────────
    const abuHeaders = (abuRows[0] ?? []).map(h => String(h).trim());
    const ai = {
      unit:         abuHeaders.indexOf('Unit'),
      code:         abuHeaders.indexOf('Код'),
      comment:      abuHeaders.indexOf('Комментарии'),
      unitFolderId: abuHeaders.indexOf('Unit Folder ID'),
    };

    const results: AuditRow[] = [];

    for (let i = 1; i < abuRows.length; i++) {
      const r = abuRows[i] as unknown[];
      const code = String(r[ai.code] ?? '').replace(/\s/g, '').replace(/^#/, '');
      if (!code) continue; // skip header/empty rows

      const comment    = normalizeComment(r[ai.comment]);
      const folderId   = String(r[ai.unitFolderId] ?? '').trim();
      const prefix     = code.replace(/\D/g, '').slice(0, 4);

      const expected: ExpectedLocation =
        SOLD_VARIANTS.has(comment)    ? 'sold' :
        REMOVED_VARIANTS.has(comment) ? 'removed' :
                                        'search';

      const row: AuditRow = {
        rowNum:           i + 1,
        unit:             String(r[ai.unit] ?? '').trim(),
        code:             '#' + code,
        comment,
        unitFolderId:     folderId,
        folderName:       '',
        expected,
        actualParentId:   '',
        actualParentName: '',
        status:           'ok',
        detail:           '',
      };

      const pc = prefixMap.get(prefix);
      if (!pc) {
        row.status = 'config_missing';
        row.detail = `Prefix ${prefix} не найден в CONFIG_DRIVE`;
        results.push(row);
        continue;
      }

      // Find the unit folder: by stored ID first, then by code pattern in names
      let indexed = folderId ? byId.get(folderId) : undefined;

      if (!indexed) {
        // Search by code pattern in all scanned subfolders
        const pattern = makeCodePattern(code);
        for (const [id, info] of byId) {
          if (pattern.test(info.folderName)) {
            indexed = info;
            row.unitFolderId = id;
            break;
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

      const expectedIds =
        expected === 'sold'    ? pc.soldIds :
        expected === 'removed' ? pc.removedIds :
                                  pc.searchIds;

      if (expectedIds.has(indexed.parentId)) {
        row.status = 'ok';
      } else {
        row.status = 'wrong';
        row.detail = `Ожидается в: ${[...expectedIds].map(id =>
          `https://drive.google.com/drive/folders/${id}`
        ).join(', ')}`;
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
