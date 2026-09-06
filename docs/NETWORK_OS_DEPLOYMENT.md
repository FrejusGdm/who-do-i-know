# Network OS deployment

The application branch has been pushed. This document describes the prepared AWS deployment, not a running environment. No Network OS AWS resources or live database migrations have been created/applied yet. The existing Elastic Beanstalk environment and certificate belong to another application and must remain untouched.

## First deployment and cost

Use Ohio (`us-east-2`), one Fargate web task (0.5 vCPU / 1 GiB), one interview worker (0.25 vCPU / 0.5 GiB), and one HTTPS Application Load Balancer in two public subnets. Tasks accept no direct Internet ingress; the web task accepts port 3000 only from the load balancer, and the worker accepts none. Outbound task traffic is limited to HTTPS and PostgreSQL. There is no NAT gateway, autoscaling, RDS instance or automatic email sending in this first stack. Neon remains the source of truth; RDS migration is a separate validated milestone.

AWS Price List queries on 2026-09-06 verified the following Ohio rates. At 730 hours/month:

| Resource | Assumption | Monthly USD before credits |
| --- | --- | ---: |
| Fargate compute | 0.75 vCPU × $0.04048/hour | 22.16 |
| Fargate memory | 1.5 GiB × $0.004445/hour | 4.87 |
| ALB | $0.0225/hour | 16.43 |
| Public IPv4 | Four addresses × $0.005/hour | 14.60 |
| ALB traffic | Zero to one average LCU × $0.008/hour | 0–5.84 |
| Logs, one runtime secret, build-source storage, container storage and occasional builds | Planning allowance; actual volume matters | 7–16 |
| Planning total | Small personal workload, rounded | 65–80 |

See [Fargate pricing](https://aws.amazon.com/fargate/pricing/), [load balancer pricing](https://aws.amazon.com/elasticloadbalancing/pricing/), and [VPC IPv4 pricing](https://aws.amazon.com/vpc/pricing/). The exact compute/ALB/IP figures above were retrieved from the regional Price List API, not inferred from another region. The allowance is an estimate, not a quote. Additional traffic, builds, retained images, taxes, rolling-deployment overlap, AI inference, the existing Neon bill and domain registration can add cost. Alerts do not enforce a spending cap.

AWS Free Tier GetAccountPlanState returned missing account data. Credit balance, expiry and coverage remain unverified. The owner has been asked for the acceptable ongoing infrastructure budget before provisioning paid resources. Sign-in email and hostname are also pending. Do not assume an absent Route 53 zone means the owner has no externally managed domain.

## Release inputs

Keep secrets and personal identities out of Git, CDK context, logs and build inputs. The deployment needs:

- A chosen hostname and an issued ACM certificate for that hostname in the target account/region. Add its DNS validation record through the domain's actual DNS provider. No unrelated certificate may be reused.
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
5. After the backup/restore/migration checks and runtime secret setup, synthesize/diff `NetworkOs` with context `hostname`, `certificateArn`, `secretArn`, and `imageTag` (full reviewed commit ID). Deploy the reviewed diff, point the chosen DNS name to `DnsTarget`, and wait for both services to become healthy. No runtime migration runs automatically.
6. Check HTTPS, `/api/health`, unauthenticated private API rejection, real owner sign-in, private-page persistence, a non-owner rejection, and the configured worker. Restart/redeploy a task and confirm saved data and queued interview work survive. Report the actual URL and image digest only after those checks succeed.

The public health endpoint returns only `{ "status": "ok" }`; it is process liveness, not proof of database, OAuth, AI, imports or complete v1 readiness. Container build, cloud smoke test and real sign-in remain unexecuted until deployment inputs are resolved.

## Remaining release work

The legacy extraction pipeline still relies on process memory/local artifacts; durable S3/SQS migration and restart validation are unfinished. Login still requests Gmail scopes and needs the separate mailbox-connection flow. Full export/deletion, voice, roster onboarding and optional source-aware drafts are also unfinished. Do not advertise these as complete or import the requested mentor mailbox before the deployed app handoff.

The latest production dependency audit reports 27 advisories (12 high, 12 moderate, 3 low, none critical), including CLI/build dependencies and transitive image/HTTP libraries. The remaining reachability review and applicable patches are required before publishing a production environment; a passing build or a smaller advisory count is not security clearance. Do not apply a forced major downgrade/upgrade from the audit's suggestions.

Rollback uses a previously retained image tag only when its code remains compatible with the current database schema. Preserve backups and Neon. Once a later RDS cutover has accepted new writes, switching its connection string back to an old Neon snapshot is not a lossless rollback.
