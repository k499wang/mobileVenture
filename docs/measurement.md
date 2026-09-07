# Measurement contract

| Event/data | Owner | Destination |
| --- | --- | --- |
| App lifecycle | PostHog SDK | PostHog |
| Onboarding steps/completion, product activation | App typed event API | PostHog |
| Selected non-revenue conversions | AppsFlyer SDK | AppsFlyer, configured partner mappings |
| Paywall requested/result | App billing service | PostHog |
| Actual RevenueCat paywall impressions/interactions | RevenueCat integration | PostHog |
| Trials, initial purchases, conversions, renewals, refunds | RevenueCat integration | AppsFlyer and PostHog |
| Campaign optimization events | AppsFlyer partner configuration | Meta |

Never map `paywall_requested` to checkout or purchase. It includes requests whose presentation may fail. Never send client revenue in parallel with RevenueCat's revenue integration. Add required product-specific properties to `EventMap`; avoid free-form event names and PII.

RevenueCat `$posthogUserId` matches the PostHog distinct ID, including anonymous usage. `$appsflyerId` is the AppsFlyer install UID, not your account ID. AppsFlyer customer user ID is set to RevenueCat's current app user ID. Account changes use Supabase's stable user UUID when enabled. Dashboard integrations are still required.

For every app, configure Meta partner activation, event mappings/postbacks, and SKAN conversion values in AppsFlyer. Verify both event delivery and optimization eligibility. Avoid adding Meta SDK/CAPI or purchase connector revenue as another path without a documented deduplication design.

Server-delivered revenue can arrive while the app is closed. That does not guarantee an on-device SKAN conversion update within its window. Test the initial trial/purchase timing against the chosen schema, including an immediate app close. Do not add duplicate client revenue to compensate.

Keep development/sandbox data out of production dashboards. Record campaign/creative identifiers where attribution provides them; respect restricted/aggregate attribution instead of inventing user-level campaign data. Do not add user-level SDK installs to SKAN installs as if they were disjoint populations.

Suggested cohort reporting: activation, trial start, trial-to-paid conversion, retention, refunds, realized revenue, acquisition cost, and payback by app/campaign/creative. Use one documented gross/net revenue basis across integrations.

Sources checked for this foundation:

- [Expo 57](https://docs.expo.dev/versions/v57.0.0/)
- [RevenueCat AppsFlyer integration](https://www.revenuecat.com/docs/integrations/attribution/appsflyer)
- [RevenueCat PostHog integration](https://www.revenuecat.com/docs/integrations/third-party-integrations/posthog)
- [AppsFlyer Meta SKAN setup](https://support.appsflyer.com/hc/en-us/articles/360017095198-SKAdNetwork-SKAN-interoperation-with-Meta-ads)
- [AppsFlyer conversion values and S2S timing](https://support.appsflyer.com/hc/en-us/articles/4403727223185-SKAN-Conversion-Studio)

The installed AppsFlyer 7 `MIGRATION.md` defines the listener/start lifecycle used here. Recheck it when upgrading the SDK.
