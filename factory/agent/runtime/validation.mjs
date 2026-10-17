import { createHash } from 'node:crypto';
import { AWARENESS_STAGES, RESEARCH_ROLES } from '../agents/growth.mjs';

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
    if (!Array.isArray(value) || value.length > (schema.maxItems ?? 100)) throw new Error(`${location}: array exceeds item limit`);
    value.forEach((item, index) => validate(schema.items, item, `${location}[${index}]`));
  } else if (typeof value !== schema.type || (schema.type === 'number' && !Number.isFinite(value))) {
    throw new Error(`${location}: expected ${schema.type}`);
  }
  if (typeof value === 'string' && value.length > 40_000) throw new Error(`${location}: string too large`);
  if (typeof value === 'string' && schema.maxLength !== undefined && value.length > schema.maxLength) throw new Error(`${location}: string exceeds field limit`);
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`${location}: invalid choice`);
  if (schema.minimum !== undefined && value < schema.minimum) throw new Error(`${location}: below minimum`);
  if (schema.maximum !== undefined && value > schema.maximum) throw new Error(`${location}: above maximum`);
  return value;
}

export function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

export function validateReferences(role, artifact, artifacts, { mode, sources = [] }) {
  const evidence = RESEARCH_ROLES.flatMap(id => artifacts[id]?.evidence ?? []);
  const known = new Set(evidence.map(item => item.id));
  if (!RESEARCH_ROLES.includes(role) && known.size !== evidence.length) throw new Error('Evidence IDs collide across research sources.');
  if (RESEARCH_ROLES.includes(role)) {
    if (!artifact.evidence.length) throw new Error('Research must include evidence or fail explicitly; empty evidence cannot advance.');
    const ids = new Set();
    const otherIds = new Set(RESEARCH_ROLES.filter(id => id !== role).flatMap(id => (artifacts[id]?.evidence ?? []).map(item => item.id)));
    for (const item of artifact.evidence) {
      if (ids.has(item.id) || otherIds.has(item.id)) throw new Error(`Duplicate evidence ID: ${item.id}`);
      ids.add(item.id);
      const url = new URL(item.url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Evidence requires an HTTP(S) source URL.');
      if (!Number.isFinite(Date.parse(item.retrievedAt))) throw new Error('Evidence requires a valid retrieval date.');
      if (['live', 'curated'].includes(mode) && item.fixture) throw new Error('Live or curated research cannot submit fixture evidence.');
      if (mode === 'demo' && !item.fixture) throw new Error('Demo research must be labeled as fixture evidence.');
      if (['live', 'curated'].includes(mode) && !sources.includes(item.url)) throw new Error(`Evidence URL was not returned by web search, MCP or the verified curated snapshot: ${item.url}`);
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
  const checkOwn = (ids) => {
    if (!ids?.length) throw new Error('Reference at least one research record.');
    for (const id of ids) if (!(artifact.evidence ?? []).some(item => item.id === id) && !known.has(id)) throw new Error(`Unknown research reference: ${id}`);
  };
  const safeId = (id) => { if (!/^[a-z][a-z0-9-]{1,79}$/.test(id)) throw new Error('Use safe lowercase-hyphen identifiers.'); };
  if (role === 'designer') for (const pattern of artifact.patterns) {
    safeId(pattern.id); checkOwn(pattern.evidenceIds);
    if (!artifact.evidence.some(item => item.url === pattern.referenceUrl)) throw new Error('Design reference must link to a retrieved evidence URL.');
  }
  if (role === 'ads_research') for (const ad of artifact.ads) {
    safeId(ad.id); checkOwn(ad.evidenceIds);
    if (!artifact.evidence.some(item => item.url === ad.libraryUrl)) throw new Error('Ad library link must have a source evidence record.');
  }
  if (role === 'persona') {
    if (!artifact.personas.length || artifact.personas.length > 3) throw new Error('Create between one and three persona hypotheses.');
    const ids = new Set();
    for (const persona of artifact.personas) {
      safeId(persona.id); check(persona.evidenceIds);
      if (ids.has(persona.id)) throw new Error('Duplicate persona ID.');
      ids.add(persona.id);
      if (persona.awareness.length !== 5 || AWARENESS_STAGES.some(stage => persona.awareness.filter(item => item.stage === stage).length !== 1)) throw new Error('Each persona requires all five awareness stages exactly once.');
    }
  }
  if (role === 'creative') {
    const personas = artifacts.persona?.personas ?? [];
    const patterns = new Set((artifacts.designer?.patterns ?? []).map(item => item.id));
    if (!personas.length || artifact.creatives.length !== personas.length * 5) throw new Error('Create exactly one concept per persona and awareness stage.');
    const ids = new Set();
    for (const creative of artifact.creatives) {
      safeId(creative.id); check(creative.evidenceIds);
      if (ids.has(creative.id)) throw new Error('Duplicate creative ID.');
      ids.add(creative.id);
      if (!personas.some(persona => persona.id === creative.personaId)) throw new Error('Unknown creative persona.');
      for (const reference of creative.designReferenceIds) if (!patterns.has(reference)) throw new Error('Unknown design reference.');
      if (!creative.claimNotes.length) throw new Error('Creative claim limitations are required.');
    }
    for (const persona of personas) for (const stage of AWARENESS_STAGES) {
      if (artifact.creatives.filter(item => item.personaId === persona.id && item.awarenessStage === stage).length !== 1) throw new Error('Missing or duplicated persona-awareness cell.');
    }
  }
  return artifact;
}
