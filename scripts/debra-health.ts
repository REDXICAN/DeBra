#!/usr/bin/env npx tsx

/**
 * DeBra - System Health Check
 * 
 * Checks all DeBra components:
 * - Ollama (embeddings)
 * - FalkorDB (knowledge graph)
 * - Vector index
 * - Memory files
 * - Git hooks
 * 
 * Usage: npm run debra:health
 */

import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';

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
  falkorWebPort: 3000,
};

// ============================================================================
// CHECKS
// ============================================================================

interface CheckResult {
  name: string;
  status: 'ok' | 'warn' | 'error';
  message: string;
  details?: string;
}

async function checkOllama(): Promise<CheckResult> {
  try {
    const response = await fetch(`${CONFIG.ollamaUrl}/api/tags`, { 
      signal: AbortSignal.timeout(3000) 
    });
    
    if (!response.ok) {
      return { 
        name: 'Ollama', 
        status: 'error', 
        message: 'Not responding',
        details: 'Run: ollama serve'
      };
    }
    
    const data = await response.json();
    const hasModel = data.models?.some((m: any) => 
      m.name.includes(CONFIG.embedModel)
    );
    
    if (!hasModel) {
      return {
        name: 'Ollama',
        status: 'warn',
        message: `Running but missing ${CONFIG.embedModel}`,
        details: `Run: ollama pull ${CONFIG.embedModel}`
      };
    }
    
    return {
      name: 'Ollama',
      status: 'ok',
      message: `Running with ${CONFIG.embedModel}`,
    };
  } catch (error) {
    return {
      name: 'Ollama',
      status: 'error',
      message: 'Not running',
      details: 'Run: ollama serve'
    };
  }
}

async function checkFalkorDB(): Promise<CheckResult> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    
    socket.setTimeout(2000);
    
    socket.on('connect', () => {
      socket.destroy();
      resolve({
        name: 'FalkorDB',
        status: 'ok',
        message: `Running on port ${CONFIG.falkorPort}`,
        details: `Web UI: http://localhost:${CONFIG.falkorWebPort}`
      });
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve({
        name: 'FalkorDB',
        status: 'error',
        message: 'Not running (REQUIRED)',
        details: 'Run: npm run brain:heal OR docker start debra-falkor'
      });
    });

    socket.on('error', () => {
      resolve({
        name: 'FalkorDB',
        status: 'error',
        message: 'Not running (REQUIRED)',
        details: 'Run: npm run brain:heal OR start Docker Desktop'
      });
    });
    
    socket.connect(CONFIG.falkorPort, CONFIG.falkorHost);
  });
}

function checkVectors(): CheckResult {
  const vectorsPath = path.join(CONFIG.vectorsDir, 'vectors.json');
  const metadataPath = path.join(CONFIG.vectorsDir, 'metadata.json');
  
  if (!fs.existsSync(vectorsPath)) {
    return {
      name: 'Vectors',
      status: 'error',
      message: 'Not indexed',
      details: 'Run: npm run debra:index'
    };
  }
  
  try {
    const vectors = JSON.parse(fs.readFileSync(vectorsPath, 'utf-8'));
    const metadata = fs.existsSync(metadataPath)
      ? JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
      : null;
    
    const indexedAt = metadata?.indexedAt 
      ? new Date(metadata.indexedAt).toLocaleString()
      : 'unknown';
    
    const hasEmbeddings = vectors.some((v: any) => v.embedding && v.embedding.length > 0);
    
    if (!hasEmbeddings) {
      return {
        name: 'Vectors',
        status: 'warn',
        message: `${vectors.length} chunks (no embeddings)`,
        details: 'Reindex with Ollama running: npm run debra:index'
      };
    }
    
    return {
      name: 'Vectors',
      status: 'ok',
      message: `${vectors.length} chunks indexed`,
      details: `Last indexed: ${indexedAt}`
    };
  } catch {
    return {
      name: 'Vectors',
      status: 'error',
      message: 'Corrupted index',
      details: 'Run: npm run debra:index'
    };
  }
}

function checkGraph(): CheckResult {
  const nodesPath = path.join(CONFIG.graphDir, 'nodes.json');
  const edgesPath = path.join(CONFIG.graphDir, 'edges.json');
  
  if (!fs.existsSync(nodesPath)) {
    return {
      name: 'Graph',
      status: 'error',
      message: 'Not built',
      details: 'Run: npm run debra:index'
    };
  }
  
  try {
    const nodes = JSON.parse(fs.readFileSync(nodesPath, 'utf-8'));
    const edges = JSON.parse(fs.readFileSync(edgesPath, 'utf-8'));
    
    return {
      name: 'Graph',
      status: 'ok',
      message: `${nodes.length} nodes, ${edges.length} edges`,
    };
  } catch {
    return {
      name: 'Graph',
      status: 'error',
      message: 'Corrupted graph',
      details: 'Run: npm run debra:index'
    };
  }
}

function checkMemory(): CheckResult {
  const memoryFiles = ['facts.md', 'decisions.md', 'patterns.md', 'context.md'];
  const existing = memoryFiles.filter(f => 
    fs.existsSync(path.join(CONFIG.memoryDir, f))
  );
  
  if (existing.length === 0) {
    return {
      name: 'Memory',
      status: 'warn',
      message: 'No memory files',
      details: 'Memory will be created as you use /brain remember'
    };
  }
  
  // Count facts
  let factCount = 0;
  let decisionCount = 0;
  
  try {
    const factsPath = path.join(CONFIG.memoryDir, 'facts.md');
    if (fs.existsSync(factsPath)) {
      const content = fs.readFileSync(factsPath, 'utf-8');
      factCount = (content.match(/^- /gm) || []).length;
    }
    
    const decisionsPath = path.join(CONFIG.memoryDir, 'decisions.md');
    if (fs.existsSync(decisionsPath)) {
      const content = fs.readFileSync(decisionsPath, 'utf-8');
      decisionCount = (content.match(/^## /gm) || []).length;
    }
  } catch {}
  
  return {
    name: 'Memory',
    status: 'ok',
    message: `${factCount} facts, ${decisionCount} decisions`,
    details: `Files: ${existing.join(', ')}`
  };
}

function checkGitHooks(): CheckResult {
  const huskyDir = './.husky';
  const preCommit = path.join(huskyDir, 'pre-commit');
  
  if (!fs.existsSync(huskyDir)) {
    return {
      name: 'Git Hooks',
      status: 'warn',
      message: 'Not installed',
      details: 'Run: npm run debra:hooks:setup'
    };
  }
  
  if (!fs.existsSync(preCommit)) {
    return {
      name: 'Git Hooks',
      status: 'warn',
      message: 'Husky installed but no hooks',
      details: 'Run: npm run debra:hooks:setup'
    };
  }
  
  return {
    name: 'Git Hooks',
    status: 'ok',
    message: 'Installed and active',
  };
}

function checkPlaywright(): CheckResult {
  try {
    const pkgPath = './node_modules/@playwright/test/package.json';
    if (!fs.existsSync(pkgPath)) {
      return {
        name: 'Playwright',
        status: 'warn',
        message: 'Not installed',
        details: 'Run: npm install @playwright/test && npx playwright install chromium'
      };
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return {
      name: 'Playwright',
      status: 'ok',
      message: `v${pkg.version} installed`,
    };
  } catch {
    return {
      name: 'Playwright',
      status: 'warn',
      message: 'Not installed',
      details: 'Run: npm install @playwright/test'
    };
  }
}

function checkTeacher(): CheckResult {
  const teacherPath = './docs/ClaudeTeacher.md';
  const lessonsPath = './.debra/memory/lessons.md';

  if (!fs.existsSync(teacherPath)) {
    return {
      name: 'Teacher',
      status: 'warn',
      message: 'Not generated',
      details: 'Run: npm run brain:teacher'
    };
  }

  try {
    const teacherStats = fs.statSync(teacherPath);
    const daysSinceUpdate = (Date.now() - teacherStats.mtime.getTime()) / (1000 * 60 * 60 * 24);

    // Check if lessons.md is newer
    if (fs.existsSync(lessonsPath)) {
      const lessonsStats = fs.statSync(lessonsPath);
      if (lessonsStats.mtime > teacherStats.mtime) {
        return {
          name: 'Teacher',
          status: 'warn',
          message: 'Stale (lessons updated)',
          details: 'Run: npm run brain:teacher'
        };
      }
    }

    if (daysSinceUpdate > 7) {
      return {
        name: 'Teacher',
        status: 'warn',
        message: `Stale (${Math.floor(daysSinceUpdate)} days old)`,
        details: 'Run: npm run brain:teacher'
      };
    }

    // Count sections
    const content = fs.readFileSync(teacherPath, 'utf-8');
    const sectionCount = (content.match(/^## /gm) || []).length;

    return {
      name: 'Teacher',
      status: 'ok',
      message: `${sectionCount} sections, updated ${Math.floor(daysSinceUpdate)}d ago`,
    };
  } catch {
    return {
      name: 'Teacher',
      status: 'error',
      message: 'Error reading file',
      details: 'Run: npm run brain:teacher'
    };
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function runHealthCheck() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                       🧠 DeBra - System Health Check                          ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);
  
  const checks: CheckResult[] = [];
  
  // Run all checks
  console.log('🔍 Running checks...\n');
  
  checks.push(await checkOllama());
  checks.push(await checkFalkorDB());
  checks.push(checkVectors());
  checks.push(checkGraph());
  checks.push(checkMemory());
  checks.push(checkGitHooks());
  checks.push(checkPlaywright());
  checks.push(checkTeacher());
  
  // Display results
  console.log('═'.repeat(80));
  console.log();
  
  for (const check of checks) {
    const icon = check.status === 'ok' ? '✅' :
                 check.status === 'warn' ? '⚠️' : '❌';
    const statusPad = check.name.padEnd(12);
    
    console.log(`${icon} ${statusPad} ${check.message}`);
    
    if (check.details && check.status !== 'ok') {
      console.log(`   └─ ${check.details}`);
    }
  }
  
  // Summary
  const okCount = checks.filter(c => c.status === 'ok').length;
  const warnCount = checks.filter(c => c.status === 'warn').length;
  const errorCount = checks.filter(c => c.status === 'error').length;
  
  console.log(`
${'═'.repeat(80)}

📊 Summary: ${okCount} OK, ${warnCount} Warnings, ${errorCount} Errors
`);
  
  if (errorCount > 0) {
    console.log(`
⚠️  Some components need attention. Fix errors above to get full functionality.
`);
  } else if (warnCount > 0) {
    console.log(`
✨ Core system is ready! Optional components can be enabled for more features.
`);
  } else {
    console.log(`
🚀 All systems operational! DeBra is ready to use.

Quick commands:
   /brain status     Show full status
   /brain search     Semantic code search
   /brain impact     Impact analysis
   /brain swarm      Start swarm mode
`);
  }
}

runHealthCheck().catch(console.error);
