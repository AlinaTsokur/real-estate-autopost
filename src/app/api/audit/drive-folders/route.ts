import { NextResponse } from 'next/server';
import { getSheetData } from '@/lib/google/sheets';
import { getGoogleDriveClient } from '@/lib/google/drive';

const OBJECTS_ID = process.env.GOOGLE_SHEETS_OBJECTS_ID ?? '';

const SOLD_VALUES    = new Set(['продано через нас', 'продано']);
const REMOVED_VALUES = new Set(['снято с продажи']);

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

type ExpectedLocation = 'search' | 'sold' | 'removed';

export interface AuditRow {
  rowNum: number;
  unit: string;
  code: string;
  comment: string;
  unitFolderId: string;
  expected: ExpectedLocation;
  actualParentId: string;
  actualParentName: string;
  status: 'ok' | 'wrong' | 'not_found' | 'config_missing';
  detail: string;
}

// List all subfolders of a Drive folder (one API call, handles pagination)
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
    for (const f of res.data.files ?? []) {
      items.push({ id: f.id!, name: f.name ?? '' });
    }
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
      prefix:   cfgHeaders.indexOf('Code Prefix'),
      search:   cfgHeaders.indexOf('Search Folder Link'),
      sold:     cfgHeaders.indexOf('Sold Folder Link'),
      removed:  cfgHeaders.indexOf('Removed Folder Link'),
    };

    // prefix → { searchIds, soldIds, removedIds }
    type PrefixConfig = { searchIds: Set<string>; soldIds: Set<string>; removedIds: Set<string> };
    const prefixMap = new Map<string, PrefixConfig>();

    // Collect all unique parent folder IDs we need to scan
    // folderId → { parentId, role: 'search'|'sold'|'removed' }
    const parentMeta = new Map<string, { role: ExpectedLocation }>();

    for (let i = 1; i < cfgRows.length; i++) {
      const r = cfgRows[i] as unknown[];
      const searchLink = String(r[ci.search] ?? '').trim();
      if (!searchLink) continue;

      const rawPrefix = String(r[ci.prefix] ?? '').replace(/\D/g, '').padStart(4, '0').slice(0, 4);
      if (!rawPrefix || rawPrefix === '0000') continue;

      if (!prefixMap.has(rawPrefix)) {
        prefixMap.set(rawPrefix, { searchIds: new Set(), soldIds: new Set(), removedIds: new Set() });
      }
      const pc = prefixMap.get(rawPrefix)!;

      const sId  = extractFolderId(searchLink);
      const soId = extractFolderId(String(r[ci.sold]    ?? ''));
      const rId  = extractFolderId(String(r[ci.removed] ?? ''));

      if (sId)  { pc.searchIds.add(sId);  parentMeta.set(sId,  { role: 'search' }); }
      if (soId) { pc.soldIds.add(soId);   parentMeta.set(soId, { role: 'sold' }); }
      if (rId)  { pc.removedIds.add(rId); parentMeta.set(rId,  { role: 'removed' }); }
    }

    // ── Scan all parent folders → build reverse index ───────────────────────
    // unitFolderId → { parentId, parentName }
    const folderIndex = new Map<string, { parentId: string; parentName: string }>();

    const parentIds = [...parentMeta.keys()];

    // Scan in parallel batches of 10 to stay within rate limits
    const BATCH = 10;
    for (let i = 0; i < parentIds.length; i += BATCH) {
      const batch = parentIds.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async parentId => {
          const children = await listSubfolders(drive, parentId);
          // Get parent name once per parent
          let parentName = parentId;
          try {
            const pRes = await drive.files.get({ fileId: parentId, fields: 'name', supportsAllDrives: true });
            parentName = pRes.data.name ?? parentId;
          } catch {}
          return { parentId, parentName, children };
        })
      );
      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        const { parentId, parentName, children } = r.value;
        for (const child of children) {
          folderIndex.set(child.id, { parentId, parentName });
        }
      }
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
      const rawFolderId = String(r[ai.unitFolderId] ?? '').trim();
      if (!rawFolderId) continue;

      const code = String(r[ai.code] ?? '').replace(/\s/g, '').replace(/^#/, '');
      if (!code) continue;

      const prefix  = code.replace(/\D/g, '').slice(0, 4);
      const comment = normalizeComment(r[ai.comment]);

      const expected: ExpectedLocation =
        SOLD_VALUES.has(comment)    ? 'sold' :
        REMOVED_VALUES.has(comment) ? 'removed' :
                                      'search';

      const row: AuditRow = {
        rowNum:           i + 1,
        unit:             String(r[ai.unit] ?? '').trim(),
        code:             '#' + code,
        comment,
        unitFolderId:     rawFolderId,
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

      const indexed = folderIndex.get(rawFolderId);
      if (!indexed) {
        row.status = 'not_found';
        row.detail = 'Папка не найдена ни в одной из папок CONFIG_DRIVE';
        results.push(row);
        continue;
      }

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
        row.detail = `Ожидается в: ${[...expectedIds].map(id => `https://drive.google.com/drive/folders/${id}`).join(', ')}`;
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
