import { NextResponse } from 'next/server';
import { getSheetData } from '@/lib/google/sheets';
import { getGoogleDriveClient } from '@/lib/google/drive';

const OBJECTS_ID = process.env.GOOGLE_SHEETS_OBJECTS_ID ?? '';

const SOLD_VALUES    = new Set(['продано через нас', 'продано']);
const REMOVED_VALUES = new Set(['снято с продажи']);

function normalizeComment(v: string): string {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function extractFolderId(urlOrId: string): string {
  const s = String(urlOrId ?? '').trim();
  const m = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s;
  return '';
}

function getCodePrefix(code: string): string {
  return code.replace(/\D/g, '').slice(0, 4);
}

type ExpectedLocation = 'search' | 'sold' | 'removed';

interface ConfigRow {
  project: string;
  building: string;
  prefix: string;
  searchId: string;
  soldId: string;
  removedId: string;
}

export interface AuditRow {
  rowNum: number;
  unit: string;
  code: string;
  comment: string;
  unitFolderId: string;
  unitFolderName: string;
  expected: ExpectedLocation;
  actualParentId: string;
  actualParentName: string;
  status: 'ok' | 'wrong' | 'not_found' | 'config_missing' | 'no_folder_id';
  detail: string;
}

export async function GET() {
  try {
    const [abuRows, cfgRows] = await Promise.all([
      getSheetData(OBJECTS_ID, 'Abu Dhabi') as Promise<string[][]>,
      getSheetData(OBJECTS_ID, 'CONFIG_DRIVE') as Promise<string[][]>,
    ]);

    // Parse CONFIG_DRIVE
    const cfgHeaders = (cfgRows[0] ?? []).map(h => String(h).trim());
    const ci = {
      project:   cfgHeaders.indexOf('Project'),
      building:  cfgHeaders.indexOf('Building'),
      prefix:    cfgHeaders.indexOf('Code Prefix'),
      search:    cfgHeaders.indexOf('Search Folder Link'),
      sold:      cfgHeaders.indexOf('Sold Folder Link'),
      removed:   cfgHeaders.indexOf('Removed Folder Link'),
    };

    const configMap = new Map<string, ConfigRow[]>();
    for (let i = 1; i < cfgRows.length; i++) {
      const r = cfgRows[i];
      const searchLink = String(r[ci.search] ?? '').trim();
      if (!searchLink) continue;

      const prefix = String(r[ci.prefix] ?? '').replace(/\D/g, '').padStart(4, '0').slice(0, 4);
      if (!prefix || prefix === '0000') continue;

      const cfg: ConfigRow = {
        project:  String(r[ci.project]  ?? '').trim(),
        building: String(r[ci.building] ?? '').trim(),
        prefix,
        searchId:  extractFolderId(searchLink),
        soldId:    extractFolderId(String(r[ci.sold]    ?? '')),
        removedId: extractFolderId(String(r[ci.removed] ?? '')),
      };

      if (!configMap.has(prefix)) configMap.set(prefix, []);
      configMap.get(prefix)!.push(cfg);
    }

    // Parse Abu Dhabi headers
    const abuHeaders = (abuRows[0] ?? []).map(h => String(h).trim());
    const ai = {
      unit:         abuHeaders.indexOf('Unit'),
      code:         abuHeaders.indexOf('Код'),
      comment:      abuHeaders.indexOf('Комментарии'),
      unitFolderId: abuHeaders.indexOf('Unit Folder ID'),
    };

    // Collect rows that have a Unit Folder ID
    const toCheck: { rowNum: number; unit: string; code: string; comment: string; folderId: string }[] = [];

    for (let i = 1; i < abuRows.length; i++) {
      const r = abuRows[i];
      const folderId = String(r[ai.unitFolderId] ?? '').trim();
      if (!folderId) continue;

      const code = String(r[ai.code] ?? '').replace(/\s/g, '').replace(/^#/, '');
      if (!code) continue;

      toCheck.push({
        rowNum:  i + 1,
        unit:    String(r[ai.unit]    ?? '').trim(),
        code,
        comment: normalizeComment(String(r[ai.comment] ?? '')),
        folderId,
      });
    }

    if (!toCheck.length) {
      return NextResponse.json({ rows: [], total: 0, ok: 0, wrong: 0, missing: 0 });
    }

    // Fetch actual parent IDs from Drive (batch — one request per folder)
    const drive = await getGoogleDriveClient();

    const results: AuditRow[] = [];

    for (const item of toCheck) {
      const prefix = getCodePrefix(item.code);
      const configs = configMap.get(prefix) ?? [];

      const row: AuditRow = {
        rowNum:           item.rowNum,
        unit:             item.unit,
        code:             '#' + item.code,
        comment:          item.comment,
        unitFolderId:     item.folderId,
        unitFolderName:   '',
        expected:         SOLD_VALUES.has(item.comment) ? 'sold'
                        : REMOVED_VALUES.has(item.comment) ? 'removed'
                        : 'search',
        actualParentId:   '',
        actualParentName: '',
        status:           'ok',
        detail:           '',
      };

      if (!configs.length) {
        row.status = 'config_missing';
        row.detail = `Code prefix ${prefix} не найден в CONFIG_DRIVE`;
        results.push(row);
        continue;
      }

      // Get actual parent from Drive
      let actualParentId = '';
      let unitFolderName = '';
      try {
        const fileRes = await drive.files.get({
          fileId: item.folderId,
          fields: 'id,name,parents,trashed',
          supportsAllDrives: true,
        });

        if (fileRes.data.trashed) {
          row.status = 'not_found';
          row.detail = 'Папка в корзине';
          results.push(row);
          continue;
        }

        unitFolderName = fileRes.data.name ?? '';
        actualParentId = (fileRes.data.parents ?? [])[0] ?? '';
      } catch {
        row.status = 'not_found';
        row.detail = 'Папка не найдена в Drive (возможно удалена)';
        results.push(row);
        continue;
      }

      row.unitFolderName = unitFolderName;
      row.actualParentId = actualParentId;

      // Get actual parent folder name
      try {
        const parentRes = await drive.files.get({
          fileId: actualParentId,
          fields: 'name',
          supportsAllDrives: true,
        });
        row.actualParentName = parentRes.data.name ?? actualParentId;
      } catch {
        row.actualParentName = actualParentId;
      }

      // Determine expected parent IDs (all matching config rows)
      const expectedIds = new Set<string>();
      for (const cfg of configs) {
        if (row.expected === 'sold')    expectedIds.add(cfg.soldId);
        if (row.expected === 'removed') expectedIds.add(cfg.removedId);
        if (row.expected === 'search')  expectedIds.add(cfg.searchId);
      }

      // Remove empty IDs
      expectedIds.delete('');

      if (!expectedIds.size) {
        row.status = 'config_missing';
        row.detail = `В CONFIG_DRIVE нет ссылки на папку "${row.expected}" для prefix ${prefix}`;
      } else if (expectedIds.has(actualParentId)) {
        row.status = 'ok';
        row.detail = '';
      } else {
        row.status = 'wrong';
        const expectedNames = configs
          .map(cfg =>
            row.expected === 'sold'    ? cfg.soldId :
            row.expected === 'removed' ? cfg.removedId :
                                         cfg.searchId
          )
          .filter(Boolean)
          .map(id => `https://drive.google.com/drive/folders/${id}`)
          .join(', ');
        row.detail = `Должна быть в: ${expectedNames}`;
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
