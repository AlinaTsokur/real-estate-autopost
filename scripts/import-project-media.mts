/* Одноразовый перенос листа PROJECT_MEDIA в нашу базу.
   Запуск: npx tsx scripts/import-project-media.mts [--apply]
   Без --apply только показывает, что будет сделано. */

import fs from 'fs';

fs.readFileSync('.env.local', 'utf8').split('\n').forEach(l => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
});

const APPLY = process.argv.includes('--apply');
const norm = (s: string) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

// Названия из листа, которых нет в базе, но это тот же объект.
// Разбивка по корпусам и старые написания — папка у них общая с проектом.
const GLUE: Record<string, string> = {
  'louvre abu dhabi residences': 'Louvre Residences',
  'bashayer residence': 'Bashayer Residences',
  'beach terraces': 'Fahid Beach Terraces',
  'manarat living ii': 'Manarat Living',
  'manarat living iii': 'Manarat Living',
  'the source ii': 'The Source',
  'the source terraces': 'The Source',
  'the sustainable city th': 'The Sustainable City',
};

const { getGoogleSheetsClient } = await import('../src/lib/google/sheets.ts');
const { listProjectMeta, setPhotosFolderUrl, saveMediaAlias } = await import('../src/lib/post-meta/emoji.ts');

const sheets = await getGoogleSheetsClient();
const res = await sheets.spreadsheets.values.get({
  spreadsheetId: process.env.GOOGLE_SHEETS_CONFIG_ID!,
  range: 'PROJECT_MEDIA',
});

const sheetRows = (res.data.values || [])
  .slice(1)
  .map(r => ({ name: String(r[0] || '').trim(), url: String(r[1] || '').trim() }))
  .filter(r => r.name && r.url);

const projects = await listProjectMeta();
const byName = new Map(projects.map(p => [norm(p.projectName), p]));

const toProject: { project: string; url: string; via: string }[] = [];
const toAlias: { name: string; url: string }[] = [];
const skipped: { name: string; why: string }[] = [];

for (const row of sheetRows) {
  const direct = byName.get(norm(row.name));
  if (direct) {
    toProject.push({ project: direct.projectName, url: row.url, via: 'имя совпало' });
    continue;
  }

  const glued = GLUE[norm(row.name)];
  const target = glued ? byName.get(norm(glued)) : undefined;
  if (target) {
    toProject.push({ project: target.projectName, url: row.url, via: `склейка из «${row.name}»` });
    // Старое имя оставляем ещё и псевдонимом: посты, собранные вставкой текста,
    // называют проект по корпусу и иначе останутся без фотографий.
    toAlias.push({ name: row.name, url: row.url });
    continue;
  }

  if (glued) skipped.push({ name: row.name, why: `склейка на «${glued}», но такого проекта в базе нет` });
  else toAlias.push({ name: row.name, url: row.url });
}

// При склейке на один проект может прийти несколько строк — берём первую,
// но показываем расхождение, если ссылки разные.
const seen = new Map<string, string>();
const conflicts: string[] = [];
const finalProject = toProject.filter(t => {
  const prev = seen.get(t.project);
  if (prev === undefined) { seen.set(t.project, t.url); return true; }
  if (prev !== t.url) conflicts.push(`${t.project}: ${t.via} даёт другую ссылку`);
  return false;
});

console.log(`Строк в листе со ссылкой: ${sheetRows.length}\n`);
console.log(`→ в проекты (${finalProject.length}):`);
for (const t of finalProject) console.log(`   ${t.project.padEnd(32)} ${t.via}`);
console.log(`\n→ отдельными псевдонимами (${toAlias.length}):`);
for (const t of toAlias) console.log(`   ${t.name}`);
if (skipped.length) {
  console.log(`\n→ пропущено (${skipped.length}):`);
  for (const t of skipped) console.log(`   ${t.name} — ${t.why}`);
}
if (conflicts.length) {
  console.log(`\n! расхождения (взята первая ссылка):`);
  for (const c of conflicts) console.log(`   ${c}`);
}

const without = projects.filter(p => !seen.has(p.projectName));
console.log(`\n→ останутся без ссылки (${without.length}): ${without.map(p => p.projectName).join(', ')}`);

if (!APPLY) {
  console.log('\nЭто прогон вхолостую. Чтобы записать — запустите с --apply');
  process.exit(0);
}

for (const t of finalProject) {
  const p = byName.get(norm(t.project))!;
  await setPhotosFolderUrl(p.projectId, t.url);
}
for (const t of toAlias) await saveMediaAlias(t.name, t.url);
console.log(`\nЗаписано: проектов ${finalProject.length}, псевдонимов ${toAlias.length}`);
