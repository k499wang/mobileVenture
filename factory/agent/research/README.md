# Curated Finch and Chillio source snapshot

Prepared October 16, 2026. These are real public-source observations collected
before the sample runs, not live model tool calls, invented customer interviews,
or a representative survey. Loading a sample executes deterministic decision
templates against this inspectable snapshot; generation and file checks are real.

The snapshot contains **27 records across 21 distinct source URLs**:

- Nine first-hand Reddit discussion records, including supportive, mixed and
  critical Finch accounts and two Chillio discussions.
- Nine App Store review themes across US, Canadian and Australian storefronts.
  Locators identify the app, storefront, review title and displayed date.
- Five official product/help and public ScreensDesign reference records.
- Four ad/campaign evidence records: two inspected static-image references, one
  director-hosted film, and one supporting cofounder campaign announcement. The
  announcement is not counted as a separate ad.

See [reddit.json](reddit.json), [app-store.json](app-store.json),
[product-design.json](product-design.json), and [ads.json](ads.json). Records
contain exact URLs, retrieval times, attributed summaries and limitations.
Reddit excerpts are short quotations. App Store content is paraphrased; review
locators identify the underlying source. Several themes can come from one page
or respondent and must not be counted as independent participants.

## What the sources support

[Finch community discussion](https://www.reddit.com/r/finch/comments/16z2hyp/has_this_really_helped_you/)
contains differing experiences of pet rewards and task lists. A separate
[discussion about keeping Finch for self-care](https://www.reddit.com/r/finch/comments/1qdd52f/for_me_finch_is_only_for_selfcare/)
offers a counterpoint to assuming more tasks always help. These are individual
reports, not verified effects.

[Finch App Store reviews](https://apps.apple.com/us/app/finch-self-care-pet/id1528595748?see-all=reviews)
include enthusiasm for small actions and customization. [Chillio's US listing
and reviews](https://apps.apple.com/us/app/chillio-life-planner/id6748603301)
include positive first-use reports and complaints about reliability or
advertising expectations. Complaints remain attributed historical allegations;
the current app was not installed to reproduce them.

[Official Finch goal documentation](https://help.finchcare.com/hc/en-us/articles/37779940291213-Creating-and-Completing-Goals)
and [public ScreensDesign commentary](https://screensdesign.com/articles/finch-app-onboarding-design/)
inform the original checklist prototype. No authenticated ScreensDesign or
AppGazers MCP session was used for this snapshot; gated screens, revenue estimates
and conversion claims were not adopted.

## Original ad references

The static references are publicly indexed as Finch ads by Crush:

- [Bathroom checklist reference](https://trycrush.ai/ad-library/ad/945085508532759).
- [Weekly cleaning reference](https://trycrush.ai/ad-library/ad/1652192745771891).

The thumbnails were visually inspected and saved unmodified. Original URLs,
SHA-256 hashes and rights notes are in `ads.json`; the dashboard serves only listed
files after checking their hashes. Direct Meta pages were inaccessible, so
attribution, start dates and delivery are **third-party-indexed**, not independently
verified in Meta.

The [director-hosted film](https://vimeo.com/1202213611) supplies a primary campaign
artifact. Its metadata/credits were inspected; the full film was not played. It
does not establish Meta delivery. Performance is unknown for every reference.
Counts, longevity and public placement do not prove CTR, CPA, ROAS or success.

Some images contain unsupported health/outcome claims. These are observed
competitor claims, not approved project copy. Original images are excluded from
generated ZIPs; no campaign-reuse license is asserted. Generated statics use
original vector illustrations and new copy.

## Interpretation and maintenance

Personas, product opportunities and awareness stages remain hypotheses.
Illustrative persona language is not a customer quotation. ADHD-friendly is a
design intention, not a diagnosis, clinical efficacy claim or health-targeting
audience.

The self-help Chillio app is identified by Apple ID `6748603301` and corroborating
`get-chillio.app` references. Unrelated cleaning and media-player apps are excluded.
One positive Reddit post lacks a product-domain link; its identity and authenticity
limitation remains visible and it should not support a decision alone.

Unknown publication years and relative ages are not converted to exact dates.
Prices and ratings are not generalized across countries. Refresh sources before
a new decision; increment `CURATED_VERSION` when the snapshot changes so seeding
creates newly reviewable runs.
