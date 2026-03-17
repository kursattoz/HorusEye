#!/usr/bin/env node

/**
 * PRD Interface Dependency Validator
 *
 * This script ensures that every PRD's declared interface dependencies
 * match the current versions defined in PRD-000.
 *
 * How it works:
 *   1. Reads PRD-000 and extracts all interfaces with their current @version
 *   2. Reads every other PRD and extracts their INTERFACE_DEPS block
 *   3. Compares declared versions against PRD-000's current versions
 *   4. Exits with code 1 if any PRD references a stale (outdated) version
 *
 * Run: node scripts/validate-prd-interfaces.js
 * Or:  npm run validate:prd
 *
 * Used by:
 *   - .husky/pre-commit hook (blocks commits with stale PRDs)
 *   - GitHub Actions CI (blocks PRs with stale PRDs)
 */

const fs   = require('fs');
const path = require('path');

const PRD_DIR    = path.join(__dirname, '..', 'PRD');
const MASTER_PRD = path.join(PRD_DIR, 'PRD-000-master-matrix.md');

const COLORS = {
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  bold:   '\x1b[1m',
  reset:  '\x1b[0m',
};

// ─── Step 1: Parse PRD-000 for current interface versions ───────────────────

function parseMasterVersions(content) {
  const versions = {};
  // Match lines like:  // @interface AuthUser @version 1.0
  const regex = /\/\/\s*@interface\s+(\w+)\s+@version\s+([\d.]+)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const [, name, version] = match;
    versions[name] = version;
  }
  return versions;
}

// ─── Step 2: Parse INTERFACE_DEPS block from a PRD ──────────────────────────

function parsePRDDeps(content, filename) {
  const deps = {};
  // Match the HTML comment block: <!-- INTERFACE_DEPS ... -->
  const blockMatch = content.match(/<!--\s*INTERFACE_DEPS\s*([\s\S]*?)-->/);
  if (!blockMatch) {
    return null; // No INTERFACE_DEPS block = skip validation for this PRD
  }

  const block = blockMatch[1];
  // Each dep line: "InterfaceName: @version" or empty line
  const lineRegex = /^(\w+):\s*@([\d.]+)\s*$/gm;
  let lineMatch;
  while ((lineMatch = lineRegex.exec(block)) !== null) {
    const [, name, version] = lineMatch;
    deps[name] = version;
  }
  return deps; // empty object = PRD explicitly declares no interface deps
}

// ─── Step 3: Compare and report ─────────────────────────────────────────────

function validatePRDs() {
  console.log(`\n${COLORS.bold}${COLORS.cyan}HorusEye PRD Interface Validator${COLORS.reset}\n`);

  // Read master
  if (!fs.existsSync(MASTER_PRD)) {
    console.error(`${COLORS.red}ERROR: PRD-000 not found at ${MASTER_PRD}${COLORS.reset}`);
    process.exit(1);
  }
  const masterContent = fs.readFileSync(MASTER_PRD, 'utf8');
  const masterVersions = parseMasterVersions(masterContent);

  if (Object.keys(masterVersions).length === 0) {
    console.warn(`${COLORS.yellow}WARNING: No @interface declarations found in PRD-000.${COLORS.reset}`);
    console.warn(`Expected format in PRD-000: // @interface AuthUser @version 1.0\n`);
  } else {
    console.log(`${COLORS.cyan}PRD-000 interface versions:${COLORS.reset}`);
    for (const [name, ver] of Object.entries(masterVersions)) {
      console.log(`  ${name}: @${ver}`);
    }
    console.log('');
  }

  // Read all PRDs except PRD-000
  const prdFiles = fs.readdirSync(PRD_DIR)
    .filter(f => f.endsWith('.md') && f !== 'PRD-000-master-matrix.md')
    .sort();

  const staleResults  = [];
  const missingDeps   = [];
  const okResults     = [];

  for (const filename of prdFiles) {
    const filepath = path.join(PRD_DIR, filename);
    const content  = fs.readFileSync(filepath, 'utf8');
    const deps     = parsePRDDeps(content, filename);

    if (deps === null) {
      // No INTERFACE_DEPS block at all — this is an error
      missingDeps.push(filename);
      continue;
    }

    if (Object.keys(deps).length === 0) {
      // Empty INTERFACE_DEPS block = intentionally no deps, skip
      okResults.push({ filename, deps: {} });
      continue;
    }

    const staleInterfaces = [];
    for (const [interfaceName, declaredVersion] of Object.entries(deps)) {
      const currentVersion = masterVersions[interfaceName];
      if (!currentVersion) {
        staleInterfaces.push({
          interface:  interfaceName,
          declared:   declaredVersion,
          current:    '(not found in PRD-000)',
          error:      'UNKNOWN_INTERFACE',
        });
      } else if (declaredVersion !== currentVersion) {
        staleInterfaces.push({
          interface:  interfaceName,
          declared:   declaredVersion,
          current:    currentVersion,
          error:      'VERSION_MISMATCH',
        });
      }
    }

    if (staleInterfaces.length > 0) {
      staleResults.push({ filename, stale: staleInterfaces });
    } else {
      okResults.push({ filename, deps });
    }
  }

  // ─── Report ───────────────────────────────────────────────────────────────

  if (okResults.length > 0) {
    console.log(`${COLORS.green}✓ Up-to-date PRDs:${COLORS.reset}`);
    for (const { filename, deps } of okResults) {
      const depStr = Object.keys(deps).length > 0
        ? ` (${Object.keys(deps).join(', ')})`
        : ' (no interface deps)';
      console.log(`  ${COLORS.green}✓${COLORS.reset} ${filename}${COLORS.cyan}${depStr}${COLORS.reset}`);
    }
    console.log('');
  }

  let hasErrors = false;

  if (missingDeps.length > 0) {
    hasErrors = true;
    console.log(`${COLORS.red}✗ Missing INTERFACE_DEPS block:${COLORS.reset}`);
    for (const filename of missingDeps) {
      console.log(`  ${COLORS.red}✗${COLORS.reset} ${filename}`);
      console.log(`    ${COLORS.yellow}Fix: Add an INTERFACE_DEPS HTML comment block near the top of this PRD.${COLORS.reset}`);
      console.log(`    ${COLORS.yellow}Example:${COLORS.reset}`);
      console.log(`    <!-- INTERFACE_DEPS`);
      console.log(`    AuthUser: @1.0`);
      console.log(`    -->`);
    }
    console.log('');
  }

  if (staleResults.length > 0) {
    hasErrors = true;
    console.log(`${COLORS.red}✗ Stale PRDs (interface version mismatch):${COLORS.reset}`);
    for (const { filename, stale } of staleResults) {
      console.log(`\n  ${COLORS.red}✗ ${filename}${COLORS.reset}`);
      for (const s of stale) {
        console.log(`    Interface: ${COLORS.bold}${s.interface}${COLORS.reset}`);
        console.log(`      Declared in this PRD: @${s.declared}`);
        console.log(`      Current in PRD-000:   @${s.current}`);
        if (s.error === 'VERSION_MISMATCH') {
          console.log(`      ${COLORS.yellow}Fix: Update INTERFACE_DEPS in ${filename}:`);
          console.log(`           ${s.interface}: @${s.current}${COLORS.reset}`);
          console.log(`      ${COLORS.yellow}Then review this PRD's content for any breaking changes from the interface update.${COLORS.reset}`);
        } else {
          console.log(`      ${COLORS.red}Fix: Remove this interface from INTERFACE_DEPS (it no longer exists in PRD-000),`);
          console.log(`           or add it back to PRD-000 if it was accidentally deleted.${COLORS.reset}`);
        }
      }
    }
    console.log('');
  }

  // ─── Summary ──────────────────────────────────────────────────────────────

  console.log('─'.repeat(60));
  const total    = prdFiles.length;
  const okCount  = okResults.length;
  const errCount = staleResults.length + missingDeps.length;

  if (hasErrors) {
    console.log(`\n${COLORS.red}${COLORS.bold}FAILED — ${errCount} PRD(s) have interface issues.${COLORS.reset}`);
    console.log(`${COLORS.yellow}Update the flagged PRDs before committing.${COLORS.reset}\n`);
    process.exit(1);
  } else {
    console.log(`\n${COLORS.green}${COLORS.bold}PASSED — All ${total} PRDs are in sync with PRD-000.${COLORS.reset}\n`);
    process.exit(0);
  }
}

validatePRDs();
