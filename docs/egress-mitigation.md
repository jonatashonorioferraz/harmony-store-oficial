# Egress mitigation - phases 1 and 2

Local changes only; deployment is pending. Automated and isolated browser validation
completed on 2026-09-14. Authenticated end-to-end production workflows remain pending.

## Included

- Public product and shipping image URL expressions use a shared resizing helper.
- Catalog delivery uses 480px variants; other integrated screen helpers use 1024px,
  quality 85, contain variants without modifying stored originals.
- The request photo enlargement link and request PDF retain original URLs.
- Catalog images use lazy loading and asynchronous decoding.
- Image errors retry the original URL; three transformation failures disable new
  transformations for the remainder of the page session.
- New public uploads with UUID v4 paths are compressed only when the result is
  smaller, preserving the MIME type and file extension. Maximum dimension: 1600px.
- New immutable public uploads use a one-year browser cache header.
- Existing private buckets, authentication, permissions and database are unchanged.
- The PWA now caches immutable public product/shipping images for 24 hours, even
  when their upstream browser cache header is no-cache. The Cache API has its own
  explicit expiration policy (https://developer.mozilla.org/en-US/docs/Web/API/Cache).
- Public media cache is capped at 48 MB and 80 entries. Authorized requests, signed
  URLs, mutable paths, partial requests, errors and non-image responses are excluded.
- Reload/no-store/no-cache requests bypass this cache. Local public images can
  remain visible for up to 24 hours after their remote object is deleted; new versions
  must continue to use new UUID paths.

## Important limitations

- Existing objects still retain their original cache metadata.
- This is not a full thumbnail migration or a fix for private document downloads.
- Original URLs used outside the integrated expressions are not optimized.
- Supabase transformations have their own quota and can incur charges. Pro includes
  100 source images per billing cycle; resizing additional images is billable.
- Transformed images can appear in print views that reuse screen image URLs.
  Validate print quality before production deployment.
- Upload compression changes newly uploaded image resolution; existing originals
  are not rewritten or deleted.
- No indefinite client-side cache is applied to confidential documents.

## Required pre-deployment validation

Obtain authorization before running tests or builds. Check login, product lists,
image detail, image upload, shipping images, PDF/print, original-image fallback,
PWA update and mirrored files. Confirm Image Transformations is enabled and inspect
actual response cache headers and transferred sizes in the browser.

## Validation results - 2026-09-14

- Full suite: 336 tests passed, zero failures after updating app/PWA version
  expectations only; behavioral assertions were retained.
- Static build succeeded; 70 mirrored files matched.
- Edited JavaScript passed syntax checks.
- Local app rendered its login page; show/hide password control worked.
- Existing public image comparison returned HTTP 200 for both paths.
  Original: 2,069,455 bytes. 480px variant: 463,304 bytes (78% smaller).
- Browser-rendered original and variant were visually compared at screen size.
- The existing image and variant both returned Cache-Control: no-cache. Phase 2
  adds bounded local reuse in the PWA instead of re-uploading existing objects.
- Browser canvas test: 1,661,701-byte JPEG became 718,903 bytes, 1600x800px;
  MIME and authorization were retained, with max-age=31536000.
- Compression test intercepted the upload locally; no file was saved remotely.
- Original-image fallback succeeded in an isolated browser harness.
- No production deployment, authenticated transaction, real upload, metadata
  migration, quota monitor or physical PDF print was performed.
- The temporary harness is removed from dist/client after validation. Its source
  remains under tests/ and is not copied by the production build.

## Remaining phases

1. Optimize existing product images and cache metadata with a reversible backup.
2. Add smaller list-specific variants and lazy loading with explicit print handling.
3. Add private document session reuse with bounded memory and logout cleanup.
4. Compress document photographs only after validating barcode/OCR readability.
5. Establish daily usage measurement and quota thresholds; no monitor is configured
   by this change.

## Phase 2 validation - 2026-09-14

- Full suite: 346 tests passed, zero failures. Ten new runtime cache tests cover
  privacy exclusions, expiry, Accept negotiation, concurrent reads, storage/CORS
  failures, pruning and network-only behavior for private documents.
- Real browser PWA test: first image request returned x-harmony-media-source:
  network; the second returned local-cache, both HTTP 200 and 463,304 bytes.
- The first browser run still used the previous active worker. After page refresh
  and worker activation, local reuse was confirmed. Only the confirmed run is
  considered successful validation.
- Existing Supabase objects and their metadata were not rewritten. Public local
  cache is bounded and expires after 24 hours; private documents remain network-only.
- Authenticated application transaction/print checks are pending user sign-in.
- Deployment is blocked until those checks are completed. The existing Sites
  hosting manifest was identified; no hosting audience or deployment was changed.

## Authenticated read-only validation - 2026-09-14

- Local preview: http://127.0.0.1:4173/, primary administrator session supplied by the user.
- Catalog: 20 loaded images, 36 pending lazy images, no failed images at the observed viewport; visible product thumbnails used 480 px variants.
- Production order #0039: all 9 product photos loaded with 1024 px variants.
- Shipping plan #0005 and completed transfer #0015: product photos loaded with optimized variants.
- Request #0105: all 5 thumbnails loaded with 480 px variants. Enlarged photo loaded its original URL. All 5 images in the simplified visual list loaded original URLs; quantities remained visible. PDF generation was not exercised.
- Bills list and bill #0027 details loaded. The document-open action produced an active browser alert with no new tab. The alert text and underlying cause were not established; private document opening remains unvalidated. No private-document code was changed and private objects remain excluded from the public media cache.
- No payment, stock movement, order modification, deletion, or real upload was performed in this UI validation.
- Prior automated validation: 346 tests passed; static build and 70-file mirror synchronization checks passed. Isolated public-image comparison measured 78% fewer bytes for one sample, not an app-wide reduction guarantee.
- Publication is pending: the Sites lookup for the existing hosting manifest returned project-not-found. The user has been asked for the current publication panel link. No replacement hosting, domain change, or production deployment was attempted.
- Remaining work includes private-document diagnosis/optimization, quota alerting, and authorized production publication. This record does not mark the full mitigation plan complete.

## Private document opener and current-cycle baseline - 2026-09-14

- Root and official web bills.js now reserve an about:blank tab directly in the click handler, disconnect window.opener before the authenticated request, and then navigate to a temporary blob URL. A blocked tab returns before downloading any private bytes.
- Download errors close the waiting tab. HTTP status is reported without returning internal error details. Navigation failures revoke the blob URL; a tab closed during download does not receive one. The existing 60-second blob URL cleanup remains unchanged.
- No private persistence, shared cache, signed URL, bucket permission, bill record, payment workflow, or authentication policy was introduced or modified.
- The PWA shell revision is harmony-store-v25-96-r2. Existing tests were updated only where they asserted the prior shell revision.
- Seven new isolated runtime tests passed. The current tests directory passed all 353 tests, with zero failures. An earlier broad Node discovery also picked up historical backup tests; those backups are not the current release test suite. Static build succeeded.
- Browser retest did not establish successful document display. No document tab was observed in the managed tab list; a later dialog check found no active JavaScript dialog. Automated runtime coverage is not a substitute for a confirmed user-visible document opening. Release validation for this flow remains pending.
- The organization's current dashboard cycle is 14 Sep 2026 to 14 Oct 2026, Pro: Cached Egress 0.132/250 GB; uncached Egress 0.01/250 GB; image transformations 1/100. The usage page reports no exceeded quota. Egress can lag by one hour and transformation counts by 24 hours. These new-cycle values do not measure the impact of the unpublished changes.
- Account preferences confirm a primary email for account notifications. No custom warning threshold or automated quota monitor was configured, and no spend cap, subscription, or billing setting was changed.
- Proposed warning policy, not yet enabled: monitor cached and uncached egress separately at 70%, 85%, and 95%, with cycle-end projection based on recent growth; monitor transformed-source count separately because its included allowance is much smaller than egress allowances. The production monitor's existing health checks are not quota monitoring.
- Official references: https://developer.mozilla.org/en-US/docs/Web/API/Window/open and https://supabase.com/docs/guides/platform/manage-your-usage/egress .
- Publication remains blocked until the current hosting/publication panel is identified. No production deployment was performed.

## Hosting identification resolved - 2026-09-14

- User clarified that the existing workflow uses GitHub and Supabase.
- Local remote configuration identifies jonatashonorioferraz/harmony-store-oficial; the authenticated GitHub connector confirms access to that repository and default branch main.
- Root CNAME and official web/CNAME both contain app.harmonylembrancinhas.com.br.
- Public DNS CNAME for app.harmonylembrancinhas.com.br points to jonatashonorioferraz.github.io, identifying GitHub Pages as the frontend publication destination. Supabase remains the backend; the Sites manifest lookup is not the confirmed frontend publication path.
- The earlier request for another hosting panel link is no longer necessary for identifying the frontend host. Exact Pages source/branch settings and release readiness still need to be established before any publication mutation.
- Recent GitHub Actions include scheduled agenda reminders and availability monitoring. Their existence does not establish a quota alert monitor or prove a frontend deployment.
- No GitHub file update, commit, branch update, Pages setting change, Supabase deployment, domain change, or production publication was performed during this identification.


## Isolated GitHub proposal - 2026-09-14

- Based on official main commit f7e062152dad7881aed392d59f531f379b9b1381, preserving its v25.99 changes. Only media helpers, public immutable image cache, private-document opening, asset revisions, associated tests and build integration are reapplied.
- Draft shell revision: harmony-store-v25-99-r2. The current official package version is not changed by this proposal.
- The user supplied a screenshot confirming a private bill image opened from a local blob URL. This confirms the manual image-document flow, not all PDFs or every private document.
- Original local files and unrelated changes remain in the original working directory. No main-branch publication, Supabase migration, function deployment, payment or stock mutation is part of preparing this proposal.
- GitHub Pages publication source was confirmed in Settings as main / (root). Merging into main would publish the frontend; this proposal is not merged automatically.

## Isolated release validation - 2026-09-14

- Release branch: codex/reduce-cached-egress-20260914, based on official main f7e062152dad7881aed392d59f531f379b9b1381.
- Fixed release metadata coherence by using PWA shell revision harmony-store-v25-99-r2; existing official package/changelog v25.99 are preserved. Touched script asset URLs use 25.100 for cache invalidation independently of the package version.
- The media bootstrap test now verifies that the module actually exists before app.js and uses the current asset revision; no behavioral assertion was removed.
- Static build succeeded before running the current release suite: 368 tests passed, 0 failed.
- User screenshot confirms one private image document opens in the local preview. No production payment, order, stock movement, upload or confidential cache was used for validation.
- Preparing a GitHub proposal does not publish the app: main remains the GitHub Pages source. Merging must be a separate release step.
- Custom quota alerts remain pending and are not delivered by this frontend optimization. The proposed warning policy above is documentation, not an active monitor. These changes reduce avoidable traffic but do not guarantee that quotas can never be exceeded.
