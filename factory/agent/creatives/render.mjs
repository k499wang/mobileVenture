import { constants } from 'node:fs';
import { mkdir, realpath, lstat, open, readFile } from 'node:fs/promises';
import path from 'node:path';

export const AWARENESS_STAGES = ['unaware', 'problem_aware', 'solution_aware', 'product_aware', 'most_aware'];
export const FORMATS = [{ id: 'square', width: 1080, height: 1080 }, { id: 'portrait', width: 1080, height: 1350 }, { id: 'story', width: 1080, height: 1920 }];
const palettes = { sunrise: ['#FFF2DD', '#EF633F', '#291F20'], mint: ['#E9F5EE', '#39775C', '#172C25'], lavender: ['#F1EDFF', '#7358CF', '#292238'] };
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
function text(value, max = 500) { if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error('Invalid or oversized creative text'); return value; }
function id(value) { if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value)) throw new Error('Unsafe creative/persona ID'); return value; }
function lines(value, limit) {
  const words = value.replace(/\s+/g, ' ').trim().split(' '); const result = []; let line = '';
  for (const word of words) { if (word.length > limit) throw new Error('Creative text contains an unbreakable word'); if ((line + ' ' + word).trim().length > limit) { result.push(line); line = word; } else line = (line + ' ' + word).trim(); }
  if (line) result.push(line); return result;
}
function block(value, x, y, size, limit, maxLines, color, weight = 700) {
  const wrapped = lines(value, limit); if (wrapped.length > maxLines) throw new Error('Creative copy exceeds layout safe area');
  return `<text fill="${color}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}">${wrapped.map((line, i) => `<tspan x="${x}" y="${y + i * size * 1.16}">${escape(line)}</tspan>`).join('')}</text>`;
}
function svgFor(creative, brandName, format, mode) {
  const [bg, accent, ink] = palettes[creative.palette] || palettes.lavender;
  const { width, height } = format; const story = height === 1920; const top = story ? 250 : 75;
  const headlineSize = 76; const headlineLines = lines(creative.headline, 23).length;
  if (headlineLines > 3) throw new Error('Headline exceeds layout safe area');
  const hookY = top + 75 + headlineLines * headlineSize * 1.16;
  const phoneY = story ? 880 : height === 1350 ? 660 : 560;
  const phoneH = story ? 520 : height === 1350 ? 420 : 300;
  const ctaY = height - (story ? 300 : 105);
  const label = mode === 'demo' || mode === 'fixture' ? 'Concept / demo' : 'Concept / not published';
  const illustration = `<rect x="190" y="${phoneY}" width="700" height="${phoneH}" rx="38" fill="${ink}" opacity="0.06"/><rect x="210" y="${phoneY - 15}" width="660" height="${phoneH}" rx="34" fill="#FFFFFF"/><rect x="246" y="${phoneY + 23}" width="76" height="8" rx="4" fill="${accent}"/>${block(brandName, 246, phoneY + 85, 32, 32, 1, ink)}${[0, 1, 2].map((i) => `<rect x="246" y="${phoneY + 112 + i * 56}" width="588" height="42" rx="12" fill="${bg}"/><circle cx="270" cy="${phoneY + 133 + i * 56}" r="9" fill="${accent}" opacity="${1 - i * .22}"/><rect x="297" y="${phoneY + 127 + i * 56}" width="${[270, 340, 210][i]}" height="11" rx="5" fill="${ink}" opacity="0.18"/>`).join('')}`;
  const layoutMark = creative.layout === 'checklist' ? 'A SMALLER NEXT STEP' : creative.layout === 'contrast' ? 'MAKE ROOM FOR A NEW APPROACH' : 'DESIGNED FOR REAL LIFE';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="1080" height="${height}" fill="${bg}"/><circle cx="1010" cy="${phoneY + 110}" r="280" fill="${accent}" opacity="0.09"/>${block(brandName, 75, top, 27, 42, 1, ink)}${block(creative.headline, 75, top + 100, headlineSize, 23, 3, ink)}${block(creative.hook, 78, hookY + 32, 29, 48, 2, ink, 400)}${block(layoutMark, 78, phoneY - 55, 18, 52, 1, accent)}${illustration}<rect x="75" y="${ctaY - 48}" width="930" height="85" rx="22" fill="${accent}"/>${block(creative.cta, 112, ctaY + 6, 30, 43, 1, '#FFFFFF')}${block(label, 78, height - (story ? 200 : 35), 18, 60, 1, ink, 400)}</svg>`;
}
async function safeDirectory(runDir) {
  const root = await realpath(runDir); const dir = path.join(root, 'creatives');
  try { await mkdir(dir); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const stat = await lstat(dir); if (stat.isSymbolicLink() || !stat.isDirectory() || await realpath(dir) !== dir) throw new Error('Unsafe creatives directory');
  return dir;
}
async function writeSafe(dir, filename, value) {
  if (path.basename(filename) !== filename) throw new Error('Unsafe creative filename');
  const file = path.join(dir, filename); const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(value); } finally { await handle.close(); }
  return file;
}
function checkedCreatives(artifact) {
  if (!artifact || !Array.isArray(artifact.creatives) || artifact.creatives.length < 1 || artifact.creatives.length > 30) throw new Error('Expected 1–30 creative concepts');
  const ids = new Set();
  return artifact.creatives.map((creative) => {
    id(creative.id); id(creative.personaId); if (ids.has(creative.id)) throw new Error('Duplicate creative ID'); ids.add(creative.id);
    if (!AWARENESS_STAGES.includes(creative.awarenessStage)) throw new Error('Unknown awareness stage');
    for (const key of ['headline', 'hook', 'cta']) text(creative[key], key === 'cta' ? 43 : 160);
    for (const key of ['primaryText', 'description', 'angle', 'visualConcept']) if (creative[key] !== undefined) text(creative[key], 2000);
    for (const key of ['evidenceIds', 'designReferenceIds', 'claimNotes']) if (creative[key] !== undefined && (!Array.isArray(creative[key]) || creative[key].length > 40 || creative[key].some((v) => typeof v !== 'string' || v.length > 1000))) throw new Error('Invalid creative references');
    return creative;
  });
}
export async function renderCreativePack({ runDir, brand, spec, personaArtifact, creativeArtifact, mode = 'demo', onEvent }) {
  const creatives = checkedCreatives(creativeArtifact); const name = text(typeof brand === 'string' ? brand : brand?.name || spec?.name || spec?.appName || 'Your next chapter', 42);
  const expectedPersonaIds = (personaArtifact?.personas || []).map((p) => id(p.id));
  const dir = await safeDirectory(runDir); const { default: sharp } = await import('sharp'); const assets = [];
  for (const creative of creatives) for (const format of FORMATS) {
    const svg = svgFor(creative, name, format, mode); const base = `${creative.id}-${format.id}`;
    const png = await sharp(Buffer.from(svg), { limitInputPixels: 1080 * 1920 }).png({ compressionLevel: 9 }).toBuffer();
    for (const [ext, mimeType, data] of [['svg', 'image/svg+xml', svg], ['png', 'image/png', png]]) {
      const filename = `${base}.${ext}`; await writeSafe(dir, filename, data);
      assets.push({ id: `${base}-${ext}`, creativeId: creative.id, personaId: creative.personaId, awarenessStage: creative.awarenessStage, format: format.id, width: format.width, height: format.height, mimeType, path: `creatives/${filename}`, filename });
    }
    await onEvent?.({ type: 'creative_rendered', creativeId: creative.id, format: format.id });
  }
  const manifest = { version: 1, status: 'concept', mode, brand: name, expectedPersonaIds, assets, creatives, limitations: creativeArtifact.limitations || [], notes: ['Original vector product illustrations; no sourced screens are reproduced.', 'Creative hypotheses; no performance results are claimed.'] };
  await writeSafe(dir, 'manifest.json', JSON.stringify(manifest, null, 2));
  await buildLaunchPack({ runDir, manifest });
  const report = await validateCreativePack({ runDir, manifest });
  await writeSafe(dir, 'qa.json', JSON.stringify(report, null, 2));
  return { assets, manifestPath: 'creatives/manifest.json', manifestFilename: 'manifest.json', copyFilename: 'ad-copy.csv', referencesFilename: 'source-references.json', qaFilename: 'qa.json', coverage: report.coverage, qa: report, launchPackPath: 'creatives/ad-copy.csv' };
}
export async function validateCreativePack({ runDir, manifest, creativePack, creativeArtifact, personaArtifact }) {
  const dir = await safeDirectory(runDir); manifest ||= JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
  if (creativePack) manifest = { ...manifest, assets: creativePack.assets };
  if (creativeArtifact) manifest = { ...manifest, creatives: checkedCreatives(creativeArtifact) };
  if (personaArtifact) manifest = { ...manifest, expectedPersonaIds: personaArtifact.personas.map((p) => id(p.id)) };
  const checks = []; const coverage = {};
  const seenAssets = new Set();
  for (const asset of manifest.assets) {
    let passed = false;
    try {
      if (path.basename(asset.filename) !== asset.filename || asset.path !== `creatives/${asset.filename}`) throw new Error('Unsafe manifest path');
      const format = FORMATS.find((f) => f.id === asset.format);
      if (!format || asset.width !== format.width || asset.height !== format.height || !AWARENESS_STAGES.includes(asset.awarenessStage) || seenAssets.has(asset.id)) throw new Error('Invalid or duplicate format');
      seenAssets.add(asset.id);
      const source = manifest.creatives.find((c) => c.id === asset.creativeId);
      if (!source || source.personaId !== asset.personaId || source.awarenessStage !== asset.awarenessStage) throw new Error('Asset provenance mismatch');
      const file = path.join(dir, asset.filename); if (!(await lstat(file)).isFile()) throw new Error('Not regular file');
      const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW); let data; try { data = await handle.readFile(); } finally { await handle.close(); }
      passed = asset.mimeType === 'image/png' ? data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && data.length > 24 && data.readUInt32BE(16) === asset.width && data.readUInt32BE(20) === asset.height : data.toString().startsWith('<svg ') && data.toString().includes(`width="${asset.width}" height="${asset.height}"`);
    } catch { passed = false; }
    checks.push({ name: asset.id, passed, detail: passed ? 'File and dimensions verified' : 'Missing, unsafe, or invalid image' });
    if (passed && asset.mimeType === 'image/png') { coverage[asset.personaId] ||= {}; coverage[asset.personaId][asset.awarenessStage] ||= []; coverage[asset.personaId][asset.awarenessStage].push(asset.format); }
  }
  for (const personaId of new Set([...(manifest.expectedPersonaIds || []), ...manifest.creatives.map((c) => c.personaId)])) for (const stage of AWARENESS_STAGES) {
    const passed = FORMATS.every((format) => coverage[personaId]?.[stage]?.includes(format.id)); checks.push({ name: `coverage:${personaId}:${stage}`, passed, detail: passed ? 'All three PNG formats present' : 'Missing persona awareness-stage formats' });
  }
  return { ok: checks.every((c) => c.passed), checks, assetsCount: manifest.assets.length, coverage };
}
export async function buildLaunchPack({ runDir, manifest }) {
  const dir = await safeDirectory(runDir); const keys = ['id', 'personaId', 'awarenessStage', 'headline', 'primaryText', 'description', 'cta', 'angle'];
  const csv = (value) => `"${String(value ?? '').replace(/^[=+@\-\t\r]/, (v) => `'${v}`).replace(/"/g, '""')}"`;
  await writeSafe(dir, 'ad-copy.csv', [keys.join(','), ...manifest.creatives.map((c) => keys.map((key) => csv(c[key])).join(','))].join('\r\n'));
  await writeSafe(dir, 'source-references.json', JSON.stringify(manifest.creatives.map(({ id, personaId, awarenessStage, evidenceIds = [], designReferenceIds = [], claimNotes = [] }) => ({ creativeId: id, personaId, awarenessStage, evidenceIds, designReferenceIds, claimNotes })), null, 2));
  return { copyPath: 'creatives/ad-copy.csv', referencesPath: 'creatives/source-references.json' };
}
