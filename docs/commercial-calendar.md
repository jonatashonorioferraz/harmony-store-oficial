# Agenda Comercial Harmony

## Delivery boundary

This module is prepared on main 89ddf435aa54106503b5ebc41ca6e38c690e5acb.
Do not deploy it from an older local checkout. The working files are isolated.
Research is OFF in the migration and requires a second explicit server approval.
The module does not publish ads, enroll in marketplace campaigns, change inventory,
create production lots, or make payments.

## Three sources of information

- Recurring calendar: deterministic Brazilian dates and movable-date rules.
  This is a curated starting set, not every possible commemorative date.
- Marketplace forecasts: double dates are visibly predicted, never confirmed
  merely because the same date occurred last year.
- Public research: one bounded daily request, official domain allowlist, consulted
  source URLs, evidence and dates. Results always await administrator review.
- Internal plans may be created independently of platform announcements.

No private business, customer, payment or collaborator records are sent to the AI.
Suggestions shown before AI activation are editorial rules, not AI predictions.

## Administration and safety

Only active administrators can read or change this module through its RPCs.
New tables have RLS with no direct anonymous/authenticated table grants.
Security-definer functions use an empty search_path and qualified application
tables. Service-only RPCs additionally require the service_role JWT claim.
Plans use expected revisions to prevent stale saves from replacing newer work.
Source decisions and plan revisions are written to an append-only audit table.
Paid-research credentials are server-only; the UI cannot enable research or raise
its budget.

Ready/live plans require all four checks. This is a preparation gate, not proof
that an advertisement is live or that stock has been reserved.
Preparation dates use calendar days. Freight and production lead times must be
reviewed by the business before promising a customer delivery.

## Proposed R$30 control, not a billing guarantee

The initial internal budget is 3000 cents per Sao Paulo calendar month.
Each attempted daily research run reserves 100 cents BEFORE contacting the
provider, including failed attempts. There is at most one attempt per local day.
No automatic retries or refund of failed reservations are allowed. With these
defaults, the 31st attempt in a month is blocked.

These reservations are NOT actual BRL invoices. The provider bills usage in USD;
exchange rates, taxes and changes in pricing can differ. Do not describe this as
a guaranteed R$30 payment cap. Before activation, approve and document the current
model/tool prices, an FX assumption, a conservative per-run reserve and available
provider-level safeguards. If the computed reserve exceeds R$1, raise the per-run
reserve (up to the existing R$30 ceiling), reducing the number of daily searches.
Do not raise the monthly ceiling without new user approval.

Prepared request: gpt-4.1-mini-2025-04-14, Responses web_search, one tool call,
low search context, at most 3000 output tokens, store:false, 65-second timeout.
The initial selection needs a real availability/price review before activation.
A timeout might still consume provider usage; its reservation is retained.

References consulted during preparation:
- https://developers.openai.com/api/docs/guides/tools-web-search
- https://developers.openai.com/api/docs/models/gpt-4.1-mini
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://supabase.com/docs/guides/functions/schedule-functions

## Source coverage and freshness

The starting allowlist contains official Shopee, Mercado Livre, Sebrae and
government domains. Public search cannot see all announcements behind seller
login. It cannot guarantee coverage of every event or every marketplace.
A completed research with no results is not proof that no campaigns exist.
Incomplete, malformed or unverifiable results fail closed.
The UI distinguishes disabled, unconfigured, running, failed, stale (>36 hours)
and budget-blocked research. Confirmed sources retain their consultation date;
search does not silently change a human-approved record.
Changed evidence creates another pending proposal for review.

## Isolated checks

Node unit/security-contract tests:
    node --test tests/commercial-calendar.test.mjs

SQL integration, with an existing isolated @electric-sql/pglite installation:
    $env:PGLITE_ROOT = 'absolute-path-to-isolated-installation'
    node scripts/test-commercial-calendar-sql.mjs

PGlite uses a new in-memory database with fictitious profiles. It never connects
to Supabase. The SQL harness is separate from npm test because the main app does
not currently declare PGlite as a dependency.
Run project lint, mirror verification and the main suite in CI before publishing.
The isolated browser preview uses only fixtures, prominently marked as examples.

## Deployment sequence (requires approval)

1. Review the PR and checks against the then-current main.
2. Apply ONLY the new migration to the correct project, tyzfznwvjzmudxtcbbaf.
   Do not bulk db push an unrelated local migration history.
3. Deploy the frontend with matching root/web assets and cache versions.
   The base calendar is usable even if the RPC is temporarily unavailable,
   but planning writes stay disabled with a visible error.
4. Keep enabled=false, pricing_approved=false, CALENDAR_RESEARCH_APPROVED unset.
5. Present final research configuration and cost assumptions to the user.
6. Only after separate activation approval: deploy the Edge Function with its
   own secret authentication, set secrets, approve settings and use the manual
   supabase/operations/enable-commercial-calendar-sync.sql runbook.
   This runbook is deliberately NOT part of migrations.
7. Confirm cron and source freshness without creating actual campaigns.

The prepared schedule is 10:00 UTC (07:00 Sao Paulo under current time-zone
rules). It runs in Supabase, not in a local Codex heartbeat. No local research
automation is created by this module.

## Pause and recovery

Set settings.enabled=false to block claims, then unschedule only
harmony-commercial-calendar-daily. Do not remove other reminders.
Failed/stale runs retain reservations and prior evidence. Investigate failure
codes, credentials or source coverage; never silently reinterpret failure as zero
new events. Refresh the UI before resolving an optimistic-write conflict.

## Multi-marketplace activation (2026-10-01)

The coverage update adds SHEIN to plans, proposals, schema checks and official
sources. Shopee, Mercado Livre and SHEIN each receive one independent public
research request per daily cycle. A failure in one channel does not erase valid
proposals in another. The ledger records completed/partial/failed and each
channel outcome. No accessible official sources means unavailable, not zero.

Seasonal dates can be planned for each marketplace and are explicitly labelled
as planning opportunities, never platform announcements. No invented double
dates are seeded for Mercado Livre or SHEIN. Existing campaign plans keep their
keys and no business records are sent to the provider.

The original single-call preparation above is superseded by THREE bounded calls:
one per marketplace, one web_search call each, max 3000 output tokens each,
max 6 proposals per channel, no retries, max 6000 UTF-8 bytes per request body,
65-second individual timeout, store:false. The SQL reservation remains atomic:
R$1 per daily cycle and R$30 per Sao Paulo calendar month. Failed attempts retain
their reservation. A 31st attempt in a month is blocked.

Pricing consulted 2026-10-01:
https://developers.openai.com/api/docs/pricing
https://developers.openai.com/api/docs/models/gpt-4.1-mini
Input USD0.40/M, output USD1.60/M, search USD0.01/call plus 8000 input tokens/call.
Conservative planning assumption: 6000 prompt tokens per request plus search
block and maximum output, 3 calls = USD0.0612; BRL8/USD and 50% margin = R$0.7344.
These are planning assumptions, not exchange-rate forecasts or invoice guarantees.
The R$1 reservation covers that assumption without raising the R$30 ceiling.
Provider hard caps for the existing shared API project were NOT confirmed or
changed: changing them might interrupt bills and other app AI features.

Deploy the additive 20261001123000 migration, publish reviewed assets, deploy only
sync-commercial-calendar with its dedicated secret authentication, then provision
Vault/Edge secrets and enable the daily 10:00 UTC cron. The new finish RPC is
service-only. No frontend credentials or direct table access are granted.

## Provider diagnosis and approved validation

Authenticated server-only preflight checks model access and counts input tokens;
it does not call response generation or run a search. Its result is NOT evidence
of successful research. Routine failures return only allowlisted metadata. Authenticated operator
preflight may include a bounded description with credentials and identifiers
redacted server-side; it never returns company documents.

The 20261001140000 migration preserves every daily run and permits multiple
attempt numbers only for an explicit expiring operator authorization. App users
and the Edge service cannot issue these authorizations. Each one can be consumed
once, reserves the same R$1 inside the same R$30 monthly ceiling and never refunds
a failed attempt. Normal cron still admits at most one daily attempt; it never
uses the exceptional header or issues authorizations. No retry is automatic.

## GPT-4.1 mini search compatibility (2026-10-01)

Live preflight identified HTTP 400: hosted search filters are not supported by
the configured GPT-4.1 mini snapshot. Keep the existing model and cost envelope.
Use Responses web_search with low context and no unsupported filters or live-access
flags. Queries explicitly include each channel's official domains and site: terms.
This prompt is guidance, NOT a security boundary: parseProposals independently
rejects every URL outside the channel allowlist or absent from actual search sources.
A search without an official consulted source is unavailable, never a successful zero.
No fallback to unofficial proposals, automatic retries, budget increase or shared-key
permission changes are introduced. Strict output schema remains enabled.

## Provider citation evidence (2026-10-01)

A completed web_search_call permits allowlisted URLs from provider url_citation
annotations as well as action.sources. URLs merely written inside generated JSON
are never evidence. Exact normalized URL matching still applies; arbitrary query
parameters are not discarded. Missing actual search, unofficial citations, incomplete
responses and unreferenced proposals continue to fail closed.

Secret-authenticated research responses include bounded counts and allowlisted public
source URLs for diagnosis, never raw provider prose, arbitrary external URLs or keys.
Token usage remains available for failed validation after a successful provider response.
The three independent requests, R$1 reservation, R$30 monthly ceiling and no-retry policy
are unchanged. Source availability is not a guarantee of complete marketplace coverage.
Reference: https://developers.openai.com/api/docs/guides/tools-web-search

## Exact attribution normalization (2026-10-01)

A live three-channel run demonstrated that official action.sources URLs contain
utm_source=openai while the matching generated proposal uses the original URL.
sourceUrl now removes ONLY one exact utm_source=openai marker before comparison.
Other query parameters and ambiguous duplicate attribution parameters remain intact.
Real public URLs from all three channels are regression fixtures; those offline tests
perform no provider calls. Historical failed runs and their reservations are preserved.
