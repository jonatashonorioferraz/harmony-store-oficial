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
