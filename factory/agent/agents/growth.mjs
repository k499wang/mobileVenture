const text = { type: 'string' };
const texts = { type: 'array', items: text };
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const list = items => ({ type: 'array', items });
const choice = (...values) => ({ type: 'string', enum: values });

export const AWARENESS_STAGES = ['unaware', 'problem_aware', 'solution_aware', 'product_aware', 'most_aware'];
export const RESEARCH_ROLES = ['researcher', 'competitor', 'designer', 'ads_research'];
const stage = choice(...AWARENESS_STAGES);
const evidence = object({ id: text, url: text, title: text, claim: text,
  kind: choice('observation', 'inference', 'assumption'), retrievedAt: text, sourceType: text, fixture: { type: 'boolean' } });
const check = object({ name: text, passed: { type: 'boolean' }, detail: text });

export const growthRoles = [
  { id: 'persona', name: 'Audience strategist', description: 'Connects evidence to persona hypotheses and five awareness stages.', color: '#E6A7E0', tools: [] },
  { id: 'designer', name: 'Design researcher', description: 'Studies ScreensDesign references and proposes original interface patterns.', color: '#86D9E5', tools: ['web_search', 'query_research_source'] },
  { id: 'ads_research', name: 'Ad intelligence', description: 'Researches public Meta creative, messaging and coverage limits.', color: '#E9BD7B', tools: ['web_search', 'query_research_source'] },
  { id: 'creative', name: 'Creative strategist', description: 'Builds a persona × awareness creative matrix and static-ad copy.', color: '#F3A38C', tools: [] },
  { id: 'creative_qa', name: 'Creative reviewer', description: 'Verifies exported assets, dimensions, coverage and claim discipline.', color: '#AEC791', tools: ['inspect_creative_pack'] },
];

export const growthSchemas = {
  persona: object({ summary: text, personas: list(object({ id: text, name: text, segment: text,
    jobToBeDone: text, triggers: texts, frustrations: texts, desiredOutcome: text, objections: texts,
    languageExamples: texts, evidenceIds: texts, confidence: choice('hypothesis', 'supported'),
    awareness: list(object({ stage, belief: text, message: text, proofNeeded: text, cta: text })) })), limitations: texts }),
  designer: object({ summary: text, evidence: list(evidence), patterns: list(object({ id: text, name: text,
    referenceUrl: text, evidenceIds: texts, application: text, avoidCopying: text })),
  direction: object({ tone: text, layout: text, typography: text, colorGuidance: text }), limitations: texts }),
  ads_research: object({ summary: text, evidence: list(evidence), ads: list(object({ id: text, advertiser: text,
    libraryUrl: text, hook: text, format: text, awarenessStage: stage, angle: text, evidenceIds: texts,
    performance: choice('unknown') })), coverage: text, limitations: texts }),
  creative: object({ summary: text, creatives: list(object({ id: text, personaId: text, awarenessStage: stage,
    angle: text, hook: { ...text, maxLength: 90 }, headline: { ...text, maxLength: 54 }, primaryText: { ...text, maxLength: 500 }, description: { ...text, maxLength: 160 }, cta: { ...text, maxLength: 28 }, visualConcept: text,
    evidenceIds: texts, designReferenceIds: texts, claimNotes: texts,
    layout: choice('editorial', 'checklist', 'contrast'), palette: choice('sunrise', 'mint', 'lavender') })), limitations: texts }),
  creative_qa: object({ verdict: choice('pass', 'fail'), summary: text, checks: { ...list(check), maxItems: 200 }, limitations: texts }),
};

export const growthInstructions = {
  persona: 'Create 1–3 behavioral persona hypotheses from the supplied research, not invented interview subjects. Use explicit evidence IDs. Describe jobs, triggers, frustrations, desired outcomes, objections, and illustrative language (not fabricated customer quotes). Do not infer protected traits, health diagnoses or private attributes. Every persona must include all five awareness stages exactly once: unaware, problem_aware, solution_aware, product_aware, most_aware. Explain current belief, appropriate message, needed proof and call to action for each stage. Default confidence to hypothesis unless supplied evidence supports the segment; never claim statistical validation.',
  designer: 'Research interface patterns, onboarding and paywalls relevant to the brief. Prefer the assigned ScreensDesign MCP tools when configured; use query_research_source with only discovered allowed tool names. Otherwise use web search for public, cited references and explicitly record that authenticated ScreensDesign access was unavailable. Only use URLs returned by tools. Do not pretend you opened gated screens or retrieved an image you cannot inspect. Cite design evidence, identify patterns, and propose an original direction using foundation primitives and theme tokens. Never copy a competitor screen or logo. IDs must be unique across research roles. No medical claims; evidence.fixture must be false in live mode. Use context.currentTime for retrieval dates.',
  ads_research: 'Research public Meta/Facebook/Instagram ad messaging with assigned AppGazers or configured read-only ad-library MCP tools. Otherwise use public web search and say what is missing. Cite actual returned URLs and public ad library IDs/links where available. Missing data is unknown, never zero. Public ad presence, longevity or count does not establish CTR, spend, CAC, ROAS, revenue, targeting or profitability: performance must be unknown. Label inferred awareness stages and angles as analysis, not verified advertiser intent. If no ads can be verified, return an empty ads array with clear coverage limitations and sourced evidence about access/coverage. No invented competitors, numbers or quotes. Use unique evidence IDs and real retrieval dates. Do not create campaigns, spend money or publish.',
  creative: 'Produce a reviewable static-ad launch pack from the approved product specification, persona hypotheses, design references and ad research. For EACH supplied persona produce exactly one creative for EACH of the five awareness stages, max 15 creatives total. Each needs a distinct awareness-appropriate angle, hook, headline (max 54 characters), primaryText (max 500), description (max 160), CTA (max 28), visualConcept, evidenceIds and existing designReferenceIds. Use original copy, never competitor text or fake testimonials, statistics, urgency, discounts or proven outcome claims. Label hypotheses and planned tests. Do not imply knowledge of a viewer’s sensitive personal attributes. Use safe lowercase-hyphen IDs. Layout is editorial/checklist/contrast and palette sunrise/mint/lavender. The renderer creates square, portrait and story PNG/SVG assets. Product-aware copy can show the product; unaware copy starts with a relatable situation. A most-aware CTA must use a real available action, not an invented offer. No campaign publishing.',
  creative_qa: 'Call inspect_creative_pack and report every actual check with exact names and pass/fail results. Inspect copy and evidence from the supplied artifacts for unsupported claims, duplicated angles, awareness mismatch and misleading certainty. Add honest limitations and fail when a material issue remains. Programmatic asset dimensions and coverage are necessary but not a full creative or Meta policy review. Never claim Meta approval, live delivery, results, or device behavior. Only return pass if the actual pack checks passed and you found no material copy issue.',
};

const fixture = (id, claim, sourceType) => ({ id, url: `https://research.example/${id}`,
  title: `DEMO FIXTURE: ${id}`, claim, kind: 'observation', retrievedAt: '2026-10-15T00:00:00.000Z', sourceType, fixture: true });

const awareness = (name) => [
  { stage: 'unaware', belief: 'A changing day is just how things are.', message: 'Start with a familiar situation, not a product pitch.', proofNeeded: 'A relatable illustration; no performance claim.', cta: 'Explore a small change' },
  { stage: 'problem_aware', belief: 'Fixed routines can be hard to fit around changing days.', message: 'Name the friction without blaming the person.', proofNeeded: 'Explain the flexible workflow as a hypothesis.', cta: 'See a flexible routine' },
  { stage: 'solution_aware', belief: 'A flexible checklist could be worth trying.', message: 'Demonstrate choosing one action rather than a fixed time.', proofNeeded: 'A truthful product walkthrough.', cta: 'See how it works' },
  { stage: 'product_aware', belief: `I want to understand ${name} before trying it.`, message: 'Show the actual add-and-complete workflow.', proofNeeded: 'Working prototype behavior, with limitations.', cta: 'Explore the prototype' },
  { stage: 'most_aware', belief: 'I am ready to try one small routine.', message: 'Make the first action clear with no invented promotion.', proofNeeded: 'Access to the prototype; no paid offer implied.', cta: 'Try one small action' },
];

export function growthDemoArtifact(role, context = {}) {
  const artifacts = context.artifacts ?? {};
  switch (role) {
    case 'designer': return {
      summary: 'Illustrative design research; no authenticated ScreensDesign screens were retrieved.',
      evidence: [fixture('design-flexible-list', 'A synthetic design reference favors a single next action and generous spacing.', 'synthetic design-pattern fixture')],
      patterns: [{ id: 'single-next-action', name: 'One clear next action', referenceUrl: 'https://research.example/design-flexible-list',
        evidenceIds: ['design-flexible-list'], application: 'Use a calm checklist card and a single completion action.', avoidCopying: 'Original illustration and layout; no vendor screenshot or logo copied.' }],
      direction: { tone: 'Calm, practical and encouraging', layout: 'One main card, generous space, clear action hierarchy', typography: 'Readable foundation heading/body tokens', colorGuidance: 'Use foundation theme tokens; warm editorial ad palettes are separate export assets.' },
      limitations: ['Synthetic references only. ScreensDesign connection has not been authenticated.', 'This is design direction, not a verified competitor-screen audit.'],
    };
    case 'ads_research': return {
      summary: 'Synthetic public-ad analysis demonstrates messaging research, not live competitor intelligence.',
      evidence: [fixture('ad-gentle-progress', 'A fictional ad uses a small-action theme with a product checklist illustration.', 'synthetic Meta-ad fixture')],
      ads: [{ id: 'fictional-routine-ad', advertiser: 'Routine Example (fictional)', libraryUrl: 'https://research.example/ad-gentle-progress',
        hook: 'Make room for one small action.', format: 'Static product illustration', awarenessStage: 'solution_aware', angle: 'Gentle progress',
        evidenceIds: ['ad-gentle-progress'], performance: 'unknown' }],
      coverage: 'Fixture only; no live Meta Ad Library or AppGazers records retrieved.',
      limitations: ['Public creative cannot establish spend, CTR, CAC or ROAS.', 'No ads were published and no performance results exist.'],
    };
    case 'persona': return {
      summary: 'Two behavioral persona hypotheses for the illustrative flexible-routine concept.',
      personas: [
        { id: 'changing-days', name: 'The changing-day planner', segment: 'People whose daily availability varies',
          jobToBeDone: 'Keep a small routine without assigning it a fixed hour.', triggers: ['A day plan changes unexpectedly'],
          frustrations: ['A fixed reminder can arrive at the wrong moment'], desiredOutcome: 'An action list that fits the available moment',
          objections: ['Another complicated planning tool', 'Pressure from missed-day streaks'], languageExamples: ['I can do one thing when a moment opens up.'],
          evidenceIds: ['need-flexibility'], confidence: 'hypothesis', awareness: awareness(artifacts.planner?.name ?? 'Shift Flow') },
        { id: 'small-step-starter', name: 'The small-step starter', segment: 'People seeking a simpler starting point',
          jobToBeDone: 'Turn a vague intention into one manageable action.', triggers: ['A large to-do list feels difficult to begin'],
          frustrations: ['Too many steps before the first useful action'], desiredOutcome: 'A clear next action with a simple completion state',
          objections: ['Setup effort', 'A product that promises results it cannot prove'], languageExamples: ['Let me choose one small thing first.'],
          evidenceIds: ['need-flexibility'], confidence: 'hypothesis', awareness: awareness('Shift Flow') },
      ], limitations: ['Synthetic behavioral hypotheses, not actual interviewed customers or validated audience sizes.'],
    };
    case 'creative': {
      const personas = artifacts.persona?.personas ?? growthDemoArtifact('persona', context).personas;
      const options = [
        ['A little room in a changing day.', 'One small moment.', 'A day can change. A small action can still have a place in it.', 'Explore the idea', 'editorial', 'sunrise'],
        ['A fixed hour is not the only way.', 'Routines can be flexible.', 'Explore a routine that starts with a small action instead of a fixed reminder.', 'See a flexible routine', 'contrast', 'lavender'],
        ['Choose an action. Find your moment.', 'Start with one action.', 'A simple checklist is one way to explore a more flexible routine. See the prototype workflow.', 'See how it works', 'checklist', 'mint'],
        ['Meet a simpler next-action list.', 'Meet Shift Flow.', 'Add an action, complete it when it fits, and keep the list for later. An illustrative prototype, ready to explore.', 'Explore the prototype', 'checklist', 'sunrise'],
        ['One small action is a place to start.', 'Try your first action.', 'Open the prototype and choose one action that fits today. No invented offer, no outcome guarantee.', 'Try one small action', 'editorial', 'mint'],
      ];
      return { summary: 'Ten original static-ad concepts across two persona hypotheses and five awareness stages. Drafts only; no campaign results.',
        creatives: personas.flatMap((persona, personaIndex) => AWARENESS_STAGES.map((awarenessStage, index) => {
          const [hook, headline, primaryText, cta, layout, palette] = options[index];
          return { id: `${persona.id}-${awarenessStage.replaceAll('_', '-')}`, personaId: persona.id, awarenessStage,
            angle: `${personaIndex ? 'A simpler first step' : 'Flexible timing'} / ${awarenessStage.replaceAll('_', ' ')}`,
            hook, headline: personaIndex && index === 0 ? 'Begin with something small.' : headline,
            primaryText: personaIndex ? `${primaryText} Start with a single next step.` : primaryText,
            description: 'A flexible-routine prototype concept.', cta,
            visualConcept: 'Original typographic layout with a drawn routine-list interface; no copied screenshots.',
            evidenceIds: [...persona.evidenceIds, 'ad-gentle-progress'], designReferenceIds: ['single-next-action'],
            claimNotes: ['Persona and market evidence are synthetic fixtures.', 'No proven outcome, testimonial, discount or ad-performance claim.'], layout, palette };
        })), limitations: ['Concept assets, not published Meta ads.', 'Awareness classification is a messaging hypothesis, not verified audience intent.'] };
    }
    case 'creative_qa': return { verdict: 'fail', summary: 'Requires actual asset validation.', checks: [], limitations: ['Human creative review is still required.'] };
    default: return undefined;
  }
}
