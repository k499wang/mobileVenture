# Static creative exports

`renderCreativePack` converts structured creative concepts into deterministic original vector layouts and actual PNG exports using Sharp. It does not reproduce sourced screenshots, fabricate campaign performance, publish campaigns, or invoke generated code.

Each concept produces square (1080 × 1080), portrait (1080 × 1350), and story (1080 × 1920) files, each in PNG and editable SVG. Typography, palette, CTA, and original product UI illustration are generated in code. Long copy fails explicitly instead of silently clipping. Concepts are labeled as demo or unpublished.

Exports live exclusively in `<runDir>/creatives/`: `manifest.json`, `ad-copy.csv`, `source-references.json`, `qa.json`, plus image files. CSV cells neutralize spreadsheet formula prefixes. Source references retain persona, awareness stage, evidence IDs, design reference IDs, and claim notes.

```js
import { renderCreativePack, validateCreativePack } from './creatives/render.mjs';
const creativePack = await renderCreativePack({
  runDir, brand: { name: 'Daylight' }, spec,
  personaArtifact, creativeArtifact, mode: 'demo',
});
const report = await validateCreativePack({
  runDir, creativePack, creativeArtifact, personaArtifact,
});
```

QA verifies file signatures/dimensions and provenance, and requires all three PNG formats for all five awareness stages **for each expected persona**. QA is structural, not a claim of Meta policy approval, visual quality, or successful ad performance. The renderer rejects unsafe identifiers, symlink output directories/files, excessive inputs, and manifest traversal. Orchestration is responsible for authorizing `runDir` before invoking it.

Run tests with `node --test factory/agent/creatives/render.test.mjs`. Dependencies are isolated in `factory/agent/package.json`; install using `npm install --prefix factory/agent`.
