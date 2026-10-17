import { readFile } from 'node:fs/promises';

export const CURATED_VERSION = 1;
const evidenceKeys = ['id', 'url', 'title', 'claim', 'kind', 'retrievedAt', 'sourceType', 'fixture'];
const pickEvidence = (record) => Object.fromEntries(evidenceKeys.map((key) => [key, record[key]]));

/** Sources were opened during preparation; loading this snapshot performs no live search. */
export async function loadCuratedResearch() {
  const [reddit, reviews, product, adRecords] = await Promise.all(
    ['reddit', 'app-store', 'product-design', 'ads'].map(async (name) =>
      JSON.parse(await readFile(new URL(`./${name}.json`, import.meta.url), 'utf8')),
    ),
  );
  const records = [...reddit, ...reviews, ...product, ...adRecords];
  if (new Set(records.map((item) => item.id)).size !== records.length)
    throw new Error('Curated evidence IDs must be unique.');
  for (const record of records) {
    const url = new URL(record.url);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      record.fixture !== false ||
      url.hostname.endsWith('.example')
    )
      throw new Error('Curated research requires real, explicitly sourced URLs.');
    if (!Number.isFinite(Date.parse(record.retrievedAt)))
      throw new Error('Curated source retrieval date is required.');
  }
  const commonLimitations = [
    'A selected public-source snapshot, not representative market validation.',
    'Public reviews are attributed experiences and allegations, not independently reproduced defects or clinical findings.',
    'No sensitive personal disclosures are used as advertising audiences.',
    'Research was curated before this run; no live search or authenticated vendor session is implied.',
  ];
  const researchRecords = [...reddit, ...reviews];
  const competitiveRecords = product.filter(
    (item) => item.id !== 'finch-official-goal-controls' && !item.sourceType.startsWith('screensdesign'),
  );
  const designRecords = product.filter(
    (item) => item.id === 'finch-official-goal-controls' || item.sourceType.startsWith('screensdesign'),
  );
  const publicDesign = product.find((item) => item.id === 'screensdesign-finch-public-onboarding');
  const artifacts = {
    researcher: {
      summary:
        'Selected Finch and Chillio Reddit discussions and App Store reviews show enthusiasm for small actions alongside task overload, setup friction, reliability concerns and advertising-expectation gaps. Reports conflict; no prevalence or causal conclusion is established.',
      evidence: researchRecords.map(pickEvidence),
      limitations: commonLimitations,
    },
    competitor: {
      summary:
        'Publisher-described capabilities for Finch and Chillio, separated from customer allegations and unverified performance estimates.',
      evidence: competitiveRecords.map(pickEvidence),
      competitors: [
        {
          name: 'Finch: Self-Care Pet',
          positioning:
            'Publisher describes a virtual companion linked to personal goals and self-care activities.',
          pricing:
            'Core features described as free; optional Plus benefits. Current storefront price was not independently checked.',
          evidenceIds: ['finch-official-small-goals', 'finch-official-free-plus'],
        },
        {
          name: 'Chillio: Life Planner',
          positioning:
            'Publisher describes recurring habits, progress tracking and reward currency. Individual reviews report both encouragement and friction.',
          pricing:
            'Paid subscription options are listed; no current purchase, regional price or trial terms were tested.',
          evidenceIds: ['chillio-official-store-capabilities'],
        },
      ],
      limitations: [
        ...commonLimitations,
        'Chillio is identified by Apple app ID6748603301; unrelated cleaning and media-player apps were excluded.',
      ],
    },
    designer: {
      summary:
        'Public ScreensDesign Finch onboarding references and official goal-flow documentation inform an original, small-action checklist. No gated screens or authenticated MCP data were retrieved.',
      evidence: designRecords.map(pickEvidence),
      patterns: [
        {
          id: 'single-next-action',
          name: 'Clear action hierarchy before decoration',
          referenceUrl: publicDesign.url,
          evidenceIds: [publicDesign.id],
          application:
            'Give each checklist card one clear completion action and make the saved state visible.',
          avoidCopying:
            'Use original layout and illustration; do not reuse Finch characters, screens or claims.',
        },
        {
          id: 'editable-personal-goals',
          name: 'Keep user-defined goals explicit',
          referenceUrl:
            'https://help.finchcare.com/hc/en-us/articles/37779940291213-Creating-and-Completing-Goals',
          evidenceIds: ['finch-official-goal-controls'],
          application: 'Let people add their own small action and inspect its completed state.',
          avoidCopying: 'Borrow the task principle, not a competitor screen or reward system.',
        },
      ],
      direction: {
        tone: 'Encouraging, concrete and non-diagnostic',
        layout: 'Readable checklist cards and a clear next action; avoid a crowded reward dashboard',
        typography: 'Foundation text tokens and accessible heading hierarchy',
        colorGuidance: 'Foundation theme tokens for the app; original warm and calm export palettes',
      },
      limitations: [
        ...commonLimitations,
        'Public design commentary cannot establish conversion or retention effects.',
      ],
    },
    ads_research: {
      summary:
        'Two public indexed Finch static-ad images were visually inspected. A creator-hosted brand film and cofounder statement add primary campaign context. Direct Meta delivery verification was unavailable.',
      evidence: adRecords.map(pickEvidence),
      ads: adRecords
        .filter((record) => record.ad?.format !== 'campaign-announcement')
        .map((record) => ({
          id: `reference-${record.ad.id}`,
          advertiser: record.ad.advertiser,
          libraryUrl: record.url,
          hook: record.ad.hook,
          format: record.ad.format,
          awarenessStage: record.ad.awarenessStage,
          angle: record.ad.angle,
          evidenceIds: record.ad.evidenceIds,
          performance: 'unknown',
        })),
      coverage:
        'Selected publicly accessible references, not an exhaustive or live Meta account export. Index attribution is not direct Meta verification. Campaign announcements are not counted as additional distinct ads.',
      limitations: [
        ...commonLimitations,
        'No spend, CTR, CAC, ROAS, delivery status or advertising effectiveness is known.',
        'Observed competitor claims are not adopted in original concepts. Source images are research references, not licensed advertising assets.',
      ],
    },
  };
  return {
    version: CURATED_VERSION,
    artifacts,
    records,
    sourceDetails: Object.fromEntries(records.map((record) => [record.id, record])),
    sources: Object.fromEntries(
      Object.entries(artifacts).map(([role, artifact]) => [
        role,
        [...new Set(artifact.evidence.map((item) => item.url))],
      ]),
    ),
    sourceCount: new Set(records.map((record) => record.url)).size,
  };
}
