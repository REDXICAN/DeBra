#!/usr/bin/env npx tsx

/**
 * DeBra Enforcement - Pre-Edit Check
 *
 * This script runs BEFORE Edit operations to ensure DeBra was consulted.
 * Returns exit code 0 if OK, exit code 1 if DeBra not consulted recently.
 *
 * Usage:
 *   npx tsx scripts/debra-enforce.ts
 *   npx tsx scripts/debra-enforce.ts --check
 *   npx tsx scripts/debra-enforce.ts --record search
 *   npx tsx scripts/debra-enforce.ts --reset
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const SESSION_FILE = '.debra/session/tracker.json';
const MAX_AGE_MINUTES = 30; // DeBra must have been consulted in last 30 minutes

interface SessionTracker {
  lastSearch: string | null;
  lastImpact: string | null;
  lastIndex: string | null;
  searchQuery: string | null;
  impactFile: string | null;
  sessionStart: string;
  editCount: number;
  searchCount: number;
}

// ============================================================================
// FILE OPERATIONS
// ============================================================================

function ensureSessionDir(): void {
  const dir = path.dirname(SESSION_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadSession(): SessionTracker {
  ensureSessionDir();

  if (!fs.existsSync(SESSION_FILE)) {
    return createNewSession();
  }

  try {
    return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
  } catch {
    return createNewSession();
  }
}

function saveSession(session: SessionTracker): void {
  ensureSessionDir();
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2));
}

function createNewSession(): SessionTracker {
  return {
    lastSearch: null,
    lastImpact: null,
    lastIndex: null,
    searchQuery: null,
    impactFile: null,
    sessionStart: new Date().toISOString(),
    editCount: 0,
    searchCount: 0,
  };
}

// ============================================================================
// ENFORCEMENT LOGIC
// ============================================================================

function isRecent(timestamp: string | null, maxMinutes: number): boolean {
  if (!timestamp) return false;

  const then = new Date(timestamp).getTime();
  const now = Date.now();
  const diffMinutes = (now - then) / (1000 * 60);

  return diffMinutes <= maxMinutes;
}

function checkEnforcement(): { ok: boolean; reason: string; suggestion: string } {
  const session = loadSession();

  // Check if brain:search was run recently
  if (isRecent(session.lastSearch, MAX_AGE_MINUTES)) {
    return {
      ok: true,
      reason: `DeBra consulted ${Math.round((Date.now() - new Date(session.lastSearch!).getTime()) / 60000)} min ago`,
      suggestion: '',
    };
  }

  // Check if brain:impact was run recently
  if (isRecent(session.lastImpact, MAX_AGE_MINUTES)) {
    return {
      ok: true,
      reason: `Impact analysis run ${Math.round((Date.now() - new Date(session.lastImpact!).getTime()) / 60000)} min ago`,
      suggestion: '',
    };
  }

  // Neither was run recently
  return {
    ok: false,
    reason: 'DeBra not consulted in this session',
    suggestion: 'Run: npm run brain:search "<what you are working on>"',
  };
}

// ============================================================================
// RECORDING
// ============================================================================

function recordUsage(command: string, detail?: string): void {
  const session = loadSession();
  const now = new Date().toISOString();

  switch (command) {
    case 'search':
      session.lastSearch = now;
      session.searchQuery = detail || null;
      session.searchCount++;
      break;
    case 'impact':
      session.lastImpact = now;
      session.impactFile = detail || null;
      break;
    case 'index':
      session.lastIndex = now;
      break;
    case 'edit':
      session.editCount++;
      break;
  }

  saveSession(session);
}

// ============================================================================
// CLI
// ============================================================================

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
DeBra Enforcement - Ensures DeBra workflow compliance

Commands:
  --check           Check if DeBra was consulted (default)
  --record <cmd>    Record DeBra usage (search, impact, index, edit)
  --reset           Reset session tracker
  --status          Show session status

Exit codes:
  0 = DeBra was consulted, OK to proceed
  1 = DeBra NOT consulted, should run brain:search first
`);
    process.exit(0);
  }

  if (args.includes('--reset')) {
    saveSession(createNewSession());
    console.log('Session reset');
    process.exit(0);
  }

  if (args.includes('--record')) {
    const cmdIndex = args.indexOf('--record');
    const command = args[cmdIndex + 1];
    const detail = args[cmdIndex + 2];

    if (!command) {
      console.error('Usage: --record <command> [detail]');
      process.exit(1);
    }

    recordUsage(command, detail);
    console.log(`Recorded: ${command}${detail ? ` (${detail})` : ''}`);
    process.exit(0);
  }

  if (args.includes('--status')) {
    const session = loadSession();
    console.log(`
DeBra Session Status
====================
Session start:  ${session.sessionStart}
Last search:    ${session.lastSearch || 'Never'} ${session.searchQuery ? `("${session.searchQuery}")` : ''}
Last impact:    ${session.lastImpact || 'Never'} ${session.impactFile ? `(${session.impactFile})` : ''}
Last index:     ${session.lastIndex || 'Never'}
Search count:   ${session.searchCount}
Edit count:     ${session.editCount}
`);

    const check = checkEnforcement();
    console.log(`Status: ${check.ok ? 'OK' : 'WARNING'}`);
    console.log(`Reason: ${check.reason}`);
    if (check.suggestion) console.log(`Suggestion: ${check.suggestion}`);

    process.exit(0);
  }

  // Default: --check
  const check = checkEnforcement();

  if (check.ok) {
    // Silent success for hook usage
    process.exit(0);
  } else {
    console.log(`
WARNING: DeBra workflow not followed!
=====================================
${check.reason}

BEFORE editing files, you MUST:
  1. Run: npm run brain:search "<task description>"
  2. Check lessons.md for similar patterns
  3. Run: npm run brain:impact "<target-file>"

${check.suggestion}

To skip this check (not recommended):
  npx tsx scripts/debra-enforce.ts --record search "manual override"
`);
    process.exit(1);
  }
}

main();
