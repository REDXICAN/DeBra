#!/usr/bin/env npx tsx
/**
 * DeBra Startup Script
 * Ensures all DeBra components are running before starting work
 */

import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();

// ANSI colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

interface ComponentStatus {
  name: string;
  status: 'ok' | 'warning' | 'error' | 'starting';
  message: string;
}

const results: ComponentStatus[] = [];

function log(color: string, symbol: string, name: string, message: string): void {
  console.log(`${color}${symbol}${RESET} ${BOLD}${name.padEnd(12)}${RESET} ${message}`);
}

function exec(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

async function checkOllama(): Promise<void> {
  const name = 'Ollama';

  // Check if ollama is running
  const modelList = exec('ollama list 2>&1');

  if (!modelList || modelList.includes('error') || modelList.includes('refused')) {
    log(YELLOW, '⏳', name, 'Starting Ollama...');

    // Try to start ollama serve in background
    try {
      spawn('ollama', ['serve'], {
        detached: true,
        stdio: 'ignore',
        shell: true
      }).unref();

      // Wait for it to start
      await new Promise(resolve => setTimeout(resolve, 3000));

      const checkAgain = exec('ollama list 2>&1');
      if (checkAgain && !checkAgain.includes('error')) {
        log(GREEN, '✅', name, 'Started successfully');
        results.push({ name, status: 'ok', message: 'Started' });
      } else {
        log(RED, '❌', name, 'Failed to start. Run: ollama serve');
        results.push({ name, status: 'error', message: 'Failed to start' });
      }
    } catch {
      log(RED, '❌', name, 'Not installed. Visit: https://ollama.ai');
      results.push({ name, status: 'error', message: 'Not installed' });
    }
    return;
  }

  // Check for nomic-embed-text model
  if (modelList.includes('nomic-embed-text')) {
    log(GREEN, '✅', name, 'Running with nomic-embed-text');
    results.push({ name, status: 'ok', message: 'Running' });
  } else {
    log(YELLOW, '⏳', name, 'Pulling nomic-embed-text model...');
    const pullResult = exec('ollama pull nomic-embed-text 2>&1');
    if (pullResult) {
      log(GREEN, '✅', name, 'Model pulled successfully');
      results.push({ name, status: 'ok', message: 'Model ready' });
    } else {
      log(RED, '❌', name, 'Failed to pull model');
      results.push({ name, status: 'error', message: 'Model missing' });
    }
  }
}

async function checkDocker(): Promise<boolean> {
  const name = 'Docker';

  const dockerPs = exec('docker ps 2>&1');

  if (!dockerPs || dockerPs.includes('error') || dockerPs.includes('cannot find')) {
    log(YELLOW, '⚠️', name, 'Not running. Start Docker Desktop.');
    results.push({ name, status: 'warning', message: 'Not running' });
    return false;
  }

  log(GREEN, '✅', name, 'Running');
  results.push({ name, status: 'ok', message: 'Running' });
  return true;
}

async function checkFalkorDB(dockerRunning: boolean): Promise<void> {
  const name = 'FalkorDB';

  if (!dockerRunning) {
    log(YELLOW, '⚠️', name, 'Skipped (Docker not running)');
    results.push({ name, status: 'warning', message: 'Docker required' });
    return;
  }

  // Check if FalkorDB container exists
  const containers = exec('docker ps -a --format "{{.Names}}" 2>&1') || '';

  if (containers.includes('debra-falkor')) {
    // Container exists, check if running
    const running = exec('docker ps --format "{{.Names}}" 2>&1') || '';

    if (running.includes('debra-falkor')) {
      log(GREEN, '✅', name, 'Running on ports 6379, 3000');
      results.push({ name, status: 'ok', message: 'Running' });
    } else {
      log(YELLOW, '⏳', name, 'Starting container...');
      exec('docker start debra-falkor');
      await new Promise(resolve => setTimeout(resolve, 2000));
      log(GREEN, '✅', name, 'Started');
      results.push({ name, status: 'ok', message: 'Started' });
    }
  } else {
    // Need to create container
    log(YELLOW, '⏳', name, 'Creating container...');
    const result = exec('docker run -d -p 6379:6379 -p 3000:3000 --name debra-falkor falkordb/falkordb:latest 2>&1');

    if (result && !result.includes('error')) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      log(GREEN, '✅', name, 'Container created and running');
      results.push({ name, status: 'ok', message: 'Created' });
    } else {
      log(RED, '❌', name, 'Failed to create container');
      results.push({ name, status: 'error', message: 'Creation failed' });
    }
  }
}

async function checkVectors(): Promise<void> {
  const name = 'Vectors';
  const vectorFile = path.join(ROOT, '.debra', 'vectors', 'vectors.json');

  if (fs.existsSync(vectorFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(vectorFile, 'utf8'));
      const chunkCount = data.chunks?.length || 0;

      if (chunkCount > 0) {
        log(GREEN, '✅', name, `${chunkCount} chunks indexed`);
        results.push({ name, status: 'ok', message: `${chunkCount} chunks` });
      } else {
        log(YELLOW, '⚠️', name, 'Empty. Run: npm run brain:index');
        results.push({ name, status: 'warning', message: 'Empty' });
      }
    } catch {
      log(YELLOW, '⚠️', name, 'Corrupted. Run: npm run brain:rebuild');
      results.push({ name, status: 'warning', message: 'Corrupted' });
    }
  } else {
    log(YELLOW, '⚠️', name, 'Not indexed. Run: npm run brain:index');
    results.push({ name, status: 'warning', message: 'Not indexed' });
  }
}

async function checkMemory(): Promise<void> {
  const name = 'Memory';
  const memoryDir = path.join(ROOT, '.debra', 'memory');

  if (!fs.existsSync(memoryDir)) {
    log(RED, '❌', name, 'Directory missing');
    results.push({ name, status: 'error', message: 'Missing' });
    return;
  }

  const files = ['facts.md', 'decisions.md', 'lessons.md'];
  const counts: string[] = [];

  for (const file of files) {
    const filePath = path.join(memoryDir, file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(l => l.startsWith('- ') || l.startsWith('## ')).length;
      counts.push(`${lines} ${file.replace('.md', '')}`);
    }
  }

  if (counts.length > 0) {
    log(GREEN, '✅', name, counts.join(', '));
    results.push({ name, status: 'ok', message: counts.join(', ') });
  } else {
    log(YELLOW, '⚠️', name, 'No memory files found');
    results.push({ name, status: 'warning', message: 'Empty' });
  }
}

async function checkPlaywright(): Promise<void> {
  const name = 'Playwright';

  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const version = pkg.devDependencies?.['@playwright/test'] || pkg.dependencies?.['@playwright/test'];

    if (version) {
      log(GREEN, '✅', name, `v${version.replace('^', '')} installed`);
      results.push({ name, status: 'ok', message: `v${version}` });
    } else {
      log(YELLOW, '⚠️', name, 'Not installed. Run: npm i -D @playwright/test');
      results.push({ name, status: 'warning', message: 'Not installed' });
    }
  } catch {
    log(RED, '❌', name, 'Could not check');
    results.push({ name, status: 'error', message: 'Check failed' });
  }
}

async function checkHusky(): Promise<void> {
  const name = 'Git Hooks';
  const huskyDir = path.join(ROOT, '.husky');

  if (fs.existsSync(huskyDir)) {
    const hooks = fs.readdirSync(huskyDir).filter(f => !f.startsWith('_') && !f.startsWith('.'));

    if (hooks.length > 0) {
      log(GREEN, '✅', name, `${hooks.length} hooks configured`);
      results.push({ name, status: 'ok', message: `${hooks.length} hooks` });
    } else {
      log(YELLOW, '⚠️', name, 'No hooks configured');
      results.push({ name, status: 'warning', message: 'No hooks' });
    }
  } else {
    log(YELLOW, '⚠️', name, 'Husky not initialized');
    results.push({ name, status: 'warning', message: 'Not initialized' });
  }
}

async function main(): Promise<void> {
  console.log(`
╔${'═'.repeat(79)}╗
║${' '.repeat(20)}${CYAN}${BOLD}🧠 DeBra - Startup Check${RESET}${' '.repeat(34)}║
╚${'═'.repeat(79)}╝
`);

  console.log(`${BLUE}🔍 Checking components...${RESET}\n`);
  console.log('─'.repeat(80));

  // Check all components
  await checkOllama();
  const dockerRunning = await checkDocker();
  await checkFalkorDB(dockerRunning);
  await checkVectors();
  await checkMemory();
  await checkPlaywright();
  await checkHusky();

  console.log('─'.repeat(80));

  // Summary
  const ok = results.filter(r => r.status === 'ok').length;
  const warnings = results.filter(r => r.status === 'warning').length;
  const errors = results.filter(r => r.status === 'error').length;

  console.log(`
${BOLD}📊 Summary:${RESET} ${GREEN}${ok} OK${RESET}, ${YELLOW}${warnings} Warnings${RESET}, ${RED}${errors} Errors${RESET}
`);

  if (errors === 0 && warnings <= 2) {
    console.log(`${GREEN}${BOLD}✨ DeBra is ready! Start coding.${RESET}\n`);
  } else if (errors === 0) {
    console.log(`${YELLOW}${BOLD}⚠️ DeBra running with optional features disabled.${RESET}\n`);
  } else {
    console.log(`${RED}${BOLD}❌ Some core components need attention.${RESET}\n`);
  }

  // Quick commands
  console.log(`${BOLD}Quick Commands:${RESET}
  npm run brain:search "query"  - Semantic search
  npm run brain:impact "file"   - Impact analysis
  npm run brain:health          - Health check
  npm run brain:index           - Reindex codebase
`);
}

main().catch(console.error);
