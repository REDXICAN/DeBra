#!/usr/bin/env npx tsx

/**
 * DeBra - Background Health Monitor
 *
 * Runs in background and auto-heals when problems detected.
 * Checks every 60 seconds by default.
 *
 * Usage:
 *   npm run brain:monitor           # Start monitor (foreground)
 *   npm run brain:monitor -- --bg   # Start in background
 *
 * Environment:
 *   MONITOR_INTERVAL=60000   # Check interval in ms (default 60s)
 *   MONITOR_VERBOSE=true     # Show all checks, not just problems
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
  checkInterval: parseInt(process.env.MONITOR_INTERVAL || '60000'), // 60 seconds
  verbose: process.env.MONITOR_VERBOSE === 'true',
  debraDir: './.debra',
  vectorsDir: './.debra/vectors',
  memoryDir: './.debra/memory',
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  embedModel: process.env.EMBED_MODEL || 'nomic-embed-text',
  isWindows: process.platform === 'win32',
};

// ============================================================================
// STATUS TRACKING
// ============================================================================

interface ComponentStatus {
  name: string;
  healthy: boolean;
  lastCheck: Date;
  lastHeal?: Date;
  consecutiveFailures: number;
}

const status: Record<string, ComponentStatus> = {
  ollama: { name: 'Ollama', healthy: true, lastCheck: new Date(), consecutiveFailures: 0 },
  vectors: { name: 'Vectors', healthy: true, lastCheck: new Date(), consecutiveFailures: 0 },
  memory: { name: 'Memory', healthy: true, lastCheck: new Date(), consecutiveFailures: 0 },
};

// ============================================================================
// HEALTH CHECKS
// ============================================================================

async function checkOllama(): Promise<boolean> {
  try {
    const response = await fetch(`${CONFIG.ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

function checkVectors(): boolean {
  const vectorsPath = path.join(CONFIG.vectorsDir, 'vectors.json');

  if (!fs.existsSync(vectorsPath)) {
    return false;
  }

  try {
    const vectors = JSON.parse(fs.readFileSync(vectorsPath, 'utf-8'));
    return vectors.length > 0;
  } catch {
    return false;
  }
}

function checkMemory(): boolean {
  const requiredFiles = ['facts.md', 'lessons.md', 'decisions.md'];

  for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(CONFIG.memoryDir, file))) {
      return false;
    }
  }

  return true;
}

// ============================================================================
// AUTO-HEAL ACTIONS
// ============================================================================

async function healOllama(): Promise<boolean> {
  log('🔧 Auto-healing Ollama...');

  try {
    const ollamaProcess = spawn('ollama', ['serve'], {
      detached: true,
      stdio: 'ignore',
      shell: CONFIG.isWindows
    });
    ollamaProcess.unref();

    // Wait for startup
    for (let i = 0; i < 10; i++) {
      await sleep(1000);
      if (await checkOllama()) {
        log('✅ Ollama started successfully');
        return true;
      }
    }

    log('❌ Ollama failed to start');
    return false;
  } catch (error: any) {
    log(`❌ Ollama heal failed: ${error.message}`);
    return false;
  }
}

async function healVectors(): Promise<boolean> {
  log('🔧 Auto-healing vectors...');

  try {
    await execAsync('npm run brain:index', { timeout: 300000 });
    log('✅ Vectors reindexed');
    return true;
  } catch (error: any) {
    log(`❌ Vector reindex failed: ${error.message}`);
    return false;
  }
}

function healMemory(): boolean {
  log('🔧 Auto-healing memory files...');

  const templates: Record<string, string> = {
    'facts.md': '# DeBra Memory - Facts\n\n> Quick facts about this project.\n\n---\n',
    'lessons.md': '# DeBra Memory - Lessons Learned\n\n> Lessons from development.\n\n---\n',
    'decisions.md': '# DeBra Memory - Architecture Decisions\n\n> ADRs for this project.\n\n---\n',
  };

  try {
    if (!fs.existsSync(CONFIG.memoryDir)) {
      fs.mkdirSync(CONFIG.memoryDir, { recursive: true });
    }

    for (const [filename, template] of Object.entries(templates)) {
      const filepath = path.join(CONFIG.memoryDir, filename);
      if (!fs.existsSync(filepath)) {
        fs.writeFileSync(filepath, template);
        log(`   Created ${filename}`);
      }
    }

    log('✅ Memory files restored');
    return true;
  } catch (error: any) {
    log(`❌ Memory heal failed: ${error.message}`);
    return false;
  }
}

// ============================================================================
// MONITOR LOOP
// ============================================================================

async function runCheck() {
  const timestamp = new Date().toLocaleTimeString();

  if (CONFIG.verbose) {
    log(`\n[${timestamp}] Running health checks...`);
  }

  // Check Ollama
  const ollamaHealthy = await checkOllama();
  status.ollama.lastCheck = new Date();

  if (!ollamaHealthy && status.ollama.healthy) {
    log(`\n⚠️  [${timestamp}] Ollama went DOWN`);
    status.ollama.healthy = false;
    status.ollama.consecutiveFailures++;

    if (status.ollama.consecutiveFailures >= 2) {
      const healed = await healOllama();
      if (healed) {
        status.ollama.healthy = true;
        status.ollama.lastHeal = new Date();
        status.ollama.consecutiveFailures = 0;
      }
    }
  } else if (ollamaHealthy && !status.ollama.healthy) {
    log(`\n✅ [${timestamp}] Ollama is back UP`);
    status.ollama.healthy = true;
    status.ollama.consecutiveFailures = 0;
  } else if (ollamaHealthy) {
    status.ollama.consecutiveFailures = 0;
  }

  // Check Vectors
  const vectorsHealthy = checkVectors();
  status.vectors.lastCheck = new Date();

  if (!vectorsHealthy && status.vectors.healthy) {
    log(`\n⚠️  [${timestamp}] Vectors are CORRUPTED/MISSING`);
    status.vectors.healthy = false;
    status.vectors.consecutiveFailures++;

    // Only auto-heal if Ollama is running
    if (status.vectors.consecutiveFailures >= 2 && status.ollama.healthy) {
      const healed = await healVectors();
      if (healed) {
        status.vectors.healthy = true;
        status.vectors.lastHeal = new Date();
        status.vectors.consecutiveFailures = 0;
      }
    }
  } else if (vectorsHealthy && !status.vectors.healthy) {
    log(`\n✅ [${timestamp}] Vectors restored`);
    status.vectors.healthy = true;
    status.vectors.consecutiveFailures = 0;
  } else if (vectorsHealthy) {
    status.vectors.consecutiveFailures = 0;
  }

  // Check Memory
  const memoryHealthy = checkMemory();
  status.memory.lastCheck = new Date();

  if (!memoryHealthy && status.memory.healthy) {
    log(`\n⚠️  [${timestamp}] Memory files MISSING`);
    status.memory.healthy = false;
    status.memory.consecutiveFailures++;

    if (status.memory.consecutiveFailures >= 1) {
      const healed = healMemory();
      if (healed) {
        status.memory.healthy = true;
        status.memory.lastHeal = new Date();
        status.memory.consecutiveFailures = 0;
      }
    }
  } else if (memoryHealthy && !status.memory.healthy) {
    log(`\n✅ [${timestamp}] Memory files restored`);
    status.memory.healthy = true;
    status.memory.consecutiveFailures = 0;
  } else if (memoryHealthy) {
    status.memory.consecutiveFailures = 0;
  }

  if (CONFIG.verbose) {
    const allHealthy = Object.values(status).every(s => s.healthy);
    if (allHealthy) {
      process.stdout.write('.');
    }
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function log(message: string) {
  console.log(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatUptime(startTime: Date): string {
  const diff = Date.now() - startTime.getTime();
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const startTime = new Date();

  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                      👁️  DeBra - Background Health Monitor                    ║
╚═══════════════════════════════════════════════════════════════════════════════╝

Started: ${startTime.toLocaleString()}
Check Interval: ${CONFIG.checkInterval / 1000}s
Verbose: ${CONFIG.verbose}

Monitoring:
  • Ollama (embeddings service)
  • Vectors (semantic search index)
  • Memory (facts, lessons, decisions)

Press Ctrl+C to stop.
${'═'.repeat(80)}
`);

  // Initial check
  await runCheck();

  // Start monitor loop
  const intervalId = setInterval(runCheck, CONFIG.checkInterval);

  // Handle shutdown
  const shutdown = () => {
    console.log(`\n
${'═'.repeat(80)}
Monitor stopped after ${formatUptime(startTime)}

Final Status:
  Ollama:  ${status.ollama.healthy ? '✅ Healthy' : '❌ Down'}
  Vectors: ${status.vectors.healthy ? '✅ Healthy' : '❌ Corrupted'}
  Memory:  ${status.memory.healthy ? '✅ Healthy' : '❌ Missing'}
`);
    clearInterval(intervalId);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep process alive
  process.stdin.resume();
}

main().catch(console.error);
