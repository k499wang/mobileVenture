/** Curated-research scenarios with explicitly hypothetical product decisions. */
export const SAMPLES = [
  { id: 'gentle-routines', name: 'Little Steps', description: 'Gentle daily actions inspired by the tone of Finch and Chillio.', brief: 'Explore an ADHD-friendly gentle-routine concept inspired by Finch and Chillio. Use curated Reddit reviews, App Store reviews, and public Finch ad creative sources, make no medical claims, and build a simple add-and-complete checklist with local persistence and no punitive streaks. Create persona-aware static ad concepts without sensitive health targeting.' },
  { id: 'focus-starter', name: 'Focus Pocket', description: 'A small next-action list for getting started with less friction.', brief: 'Explore an ADHD-friendly task-starting concept inspired by Finch and Chillio. Use curated Reddit reviews, App Store reviews, and public Finch ad creative sources. Build a simple checklist where people manually add a small action and mark it complete. Do not promise a timer or AI task decomposition. Create respectful awareness-stage ad concepts without health targeting.' },
  { id: 'soft-reset', name: 'Soft Reset', description: 'A welcoming checklist for returning after a disrupted day.', brief: 'Explore an ADHD-friendly fresh-start concept inspired by Finch and Chillio. Use curated Reddit reviews, App Store reviews, and public Finch ad creative sources. Build a locally saved add-and-complete checklist with welcoming language and no missed-day penalties. No diagnosis or treatment claims. Create persona-aware static ad concepts without sensitive health targeting.' },
];
const content = {
  'gentle-routines': { slug: 'little-steps', title: 'One little step is enough.', body: 'Add a small action and complete it when it fits.', problem: 'An elaborate routine can feel like too much to begin.', hypothesis: 'A small, manually chosen action may make a gentle routine easier to start.', segment: 'People who prefer gentle, flexible routines', personas: ['The gentle routine builder', 'The small-win seeker'], jobs: ['Keep a simple routine without pressure from missed days.', 'Choose one manageable action and see it completed.'], headlines: ['A little room for one small step.', 'Your routine can start small.', 'Try a gentler next-action list.', 'Meet Little Steps.', 'Add your first little step.'], hooks: ['A busy day can still have room for one small action.', 'Starting small is an option.', 'Choose an action, then mark it complete.', 'A calm checklist for your own small actions.', 'Your next little step is yours to choose.'] },
  'focus-starter': { slug: 'focus-pocket', title: 'Start with one small action.', body: 'Write your next action. Mark it done when you finish.', problem: 'A long list can make choosing where to start difficult.', hypothesis: 'A short list of manually chosen next actions may reduce friction in getting started.', segment: 'People who want a clearer place to start', personas: ['The hesitant starter', 'The next-action chooser'], jobs: ['Choose a small action when a project feels sprawling.', 'Keep a short list of actions I can finish one at a time.'], headlines: ['Where could you start?', 'A long list can start with one action.', 'Try a smaller next step.', 'Meet Focus Pocket.', 'Write your first next action.'], hooks: ['One clear action can be a place to begin.', 'You choose how small the first action should be.', 'Write a small action and mark it done.', 'A simple checklist for choosing your next action.', 'Open a little space for a first step.'] },
  'soft-reset': { slug: 'soft-reset', title: 'There is room to begin again.', body: 'Add an action for today. Return when you are ready.', problem: 'Returning to a routine after a disrupted day can feel discouraging.', hypothesis: 'Welcoming language and a simple checklist without missed-day penalties may support a fresh start.', segment: 'People returning to a routine after a disrupted day', personas: ['The fresh-start returner', 'The flexible-day planner'], jobs: ['Return to a routine without being judged for a missed day.', 'Choose a manageable action after plans change.'], headlines: ['A new moment to begin.', 'Plans change. A small action can fit.', 'Try a softer fresh start.', 'Meet Soft Reset.', 'Choose your next small action.'], hooks: ['A disrupted day can have another beginning.', 'You can return at your own pace.', 'Make a small list for the moment you have.', 'A welcoming checklist with no missed-day penalties.', 'Add one action and begin where you are.'] },
};
export function sampleScreenCopy(id) { const item = content[id]; return item ? { eyebrow: 'YOUR NEXT SMALL ACTION', title: item.title, body: item.body } : undefined; }
export function applySampleArtifact(role, context, artifact) {
  const sample = SAMPLES.find((entry) => entry.id === context.sampleId);
  if (!sample) return artifact;
  const data = content[sample.id];
  const result = structuredClone(artifact);
  const roleId = typeof role === 'string' ? role : role.id;
  const disclaimer = 'Product and persona hypotheses interpret curated source material; they are not validated market conclusions.';
  const curated = context.curatedResearch?.[roleId];
  if (curated && ['researcher', 'competitor', 'designer', 'ads_research'].includes(roleId)) return structuredClone(curated);
  // Research records are supplied by the curated source layer and never rewritten here.
  if (['researcher', 'competitor', 'designer', 'ads_research'].includes(roleId)) return result;
  if (context.curatedResearch) {
    const research = context.curatedResearch.researcher?.evidence ?? [];
    const competitors = context.curatedResearch.competitor?.evidence ?? [];
    const ads = context.curatedResearch.ads_research?.evidence ?? [];
    const mapping = { 'need-flexibility': research.find(item => item.id === 'reddit-finch-overloaded-lists')?.id ?? research[0]?.id,
      'follow-up-schedule': research.find(item => item.id === 'appstore-finch-gentle-return')?.id ?? research[1]?.id,
      'competitor-calendar': competitors[0]?.id, 'ad-gentle-progress': ads[0]?.id };
    const walk = value => {
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        if (key === 'evidenceIds') value[key] = child.map(id => mapping[id] ?? id);
        else if (Array.isArray(child)) child.forEach(walk);
        else walk(child);
      }
    };
    walk(result);
  }
  if (roleId === 'critic' && context.curatedResearch) {
    return { verdict: 'accept', summary: 'The curated snapshot includes supportive, mixed and critical accounts plus publisher documentation. Proceed only as a bounded prototype hypothesis.',
      issues: ['Sources are selected, self-reported and non-representative.', 'Some reviews may describe older app versions.', 'Ad index attribution does not verify Meta delivery or effectiveness.'], followUpQueries: [] };
  }
  if (roleId === 'analyst') { result.summary = `${sample.name} is an unvalidated prototype hypothesis.`; for (const item of result.opportunities) { item.title = `${sample.name}: a small-action checklist`; item.rationale = data.hypothesis; item.assumptions = [disclaimer, 'ADHD-friendly is a design intention, not evidence of a clinical benefit.']; } }
  if (roleId === 'persona') {
    result.summary = `Two behavioral hypotheses for ${sample.name}; no sensitive-health audience targeting.`;
    result.personas = result.personas.map((persona, index) => ({ ...persona, name: data.personas[index % 2], segment: data.segment, jobToBeDone: data.jobs[index % 2], confidence: 'hypothesis', triggers: ['A routine feels too elaborate', 'An opportunity to take one small action'], frustrations: [data.problem], desiredOutcome: 'A manually chosen small action completed without pressure', objections: ['Another complicated tool', 'Pressure from missed-day streaks'], languageExamples: ['I want one clear next action.'] }));
    for (const persona of result.personas) for (const item of persona.awareness) item.belief = item.belief.replaceAll('Shift Flow', sample.name);
    result.limitations = [disclaimer, 'Personas describe behavior, not diagnosed conditions or targetable health audiences.'];
  }
  if (roleId === 'planner') {
    Object.assign(result, { name: sample.name, slug: data.slug, targetUser: data.segment, problem: data.problem, hypothesis: data.hypothesis });
    result.features = [{ id: 'flexible-checklist', title: data.title, description: data.body, evidenceIds: result.evidenceIds, acceptanceCriteria: ['A user can manually add a non-empty action.', 'A user can mark an action complete.', 'Actions persist after reopening the screen.', 'No punitive missed-day streak is shown.'] }];
    result.nonGoals = ['Diagnosis or treatment', 'Sensitive-health ad targeting', 'Timers or AI task decomposition', 'Exhaustive competitor research or market validation', 'Campaign publishing or measured ad results'];
  }
  if (roleId === 'creative') {
    const stages = ['unaware', 'problem_aware', 'solution_aware', 'product_aware', 'most_aware'];
    result.summary = `Ten ${sample.name} concepts across two behavioral personas and five awareness stages. Original draft campaign; no ads published.`;
    result.creatives = result.creatives.map((creative) => { const index = stages.indexOf(creative.awarenessStage); return { ...creative, headline: data.headlines[index], hook: data.hooks[index], primaryText: `${data.body} A simple checklist, at your pace.`, description: 'Choose one small action.', cta: ['Explore the idea', 'See a small step', 'Explore the checklist', 'See how it works', 'Choose your first action'][index], visualConcept: `Original ${sample.name} checklist illustration; no health assertions or copied competitor screens.`, claimNotes: ['Behavioral messaging only; no sensitive health targeting.', 'Prototype supports manually adding and completing checklist actions.', 'No clinical, productivity, or advertising performance results are claimed.'] }; });
  }
  if (roleId === 'builder') {
    result.summary = `Generated ${sample.name} with a locally saved add-and-complete checklist.${context.repairAttempt ? ' Repaired the explicitly injected demonstration defect.' : ''}`;
    result.limitations = [disclaimer, 'Checklist source is generated from a deterministic sample template.', 'Native simulator/device behavior still requires review.'];
  }
  if (roleId === 'experimenter') { result.summary = `${sample.name} experiment proposals only; no users enrolled or results measured.`; for (const experiment of result.experiments) experiment.hypothesis = data.hypothesis; }
  return result;
}
