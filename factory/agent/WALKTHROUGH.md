# Six-minute interview walkthrough

Prepare `npm run agent:samples`, `npm run agent:studio`, and a native simulator preview of a completed
generated app. Keep source open at the functions below. Use a live run only
after you have tested credentials, model access and the full task beforehand.

## 0:00–0:40 — State the problem and boundaries

“I built a multi-agent research-to-prototype system around a maintained iOS app
foundation. It separates evidence gathering, criticism, product decisions,
implementation and verification. The supervisor owns permissions and completion
conditions. This recording uses an inspectable snapshot of real Reddit, App Store,
vendor and public ad sources. Persona and product interpretations remain
hypotheses. Generation, export, checks and state persistence execute for real.”

## 0:40–1:40 — Launch and inspect the decision

Launch the sample mission with repair enabled. Show the researcher and competitor
tasks, the analyst's evidence references, and the critic requesting follow-up.
Open Specification and click an evidence ID to demonstrate provenance. Explain
that the numerical ranking is a heuristic, not a measured market probability.
Approve the exact specification and show that building starts only afterward.

For the sourced samples, show the Reddit/App Store filters, a review locator and
an original Finch ad reference. Explain that the ad is indexed by a third party
and direct Meta delivery verification is unavailable. In Personas, connect an
evidence-backed behavior hypothesis to its five awareness stages. In Creatives,
filter a persona and stage, then download an original draft and the launch ZIP.
The separate fixture demo remains available to demonstrate an injected repair.

## 1:40–2:40 — Show actual execution and the prototype

Open Trace. Show `generate_app`, `read_file`, `write_file`, and `run_checks`.
Point out the labeled fixture injection and subsequent `repair_requested` event.
Show failed compiler output, corrected source, and final successful checks.
Switch to the already prepared native preview: add an action, complete it and
reopen the screen to inspect persistence. Do not describe simulator behavior as
verified unless you actually performed this step.

## 2:40–4:10 — Walk through the difficult source

1. `orchestrator.mjs`, `drive`: deterministic transitions, parallel research,
   bounded follow-up, approval and repair. `executeRole`: dependency-scoped
   context, runtime validation and tool allowlists.
2. `provider.mjs`, `runAgent`: model tool-call loop, corrected calls, stateless
   continuation and synchronous shared budget reservations.
3. `tools.mjs`, `generate` and `writeSource`: crash recovery, identity-safe
   generation and path/permission checks. `verify`: fixed verification commands.

Explain one tradeoff: roles coordinate through validated artifacts rather than
unrestricted shared chat; the supervisor constrains which work can occur next.
One model can serve all roles—separate role contexts and capabilities are the
coordination boundary.

## 4:10–5:10 — Demonstrate reliability

Show a test for stale specification approval or forbidden researcher writes.
Show pause/resume and the unchanged run ID. Explain that checkpoints reuse
completed tasks; an interrupted task can be reissued, so mutating tools need
idempotent behavior. The generator's staging journal handles this case.

Mention limits precisely: provenance verifies source URLs were returned by
search, not the truth of every claim. Fixed tests cover foundation regressions;
new UI behavior still requires native review. Application tool controls are not
an operating-system sandbox.

## 5:10–6:00 — Show contributions and evidence

```sh
git log --date=short --pretty=format:'%h %ad %s' -- factory/agent factory/create-app.mjs
git diff --stat
npm run agent:test
```

Show the exported JSON trace and actual check output. Explain your own design,
review and validation work, and describe AI-assisted implementation accurately.
Only claim committed contributions after creating real reviewed commits; the
implementation does not manufacture history or performance metrics.

Close with the next engineering step you would choose: live evaluation across
several briefs, stronger claim-to-source checking, a sandboxed runner, or native
acceptance tests. Pick one and explain why it would reduce the largest remaining
uncertainty.
