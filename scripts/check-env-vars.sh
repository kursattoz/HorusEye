#!/usr/bin/env bash
# Compares runtime env vars used in portal/ code against what CDK service-stack passes to ECS.
# Run in CI or locally to catch missing env vars before deploy.
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

PORTAL_DIR="portal"
CDK_STACK="infra/lib/service-stack.ts"

# 1. Find all process.env.* references in portal code (excluding node_modules, .next)
CODE_VARS=$(grep -roh 'process\.env\.\([A-Z_][A-Z0-9_]*\)' "$PORTAL_DIR" \
  --include='*.ts' --include='*.tsx' \
  --exclude-dir=node_modules --exclude-dir=.next \
  | sed 's/process\.env\.//' \
  | sort -u)

# 2. Find all env vars defined in CDK service-stack (environment block + build args)
CDK_VARS=$(grep -oE '[A-Z_][A-Z0-9_]+' "$CDK_STACK" \
  | sort -u)

# 3. Vars that are set by Next.js/Node itself, build-time only, or test-only — skip these
# TEST_[A-Z_]+ catches Playwright/integration test fixtures (TEST_ADMIN_EMAIL etc.)
SKIP_VARS="NODE_ENV|PORT|HOSTNAME|NEXT_RUNTIME|CI|PLAYWRIGHT_BASE_URL|NEXT_PUBLIC_ENV|NEXT_PUBLIC_CAMERA_MODULE_ENABLED|NEXT_PUBLIC_SENTRY_DSN|SENTRY_AUTH_TOKEN|NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|TEST_[A-Z_]+"

MISSING=0
echo ""
echo "Checking portal env vars against CDK service-stack..."
echo "────────────────────────────────────────────────────"

for VAR in $CODE_VARS; do
  # Skip build-time-only and framework vars
  if echo "$VAR" | grep -qE "^($SKIP_VARS)$"; then
    continue
  fi

  if echo "$CDK_VARS" | grep -q "^${VAR}$"; then
    echo -e "  ${GREEN}✓${NC} $VAR"
  else
    echo -e "  ${RED}✗${NC} $VAR — used in code but NOT in service-stack.ts"
    MISSING=$((MISSING + 1))
  fi
done

echo ""
if [ "$MISSING" -gt 0 ]; then
  echo -e "${RED}FAIL: $MISSING env var(s) missing from CDK service-stack.${NC}"
  echo "Add them to infra/lib/service-stack.ts and create SSM parameters."
  exit 1
else
  echo -e "${GREEN}PASS: All runtime env vars are wired in CDK.${NC}"
fi
