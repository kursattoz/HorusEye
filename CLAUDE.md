# CLAUDE.md — Project Rules for AI Assistants

## Tech Stack
- **Frontend:** Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Supabase (Postgres, Auth, Storage, RLS)
- **Infra:** AWS CDK (ECS Fargate, ALB, ECR, Route 53), GitHub Actions CI/CD
- **Monorepo:** `portal/` (Next.js app), `infra/` (CDK stacks), `PRD/` (specs)

## Completion Checklist — MANDATORY
Before declaring any feature "done", walk through every item. Do NOT skip steps.

### 1. Scope: identify ALL touch points
- [ ] What env vars does this feature need? Are they in `.env.local`, SSM (`/horuseye/staging/*`, `/horuseye/production/*`), and `infra/lib/service-stack.ts`?
- [ ] What DB tables/columns change? Is there a local migration file AND a remote migration?
- [ ] What new API routes are added? Do they need auth, rate limiting, or RLS policies?
- [ ] What types/interfaces change? Are all consumers updated?

### 2. Verify: check every dependency is wired
- [ ] Run `npx tsc --noEmit` — zero errors
- [ ] Run `npm run lint` — zero errors (not just warnings)
- [ ] If new env vars: confirm they exist in SSM for staging AND production (`aws ssm get-parameter`)
- [ ] If new env vars: confirm CDK service-stack.ts passes them to the ECS container
- [ ] If new migrations: confirm local file exists with version matching remote `schema_migrations`

### 3. Test: simulate the real deploy path
- [ ] Would `supabase db push` succeed? (local migrations match remote)
- [ ] Would Docker build succeed? (no missing build-time env vars)
- [ ] Would the app start in ECS? (no missing runtime env vars)
- [ ] Test the actual user flow end-to-end, not just the happy path

### 4. Confirm: no silent failures
- [ ] Check that errors surface visibly (not swallowed by try/catch)
- [ ] If something is "fire-and-forget" (like email sending), ensure failures are logged

## Database Migrations — CRITICAL
When applying Supabase migrations via MCP (`apply_migration`), you MUST also create the matching local migration file:
1. File path: `portal/supabase/migrations/{version}_{name}.sql`
2. The `{version}` timestamp must match exactly what MCP created in remote `schema_migrations`
3. Include the same SQL content that was applied

**Why:** CI/CD runs `supabase db push` which compares local files against remote history. Missing local files cause deploy failures.

## Environment Variables
All runtime env vars must exist in three places:
1. **SSM Parameter Store:** `/horuseye/staging/{VAR_NAME}` and `/horuseye/production/{VAR_NAME}`
2. **CDK service-stack.ts:** referenced via `ssm.StringParameter.valueFromLookup()` and passed to the container `environment` block

**CRITICAL: SSM parameter type must be `String`, NOT `SecureString`.** CDK `valueFromLookup()` cannot resolve `SecureString` — it passes a KMS-encrypted blob instead of the actual value. After changing SSM params, run `npx cdk context --clear` before `cdk deploy`.
3. **Local `.env.local`:** for development

If you add a new env var and only set it locally, staging/production WILL break.

## PRD Workflow
- When modifying PRD files, always update PRD-000 (interface contracts) if interfaces change
- Use Supabase MCP for schema changes, but always keep local migrations in sync (see above)

## File Storage Security
- Public files (`is_public=true`): stored in `public/` path, use permanent `getPublicUrl()`
- Private files (`is_public=false`): stored in `private/` path, use `createSignedUrl()` with 5-min expiry
- Email links always use `/d/[id]` proxy route, never expose direct Supabase URLs

## CI/CD
- `develop` branch push → staging deploy (`staging.horuseye.app`)
- `main` branch push → production deploy (`horuseye.app`)
- Pipeline: Supabase migrations → Docker build → ECR push → ECS force-deploy

## Code Style
- Escape apostrophes in JSX (`&apos;` not `'`)
- Next.js 15: route params are `Promise` — always `await params`
