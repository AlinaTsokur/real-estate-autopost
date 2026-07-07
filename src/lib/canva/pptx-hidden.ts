import AdmZip from 'adm-zip';

export function getVisiblePageNumbers(pptxBuffer: Buffer): number[] {
  const zip = new AdmZip(pptxBuffer);

  // Map rId → slide file path from presentation rels
  const relsXml = zip.readAsText('ppt/_rels/presentation.xml.rels');
  const idToFile: Record<string, string> = {};
  for (const m of relsXml.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    const target = m[2];
    if (target.includes('/slide') && !target.includes('Layout') && !target.includes('Master')) {
      const filePath = target.startsWith('../') ? 'ppt/' + target.slice(3) : `ppt/${target}`;
      idToFile[m[1]] = filePath;
    }
  }

  // Get ordered slide rIds from presentation.xml
  const presXml = zip.readAsText('ppt/presentation.xml');
  const sldIdLstMatch = presXml.match(/<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/);
  if (!sldIdLstMatch) return [];

  const rIds = [...sldIdLstMatch[1].matchAll(/r:id="([^"]+)"/g)].map(m => m[1]);

  const visible: number[] = [];
  rIds.forEach((rId, idx) => {
    const filePath = idToFile[rId];
    if (!filePath) {
      visible.push(idx + 1);
      return;
    }
    const entry = zip.getEntry(filePath);
    if (!entry) {
      visible.push(idx + 1);
      return;
    }
    const slideXml = entry.getData().toString('utf-8');
    // Canva exports hidden slides with show="false" on the root <p:sld> element
    if (!/<p:sld[^>]*show="false"/.test(slideXml)) {
      visible.push(idx + 1);
    }
  });

  return visible;
}
