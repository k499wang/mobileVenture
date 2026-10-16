import { createHash } from 'node:crypto';

/** Small runtime validator for the deliberately limited artifact-schema dialect. */
export function validate(schema, value, location = '$') {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${location}: expected object`);
    for (const key of schema.required ?? []) if (!(key in value)) throw new Error(`${location}.${key}: required`);
    for (const [key, child] of Object.entries(value)) {
      if (!Object.hasOwn(schema.properties, key)) throw new Error(`${location}.${key}: unknown field`);
      validate(schema.properties[key], child, `${location}.${key}`);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length > 100) throw new Error(`${location}: expected array with at most 100 items`);
    value.forEach((item, index) => validate(schema.items, item, `${location}[${index}]`));
  } else if (typeof value !== schema.type || (schema.type === 'number' && !Number.isFinite(value))) {
    throw new Error(`${location}: expected ${schema.type}`);
  }
  if (typeof value === 'string' && value.length > 40_000) throw new Error(`${location}: string too large`);
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`${location}: invalid choice`);
  if (schema.minimum !== undefined && value < schema.minimum) throw new Error(`${location}: below minimum`);
  if (schema.maximum !== undefined && value > schema.maximum) throw new Error(`${location}: above maximum`);
  return value;
}

export function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

export function validateReferences(role, artifact, artifacts, { mode, sources = [] }) {
  const evidence = [...(artifacts.researcher?.evidence ?? []), ...(artifacts.competitor?.evidence ?? [])];
  const known = new Set(evidence.map(item => item.id));
  if (['researcher', 'competitor'].includes(role)) {
    if (!artifact.evidence.length) throw new Error('Research must include evidence or fail explicitly; empty evidence cannot advance.');
    const ids = new Set();
    const otherRole = role === 'researcher' ? 'competitor' : 'researcher';
    const otherIds = new Set((artifacts[otherRole]?.evidence ?? []).map(item => item.id));
    for (const item of artifact.evidence) {
      if (ids.has(item.id) || otherIds.has(item.id)) throw new Error(`Duplicate evidence ID: ${item.id}`);
      ids.add(item.id);
      const url = new URL(item.url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Evidence requires an HTTP(S) source URL.');
      if (!Number.isFinite(Date.parse(item.retrievedAt))) throw new Error('Evidence requires a valid retrieval date.');
      if (mode === 'live' && item.fixture) throw new Error('Live research cannot submit fixture evidence.');
      if (mode === 'demo' && !item.fixture) throw new Error('Demo research must be labeled as fixture evidence.');
      if (mode === 'live' && !sources.includes(item.url)) throw new Error(`Evidence URL was not returned by web search: ${item.url}`);
    }
  }
  const check = (ids) => {
    if (!ids?.length) throw new Error('A decision must reference at least one evidence record.');
    for (const id of ids) if (!known.has(id)) throw new Error(`Unknown evidence reference: ${id}`);
  };
  if (role === 'competitor') for (const competitor of artifact.competitors) {
    for (const id of competitor.evidenceIds) if (!artifact.evidence.some(item => item.id === id)) throw new Error(`Unknown competitor evidence: ${id}`);
  }
  if (role === 'analyst') {
    if (!artifact.opportunities.length) throw new Error('No opportunity was identified.');
    artifact.opportunities.forEach(item => check(item.evidenceIds));
  }
  if (role === 'planner') {
    check(artifact.evidenceIds);
    if (!/^[a-z][a-z0-9-]{1,48}$/.test(artifact.slug)) throw new Error('Use a safe lowercase app slug.');
    if (!artifact.features.length) throw new Error('Specification must have at least one feature.');
    artifact.features.forEach(item => { check(item.evidenceIds); if (!item.acceptanceCriteria.length) throw new Error('Feature acceptance criteria are required.'); });
  }
  return artifact;
}
