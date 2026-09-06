# Network OS deployment

The application branch has been pushed through `1307648`. On 2026-09-06 the owner authorized deployment using an AWS-provided HTTPS link, with a custom domain later. The artifact stack is deployed and the network stack is being created; the application image and live smoke tests are still pending. The existing Elastic Beanstalk environment and certificate belong to another application and remain untouched.

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
- Google OAuth authorized JavaScript origin `https://<hostname>` and redirect URI `https://<hostname>/api/auth/callback/google`. Production sign-in must be tested with the intended owner, not only with synthetic fixtures.
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

The public health endpoint returns only `{ "status": "ok" }`; it is process liveness, not proof of database, OAuth, AI, imports or complete v1 readiness. Container build, cloud smoke test and real sign-in remain unexecuted until deployment inputs are resolved.

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
