import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { RESEARCH_ROLES } from './agents/growth.mjs';

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ crcTable[(value ^ byte) & 255];
  return (value ^ 0xffffffff) >>> 0;
}

/** Portable ZIP STORE writer; original paths, executables and symlinks are never archived. */
export function zipFiles(entries) {
  if (entries.length > 200) throw new Error('Launch pack exceeds file limit.');
  const bodies = [], directory = [];
  let offset = 0;
  for (const { name, content } of entries) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) throw new Error('Unsafe archive filename.');
    const filename = Buffer.from(name);
    const data = Buffer.from(content);
    if (data.length > 12_000_000) throw new Error('Launch pack file is too large.');
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6); header.writeUInt16LE(33, 12); // UTF-8, 1980-01-01 DOS epoch.
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26);
    bodies.push(header, filename, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8); central.writeUInt16LE(33, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    directory.push(central, filename);
    offset += header.length + filename.length + data.length;
  }
  const central = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...bodies, central, end]);
}

export async function createLaunchArchive({ runDir, creativePack, artifacts, mode, sourceDetails }) {
  const root = await realpath(runDir);
  const directory = path.join(root, 'creatives');
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unsafe creative archive directory.');
  async function write(filename, content) {
    const handle = await open(path.join(directory, filename), constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
    try { await handle.writeFile(content); } finally { await handle.close(); }
  }
  const dossier = { status: 'draft', mode, specification: artifacts.planner, personas: artifacts.persona,
    design: artifacts.designer, adResearch: artifacts.ads_research,
    evidence: RESEARCH_ROLES.flatMap(role => artifacts[role]?.evidence ?? []),
    ...(sourceDetails ? { sourceDetails } : {}),
    experiments: artifacts.experimenter, limitations: ['Draft assets; no Meta delivery, performance or platform approval is implied.'] };
  await write('research-dossier.json', JSON.stringify(dossier, null, 2));
  const names = new Set([...creativePack.assets.map(asset => asset.filename), 'manifest.json', 'ad-copy.csv', 'source-references.json', 'qa.json', 'research-dossier.json']);
  const entries = [];
  for (const name of [...names].sort()) {
    if (path.basename(name) !== name || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) throw new Error('Unsafe launch pack asset.');
    const handle = await open(path.join(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > 12_000_000) throw new Error('Invalid launch pack asset.');
      entries.push({ name, content: await handle.readFile() });
    } finally { await handle.close(); }
  }
  await write('launch-pack.zip', zipFiles(entries));
  return { archiveFilename: 'launch-pack.zip', dossierFilename: 'research-dossier.json', archivedFiles: entries.length };
}
