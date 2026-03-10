#!/usr/bin/env npx tsx

/**
 * DeBra - Self-Healing System
 *
 * Auto-recovery actions for DeBra components:
 * - Restart Ollama
 * - Reindex vectors
 * - Recreate memory files
 * - Start FalkorDB container
 *
 * Usage:
 *   npm run brain:heal           # Run all auto-recovery
 *   npm run brain:heal:ollama    # Restart Ollama only
 *   npm run brain:heal:vectors   # Reindex vectors only
 */

import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  debraDir: './.debra',
  vectorsDir: './.debra/vectors',
  graphDir: './.debra/graph',
  memoryDir: './.debra/memory',
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  embedModel: process.env.EMBED_MODEL || 'nomic-embed-text',
  falkorHost: 'localhost',
  falkorPort: 6379,
  isWindows: process.platform === 'win32',
};

// ============================================================================
// HEALING ACTIONS
// ============================================================================

interface HealResult {
  action: string;
  success: boolean;
  message: string;
  details?: string;
}

/**
 * Check if Ollama is running
 */
async function isOllamaRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${CONFIG.ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Start Ollama service
 */
async function healOllama(): Promise<HealResult> {
  console.log('🔧 Checking Ollama...');

  if (await isOllamaRunning()) {
    return {
      action: 'Ollama',
      success: true,
      message: 'Already running'
    };
  }

  console.log('   Starting Ollama...');

  try {
    // Start Ollama in background
    const ollamaProcess = spawn('ollama', ['serve'], {
      detached: true,
      stdio: 'ignore',
      shell: CONFIG.isWindows
    });
    ollamaProcess.unref();

    // Wait for it to start (up to 10 seconds)
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (await isOllamaRunning()) {
        // Check if model exists
        const response = await fetch(`${CONFIG.ollamaUrl}/api/tags`);
        const data = await response.json();
        const hasModel = data.models?.some((m: any) =>
          m.name.includes(CONFIG.embedModel)
        );

        if (!hasModel) {
          console.log(`   Pulling ${CONFIG.embedModel} model...`);
          await execAsync(`ollama pull ${CONFIG.embedModel}`);
        }

        return {
          action: 'Ollama',
          success: true,
          message: 'Started successfully',
          details: `Running on ${CONFIG.ollamaUrl}`
        };
      }
    }

    return {
      action: 'Ollama',
      success: false,
      message: 'Failed to start',
      details: 'Timeout waiting for Ollama to respond'
    };
  } catch (error: any) {
    return {
      action: 'Ollama',
      success: false,
      message: 'Failed to start',
      details: error.message
    };
  }
}

/**
 * Check if FalkorDB is running
 */
function isFalkorRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      resolve(false);
    });

    socket.connect(CONFIG.falkorPort, CONFIG.falkorHost);
  });
}

/**
 * Start FalkorDB container
 */
async function healFalkorDB(): Promise<HealResult> {
  console.log('🔧 Checking FalkorDB (REQUIRED)...');

  if (await isFalkorRunning()) {
    return {
      action: 'FalkorDB',
      success: true,
      message: 'Already running',
      details: 'Web UI: http://localhost:3000'
    };
  }

  console.log('   Starting FalkorDB container...');

  try {
    // Try to start existing container first
    try {
      await execAsync('docker start debra-falkor');

      // Wait for it to be ready
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (await isFalkorRunning()) {
          return {
            action: 'FalkorDB',
            success: true,
            message: 'Container started',
            details: 'Web UI: http://localhost:3000'
          };
        }
      }
    } catch {
      // Container doesn't exist, create new one
      console.log('   Creating new FalkorDB container...');
      await execAsync(
        'docker run -d --name debra-falkor -p 6379:6379 -p 3000:3000 falkordb/falkordb:latest'
      );

      // Wait for it to be ready
      for (let i = 0; i < 15; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (await isFalkorRunning()) {
          return {
            action: 'FalkorDB',
            success: true,
            message: 'Container created and started',
            details: 'Web UI: http://localhost:3000'
          };
        }
      }
    }

    // FalkorDB is REQUIRED - fail if not running
    return {
      action: 'FalkorDB',
      success: false,
      message: 'Failed to start',
      details: 'Is Docker Desktop running? Start it and try again.'
    };
  } catch (error: any) {
    // FalkorDB is REQUIRED - fail if Docker not available
    return {
      action: 'FalkorDB',
      success: false,
      message: 'Failed to start',
      details: `Docker error: ${error.message}`
    };
  }
}

/**
 * Reindex vectors
 */
async function healVectors(): Promise<HealResult> {
  console.log('🔧 Checking vectors...');

  const vectorsPath = path.join(CONFIG.vectorsDir, 'vectors.json');

  // Check if vectors exist and are valid
  if (fs.existsSync(vectorsPath)) {
    try {
      const vectors = JSON.parse(fs.readFileSync(vectorsPath, 'utf-8'));
      const hasEmbeddings = vectors.some((v: any) => v.embedding && v.embedding.length > 0);

      if (vectors.length > 0 && hasEmbeddings) {
        return {
          action: 'Vectors',
          success: true,
          message: 'Already indexed',
          details: `${vectors.length} chunks with embeddings`
        };
      }
    } catch {
      // Corrupted, will reindex
    }
  }

  console.log('   Reindexing codebase...');

  try {
    // Run the index script
    const { stdout } = await execAsync('npm run brain:index', {
      timeout: 300000 // 5 minute timeout
    });

    // Verify it worked
    if (fs.existsSync(vectorsPath)) {
      const vectors = JSON.parse(fs.readFileSync(vectorsPath, 'utf-8'));
      return {
        action: 'Vectors',
        success: true,
        message: 'Reindexed successfully',
        details: `${vectors.length} chunks indexed`
      };
    }

    return {
      action: 'Vectors',
      success: false,
      message: 'Index command ran but no vectors created',
      details: stdout
    };
  } catch (error: any) {
    return {
      action: 'Vectors',
      success: false,
      message: 'Reindex failed',
      details: error.message
    };
  }
}

/**
 * Recreate memory files from templates
 */
async function healMemory(): Promise<HealResult> {
  console.log('🔧 Checking memory files...');

  const memoryFiles: Record<string, string> = {
    'facts.md': `# DeBra Memory - Facts

> Quick facts Claude should know about this project.
> Use \`/brain remember <fact>\` to add entries.

---

## Project Facts

- Add project facts here

---

*Last updated: ${new Date().toISOString().split('T')[0]}*
`,
    'decisions.md': `# DeBra Memory - Architecture Decisions

> Architecture Decision Records (ADRs) for this project.
> Use \`/brain decide <decision>\` to add entries.

---

## Template

**Date:** YYYY-MM-DD
**Status:** Proposed/Implemented/Deprecated
**Context:** Why this decision was needed
**Decision:** What was decided
**Consequences:** Impact of the decision

---

*Last updated: ${new Date().toISOString().split('T')[0]}*
`,
    'lessons.md': `# DeBra Memory - Lessons Learned

> Lessons learned from bugs, fixes, and development.
> Use \`/brain lesson <lesson>\` to add entries.

---

## Format

Each lesson should include:
- What happened (the bug/issue)
- Why it happened (root cause)
- How to prevent it (the lesson)

---

*Last updated: ${new Date().toISOString().split('T')[0]}*
`,
    'context.md': `# DeBra Memory - Session Context

> Temporary context for the current development session.

---

## Current Focus

- Add current focus areas here

---

*Last updated: ${new Date().toISOString().split('T')[0]}*
`
  };

  // Ensure memory directory exists
  if (!fs.existsSync(CONFIG.memoryDir)) {
    fs.mkdirSync(CONFIG.memoryDir, { recursive: true });
  }

  let created: string[] = [];
  let existing: string[] = [];

  for (const [filename, template] of Object.entries(memoryFiles)) {
    const filepath = path.join(CONFIG.memoryDir, filename);
    if (!fs.existsSync(filepath)) {
      fs.writeFileSync(filepath, template);
      created.push(filename);
    } else {
      existing.push(filename);
    }
  }

  if (created.length === 0) {
    return {
      action: 'Memory',
      success: true,
      message: 'All files exist',
      details: existing.join(', ')
    };
  }

  return {
    action: 'Memory',
    success: true,
    message: `Created ${created.length} file(s)`,
    details: created.join(', ')
  };
}

/**
 * Regenerate ClaudeTeacher.md if stale
 */
async function healTeacher(): Promise<HealResult> {
  console.log('🔧 Checking ClaudeTeacher.md...');

  const teacherPath = './docs/ClaudeTeacher.md';
  const lessonsPath = './.debra/memory/lessons.md';

  // Check if needs regeneration
  let needsRegen = false;
  let reason = '';

  if (!fs.existsSync(teacherPath)) {
    needsRegen = true;
    reason = 'File does not exist';
  } else {
    const teacherStats = fs.statSync(teacherPath);
    const daysSinceUpdate = (Date.now() - teacherStats.mtime.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceUpdate > 7) {
      needsRegen = true;
      reason = `Stale (${Math.floor(daysSinceUpdate)} days old)`;
    } else if (fs.existsSync(lessonsPath)) {
      const lessonsStats = fs.statSync(lessonsPath);
      if (lessonsStats.mtime > teacherStats.mtime) {
        needsRegen = true;
        reason = 'lessons.md has updates';
      }
    }
  }

  if (!needsRegen) {
    return {
      action: 'Teacher',
      success: true,
      message: 'Up to date'
    };
  }

  console.log(`   Regenerating ClaudeTeacher.md (${reason})...`);

  try {
    await execAsync('npm run brain:teacher', {
      timeout: 60000 // 1 minute timeout
    });

    return {
      action: 'Teacher',
      success: true,
      message: 'Regenerated',
      details: reason
    };
  } catch (error: any) {
    return {
      action: 'Teacher',
      success: false,
      message: 'Failed to regenerate',
      details: error.message
    };
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function runHeal(target?: string) {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                        🩹 DeBra - Self-Healing System                         ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);

  const results: HealResult[] = [];

  // Determine what to heal
  const healAll = !target;
  const healTarget = target?.toLowerCase();

  if (healAll || healTarget === 'ollama') {
    results.push(await healOllama());
  }

  if (healAll || healTarget === 'falkor' || healTarget === 'falkordb') {
    results.push(await healFalkorDB());
  }

  if (healAll || healTarget === 'vectors' || healTarget === 'index') {
    results.push(await healVectors());
  }

  if (healAll || healTarget === 'memory') {
    results.push(await healMemory());
  }

  if (healAll || healTarget === 'teacher') {
    results.push(await healTeacher());
  }

  // Display results
  console.log('\n' + '═'.repeat(80) + '\n');

  for (const result of results) {
    const icon = result.success ? '✅' : '❌';
    const statusPad = result.action.padEnd(12);

    console.log(`${icon} ${statusPad} ${result.message}`);

    if (result.details) {
      console.log(`   └─ ${result.details}`);
    }
  }

  // Summary
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  console.log(`
${'═'.repeat(80)}

📊 Summary: ${successCount} healed, ${failCount} failed
`);

  if (failCount > 0) {
    console.log(`
⚠️  Some components could not be healed automatically.
   Check the errors above and try manual recovery.
`);
    process.exit(1);
  } else {
    console.log(`
🚀 All systems healthy! DeBra is ready to use.
`);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const target = args[0];

runHeal(target).catch(console.error);
