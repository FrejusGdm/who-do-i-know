# Network OS deployment

The application branch has been pushed through `104bddd`. On 2026-09-06 the owner authorized deployment using an AWS-provided HTTPS link, with a custom domain later. Both AWS stacks are created. The app is live at `https://d3p6ii3tjocl55.cloudfront.net`. HTTPS, private API rejection, worker startup and native database TLS checks passed. Final factual retention-copy update 104bddd is live and browser-verified; owner login remains locked. The existing Elastic Beanstalk environment and certificate belong to another application and remain untouched.

## First deployment and cost

Use Ohio (`us-east-2`), one Fargate web task (0.5 vCPU / 1 GiB), one interview worker (0.25 vCPU / 0.5 GiB), and one private Application Load Balancer in two isolated subnets behind CloudFront. Tasks accept no direct Internet ingress; the web task accepts port 3000 only from the load balancer, and the worker accepts none. Outbound task traffic is limited to HTTPS and PostgreSQL. There is no NAT gateway, autoscaling, RDS instance or automatic email sending in this first stack. The app uses an isolated Neon deployment branch; the original database is preserved. RDS migration is a separate validated milestone. CloudFront supplies the default HTTPS certificate and hostname, forwards cookies/authorization/query strings, and disables caching for private requests and configured error responses. Its VPC origin reaches the internal ALB; public task ingress remains closed.

AWS Price List queries on 2026-09-06 verified the following Ohio rates. At 730 hours/month:

| Resource | Assumption | Monthly USD before credits |
| --- | --- | ---: |
| Fargate compute | 0.75 vCPU × $0.04048/hour | 22.16 |
| Fargate memory | 1.5 GiB × $0.004445/hour | 4.87 |
| ALB | $0.0225/hour | 16.43 |
| Public IPv4 | Two task addresses × $0.005/hour | 7.30 |
| ALB traffic | Zero to one average LCU × $0.008/hour | 0–5.84 |
| Logs, one runtime secret, build-source storage, container storage and occasional builds | Planning allowance; actual volume matters | 7–16 |
| Planning total | Small personal workload, rounded | 65–80 |

See [Fargate pricing](https://aws.amazon.com/fargate/pricing/), [load balancer pricing](https://aws.amazon.com/elasticloadbalancing/pricing/), and [VPC IPv4 pricing](https://aws.amazon.com/vpc/pricing/). The exact compute/ALB/IP figures above were retrieved from the regional Price List API, not inferred from another region. The allowance is an estimate, not a quote. Additional traffic, builds, retained images, taxes, rolling-deployment overlap, AI inference, the existing Neon bill and domain registration can add cost. Alerts do not enforce a spending cap.

AWS Free Tier GetAccountPlanState returned missing account data. Credit balance, expiry and coverage remain unverified. After the cost estimate was disclosed, the owner authorized proceeding with deployment. Sign-in email remains pending; the domain decision is to use CloudFront initially. Do not assume an absent Route 53 zone means the owner has no externally managed domain.

## Release inputs

Keep secrets and personal identities out of Git, CDK context, logs and build inputs. The deployment needs:

- No owned hostname is required initially. For a future custom domain, use an issued ACM certificate in the target account in us-east-1 and add its validation record through the actual DNS provider. No unrelated certificate may be reused.
- A Secrets Manager JSON secret in the target account/region containing `DATABASE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PRIVATE_USER_EMAILS`, `OPENROUTER_API_KEY`, and `NETWORK_INTERVIEW_MODEL`. The auth secret must be strong; the allowlist must contain the owner's chosen verified identity. Empty provider/model values keep AI unavailable until a tested configuration is supplied. The worker does not receive Google client credentials or the auth secret.
- Google OAuth authorized JavaScript origin `https://d3p6ii3tjocl55.cloudfront.net` and redirect URI `https://d3p6ii3tjocl55.cloudfront.net/api/auth/callback/google`. Production sign-in must be tested with the intended owner, not only with synthetic fixtures.
- Reviewed database migrations through `0012`, preceded by an inventory, consistent backup, successful restore rehearsal and current-schema compatibility checks. Do not run `db:push`, run migrations inside a container build, or point integration tests at the live database.

Existing local configuration uses localhost, lacks the owner allowlist/model, and the earlier provider smoke test returned HTTP 401. Those are unresolved settings, not production credentials that have been validated.

## Reproducible build and deployment order

`infra/` contains pinned CDK dependencies, tests and two stacks for one deployment: `NetworkOsArtifacts` (private build source, ECR and bounded CodeBuild) and `NetworkOs` (web, worker and HTTPS). Splitting artifact creation prevents the first service deployment from referring to an image that does not yet exist. All retained infrastructure has termination protection at stack level; source objects expire after seven days, logs after fourteen days, and tagged container releases remain available for rollback.

1. Run application checks and `npm --prefix infra run typecheck` / `npm --prefix infra test`. Inspect the synthesized CloudFormation and IAM changes for the actual target. Resolve the settings and cost decision above.
2. Deploy only `NetworkOsArtifacts` with CDK context `artifactsOnly=true`, after verifying the account and CDK bootstrap state. No other project's resources are imported or mutated.
3. Package the committed release with `node scripts/package-release.mjs <new-output-path.zip>`. This reads the reviewed Git commit and an explicit input list, excludes uncommitted owner edits and personal files, includes the full commit ID, and refuses to overwrite an existing file. Never zip the working directory or upload local `.env` files. No cleanup of the owner's personal files is part of this procedure.
4. Upload that ZIP to the output source bucket at `releases/source.zip`, retain the returned S3 version ID, and start the output CodeBuild project pinned to that source version. The build has no access to runtime secrets, uses a 20-minute timeout and one concurrent build, builds Linux/amd64, and pushes a full-commit immutable tag. Inspect its result and ECR scan findings before deploying the image. CodeBuild is the intended build route because the local Docker app is missing its executable.
5. After the backup/restore/migration checks and runtime secret setup, synthesize/diff `NetworkOs` with context `secretArn`, `cloudFrontPrefixListId`, and `imageTag` (full reviewed commit ID). Optional `hostname` and `certificateArn` must be provided together. Initially provision with `startServices=false`, then update to the built image and start both tasks. A custom domain can later point to `DnsTarget`. Wait for both services to become healthy. No runtime migration runs automatically.
6. Check HTTPS, `/api/health`, unauthenticated private API rejection, real owner sign-in, private-page persistence, a non-owner rejection, and the configured worker. Restart/redeploy a task and confirm saved data and queued interview work survive. Report the actual URL and image digest only after those checks succeed.

The public health endpoint returns only `{ "status": "ok" }`; it is process liveness, not proof of database, OAuth, AI, imports or complete v1 readiness. The exact-commit container build passed. Real owner sign-in remains unverified and closed.

## Remaining release work

The legacy extraction pipeline still relies on process memory/local artifacts; durable S3/SQS migration and restart validation are unfinished. Login still requests Gmail scopes and needs the separate mailbox-connection flow. Full export/deletion, voice, roster onboarding and optional source-aware drafts are also unfinished. Do not advertise these as complete or import the requested mentor mailbox before the deployed app handoff.

Dependency updates patched compatible image/HTTP/parser dependencies and moved the shadcn CLI to development dependencies. The production audit now reports seven affected packages (one high and six moderate; no critical). Remaining findings are PostCSS CSS/source-map processing via Next and the esbuild development server via Drizzle Kit/BetterAuth. Production does not compile user CSS or start an esbuild development server; builds use reviewed repository inputs and cannot access runtime secrets. These are reachability-based exceptions, not claims of zero vulnerabilities. Keep reviewing upstream compatible fixes; do not force a major Next upgrade or Drizzle downgrade merely to reduce the count.

Rollback uses a previously retained image tag only when its code remains compatible with the current database schema. Preserve backups and Neon. Once a later RDS cutover has accepted new writes, switching its connection string back to an old Neon snapshot is not a lossless rollback.

## Deployment record — 2026-09-06

- Target: account `974640818655`, region `us-east-2`. AWS credit coverage remains unverified; the previously disclosed $65–80/month planning allowance is not a spending cap. CloudFront adds usage-dependent charges; the internal ALB removes two public IPv4 addresses from the original estimate. Existing Neon and AI are separate.
- `NetworkOsArtifacts` is deployed with private versioned build source, immutable ECR repository `network-os`, bounded CodeBuild and retained `network-os/runtime` secret. The build role cannot read runtime secrets. Bootstrapless CloudFormation is used; no broad CDK bootstrap roles were created.
- `NetworkOs` was submitted with services at zero tasks while the release image is built. CloudFront origin-facing prefix list `pl-b6a144df` was verified for Ohio. The two availability zones were resolved from this account. Runtime secrets are referenced by ARN and field, never embedded in templates/builds.
- Neon project `little-dust-60821577`: preserved no-compute branch `br-super-dream-amz2n2ib` from production `br-old-fog-amk1paaf`; deployment branch `br-aged-poetry-amxari71` cloned from that preserved branch. Neither original nor preserved branch was migrated. Deployment compute is 0.25 CU; account settings did not permit changing suspend timeout, so automatic suspension is not assumed.
- Existing migration journal ended at 0002 although archive tables already existed. All columns/defaults/types, constraints and indexes for the eight affected tables matched the disposable tested schema. On the deployment branch only, one locked transaction reconciled journal 0003–0004 and applied 0005–0012. All 27 original public table counts match the source afterward; no unvalidated constraints remain. Native PostgreSQL from the deployed app still needs verification; local migration used Neon HTTPS transactions.
- Runtime configuration uses the deployment branch and a fresh auth secret. AI is disabled pending a working provider configuration. Owner email is pending: the database has three accounts, so none was inferred as the owner; production sign-in remains closed. Google callback setup must use the actual CloudFront URL once allocated. No mailbox import or message sending has occurred.


## OS scan assessment

The initial ECR OS scan for `0e15861` found 3 critical, 12 high and 5 medium entries. A rebuild updates available Debian packages; the security repository supplies PCRE2 `10.42-1+deb12u1` but not fixes for all remaining findings. Do not report a clean scan.

The three critical entries are in Perl: [Storable deserialization](https://security-tracker.debian.org/tracker/CVE-2026-57433), [Socket packing](https://security-tracker.debian.org/tracker/CVE-2026-12087), and [regular-expression matching](https://security-tracker.debian.org/tracker/CVE-2026-13221). Repository application and worker source contain no Perl or child-process invocation; these affected APIs are not part of the application's request path. The util-linux findings require local utility execution; runtime is non-root, ECS Exec is disabled, and the app provides no shell/subprocess interface. This is a reachability assessment, not removal of vulnerable installed packages.

The [zlib advisory](https://security-tracker.debian.org/tracker/CVE-2026-85091) describes non-blocking gzwrite/gzprintf buffer handling. The tracker marks Bookworm unresolved and asks for further detail despite describing a newer upstream version range. Application source does not use that gzip-file API. Keep this as an unresolved upstream/reachability exception rather than claiming a confirmed false positive. Sign-in remains closed pending owner/OAuth setup; no private release acceptance is claimed before real authentication checks.


Final release image: `e8d62e9b009fb24898abe47ae9faa6b7c7a5a94d`, digest `sha256:2173ad5f3c89743d2f822167124d74d54b9772a075587ff2b57ede8b9b524bc7`. CodeBuild `a6f4ac85-e283-42c6-a8a0-cbecc03253a2` succeeded from source version `lQfdc.0OYANV30Wi.8V2i_IqBjBFsdB2`. ECR scan completed: 3 critical, 11 high, 5 medium; PCRE2 finding resolved, remaining exceptions assessed above. This is not a zero-vulnerability release. NetworkOs update changes only image task definitions and desired counts from zero to one. Google Cloud Console requires owner reauthentication; no callback edit has been made, and no owner identity was inferred from the signed-in browser.


## Handoff status

- Link: https://d3p6ii3tjocl55.cloudfront.net . No custom domain is needed. CloudFront distribution `E1O3QTS87ZGBCE` uses its default certificate and the internal ALB VPC origin. CloudFormation initially reached UPDATE_COMPLETE and the ALB target was healthy.
- Verified live: homepage 200, health 200 with fixed JSON/no-store, unauthenticated private API 401, cross-origin mutation 403, disallowed health POST 403. Both web and worker reached one running task. A separate bounded AWS DB check exited zero with verified TLS and 13 migration records; it read no private relationship content.
- Final copy-correction release `104bdddab1b054495bf0f362b0dd8d9615e682db`, digest `sha256:bb346891c11c0ee3447cb28f7985410127106989be8410d5d4fd3b5e29b06edc`, built successfully in run `4d378cb7-4f9e-4300-8531-ed965e2d9af0` from S3 version `rAmK9lzHGUaQRfjL8BIfV4eSMZwKcgWY`. Its OS scan matches the assessed 3 critical/11 high/5 medium findings; no clean-scan claim. It corrects misleading inherited retention/token-deletion text, including the unused email footer; no message sent.
- Required owner actions: choose the one Google email to allow; reauthenticate in Google Cloud Console so the exact origin and callback above can be added to the existing OAuth client. Do not select an identity from the three database users or browser session without confirmation. No Google credential rotation or new OAuth client is required by this deployment.
- AI configuration remains disabled after the earlier provider credential rejection. Mailbox connection/import is deferred until after the owner sees the deployment. Core app deployment is not completion of every PRD milestone or real owner authentication testing.


Final live browser verification confirms corrected retention cards at desktop and 390px mobile widths. The obsolete zero-retention/no-account claims are absent. Homepage, privacy page and health return 200; private people API remains 401 without authentication. Both services have one running task and no pending tasks; CloudFormation finished UPDATE_COMPLETE. The release includes no unrelated local changes and no personal files were deleted outside the repository. Only its generated Next.js cache was cleared when local disk space ran out.

Final status: `NetworkOs` reached `UPDATE_COMPLETE` after replacing both task definitions. Both ECS deployments completed. The default HTTPS deployment request is fulfilled; real owner sign-in, Google callback setup, AI configuration and the remaining PRD milestones remain open.
