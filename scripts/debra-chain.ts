#!/usr/bin/env npx tsx

/**
 * DeBra - Chain Workflow Executor
 *
 * Executes multi-step workflows:
 * - brain:fix    → tsc → docs → lessons → teacher
 * - brain:feature → tsc → test → docs → commit
 * - brain:qc     → scenarios → feedback → fix → document
 * - brain:deploy → tsc → build → test → push
 *
 * Usage:
 *   npm run brain:chain fix
 *   npm run brain:chain feature
 *   npm run brain:chain deploy
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  chainsDir: './.debra/chains',
  memoryDir: './.debra/memory',
  rulesDir: './.claude/rules',
  verbose: process.argv.includes('--verbose') || process.argv.includes('-v'),
  dryRun: process.argv.includes('--dry-run'),
};

// ============================================================================
// TYPES
// ============================================================================

interface ChainStep {
  name: string;
  description: string;
  type: 'command' | 'action' | 'prompt';
  value: string;
  onFailure: 'abort' | 'continue' | 'warn';
  condition?: string;
  requires?: string[];
}

interface Chain {
  name: string;
  description: string;
  steps: ChainStep[];
}

interface StepResult {
  step: string;
  success: boolean;
  message: string;
  output?: string;
  duration: number;
}

// ============================================================================
// BUILT-IN CHAINS
// ============================================================================

const BUILT_IN_CHAINS: Record<string, Chain> = {
  fix: {
    name: 'fix',
    description: 'Complete bug fix workflow: verify → document → learn',
    steps: [
      {
        name: 'typecheck',
        description: 'Run TypeScript compiler',
        type: 'command',
        value: 'npx tsc --noEmit',
        onFailure: 'abort',
      },
      {
        name: 'build',
        description: 'Build the project',
        type: 'command',
        value: 'npm run build',
        onFailure: 'abort',
      },
      {
        name: 'update_teacher',
        description: 'Update ClaudeTeacher.md',
        type: 'command',
        value: 'npm run brain:teacher',
        onFailure: 'warn',
      },
      {
        name: 'health_check',
        description: 'Verify DeBra health',
        type: 'command',
        value: 'npm run brain:health',
        onFailure: 'warn',
      },
    ],
  },

  feature: {
    name: 'feature',
    description: 'New feature workflow: verify → test → document',
    steps: [
      {
        name: 'typecheck',
        description: 'Run TypeScript compiler',
        type: 'command',
        value: 'npx tsc --noEmit',
        onFailure: 'abort',
      },
      {
        name: 'build',
        description: 'Build the project',
        type: 'command',
        value: 'npm run build',
        onFailure: 'abort',
      },
      {
        name: 'update_teacher',
        description: 'Update ClaudeTeacher.md',
        type: 'command',
        value: 'npm run brain:teacher',
        onFailure: 'warn',
      },
    ],
  },

  deploy: {
    name: 'deploy',
    description: 'Deployment workflow: verify → build → push',
    steps: [
      {
        name: 'typecheck',
        description: 'Run TypeScript compiler',
        type: 'command',
        value: 'npx tsc --noEmit',
        onFailure: 'abort',
      },
      {
        name: 'build',
        description: 'Build the project',
        type: 'command',
        value: 'npm run build',
        onFailure: 'abort',
      },
      {
        name: 'update_teacher',
        description: 'Update ClaudeTeacher.md',
        type: 'command',
        value: 'npm run brain:teacher',
        onFailure: 'warn',
      },
      {
        name: 'health_check',
        description: 'Final health check',
        type: 'command',
        value: 'npm run brain:health',
        onFailure: 'warn',
      },
      {
        name: 'git_status',
        description: 'Show git status',
        type: 'command',
        value: 'git status',
        onFailure: 'continue',
      },
    ],
  },

  verify: {
    name: 'verify',
    description: 'Quick verification: typecheck → build',
    steps: [
      {
        name: 'typecheck',
        description: 'Run TypeScript compiler',
        type: 'command',
        value: 'npx tsc --noEmit',
        onFailure: 'abort',
      },
      {
        name: 'build',
        description: 'Build the project',
        type: 'command',
        value: 'npm run build',
        onFailure: 'abort',
      },
    ],
  },

  learn: {
    name: 'learn',
    description: 'Learning workflow: update all documentation',
    steps: [
      {
        name: 'update_teacher',
        description: 'Update ClaudeTeacher.md',
        type: 'command',
        value: 'npm run brain:teacher',
        onFailure: 'abort',
      },
      {
        name: 'reindex',
        description: 'Reindex codebase',
        type: 'command',
        value: 'npm run brain:index',
        onFailure: 'warn',
      },
      {
        name: 'health_check',
        description: 'Verify DeBra health',
        type: 'command',
        value: 'npm run brain:health',
        onFailure: 'continue',
      },
    ],
  },

  health: {
    name: 'health',
    description: 'Full health workflow: heal → verify → report',
    steps: [
      {
        name: 'heal',
        description: 'Auto-heal any issues',
        type: 'command',
        value: 'npm run brain:heal',
        onFailure: 'continue',
      },
      {
        name: 'health_check',
        description: 'Run health check',
        type: 'command',
        value: 'npm run brain:health',
        onFailure: 'continue',
      },
    ],
  },
};

// ============================================================================
// CHAIN EXECUTOR
// ============================================================================

async function executeStep(step: ChainStep): Promise<StepResult> {
  const startTime = Date.now();

  if (CONFIG.dryRun) {
    return {
      step: step.name,
      success: true,
      message: `[DRY RUN] Would execute: ${step.value}`,
      duration: 0,
    };
  }

  if (step.type === 'command') {
    try {
      const { stdout, stderr } = await execAsync(step.value, {
        timeout: 300000, // 5 minute timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      return {
        step: step.name,
        success: true,
        message: 'Completed',
        output: stdout || stderr,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        step: step.name,
        success: false,
        message: error.message,
        output: error.stdout || error.stderr,
        duration: Date.now() - startTime,
      };
    }
  }

  if (step.type === 'action') {
    // Built-in actions
    switch (step.value) {
      case 'show_git_diff':
        try {
          const { stdout } = await execAsync('git diff --stat');
          return {
            step: step.name,
            success: true,
            message: 'Git diff retrieved',
            output: stdout,
            duration: Date.now() - startTime,
          };
        } catch (error: any) {
          return {
            step: step.name,
            success: false,
            message: error.message,
            duration: Date.now() - startTime,
          };
        }

      default:
        return {
          step: step.name,
          success: false,
          message: `Unknown action: ${step.value}`,
          duration: Date.now() - startTime,
        };
    }
  }

  return {
    step: step.name,
    success: false,
    message: `Unknown step type: ${step.type}`,
    duration: Date.now() - startTime,
  };
}

async function executeChain(chain: Chain): Promise<boolean> {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                       ⛓️  DeBra - Chain Executor                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝

Chain: ${chain.name}
Description: ${chain.description}
Steps: ${chain.steps.length}
${CONFIG.dryRun ? '\n🔸 DRY RUN MODE - No changes will be made\n' : ''}
${'═'.repeat(80)}
`);

  const results: StepResult[] = [];
  let allSuccessful = true;
  let aborted = false;

  for (let i = 0; i < chain.steps.length; i++) {
    const step = chain.steps[i];
    const stepNum = `[${i + 1}/${chain.steps.length}]`;

    console.log(`\n${stepNum} ${step.description}...`);

    if (CONFIG.verbose) {
      console.log(`   Command: ${step.value}`);
    }

    const result = await executeStep(step);
    results.push(result);

    if (result.success) {
      console.log(`   ✅ ${result.message} (${formatDuration(result.duration)})`);

      if (CONFIG.verbose && result.output) {
        console.log(`   Output: ${result.output.slice(0, 200)}...`);
      }
    } else {
      const icon = step.onFailure === 'abort' ? '❌' :
                   step.onFailure === 'warn' ? '⚠️' : '⏭️';

      console.log(`   ${icon} ${result.message}`);

      if (result.output) {
        // Show last few lines of error output
        const lines = result.output.trim().split('\n');
        const lastLines = lines.slice(-5).join('\n');
        console.log(`   └─ ${lastLines}`);
      }

      if (step.onFailure === 'abort') {
        console.log(`\n❌ Chain aborted at step: ${step.name}`);
        allSuccessful = false;
        aborted = true;
        break;
      } else if (step.onFailure === 'warn') {
        console.log(`   └─ Continuing despite warning...`);
      }
      // 'continue' - just proceed silently
    }
  }

  // Summary
  console.log(`
${'═'.repeat(80)}

📊 Chain Summary: ${chain.name}
`);

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

  for (const result of results) {
    const icon = result.success ? '✅' : '❌';
    console.log(`   ${icon} ${result.step.padEnd(20)} ${formatDuration(result.duration)}`);
  }

  console.log(`
   Total: ${successful} passed, ${failed} failed
   Time:  ${formatDuration(totalTime)}
`);

  if (aborted) {
    console.log(`
⚠️  Chain was aborted. Fix the failing step and try again.
`);
    return false;
  }

  if (allSuccessful) {
    console.log(`
🚀 Chain completed successfully!
`);
    return true;
  }

  console.log(`
⚠️  Chain completed with warnings.
`);
  return true;
}

// ============================================================================
// UTILITIES
// ============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function loadChain(name: string): Chain | null {
  // First check built-in chains
  if (BUILT_IN_CHAINS[name]) {
    return BUILT_IN_CHAINS[name];
  }

  // Then check custom chain files
  const chainPath = path.join(CONFIG.chainsDir, `${name}.json`);
  if (fs.existsSync(chainPath)) {
    try {
      return JSON.parse(fs.readFileSync(chainPath, 'utf-8'));
    } catch {
      console.error(`Failed to load chain from ${chainPath}`);
      return null;
    }
  }

  return null;
}

function listChains(): void {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                       ⛓️  DeBra - Available Chains                             ║
╚═══════════════════════════════════════════════════════════════════════════════╝

Built-in Chains:
`);

  for (const [name, chain] of Object.entries(BUILT_IN_CHAINS)) {
    console.log(`   ${name.padEnd(12)} ${chain.description}`);
    console.log(`   ${''.padEnd(12)} Steps: ${chain.steps.map(s => s.name).join(' → ')}`);
    console.log();
  }

  // Check for custom chains
  if (fs.existsSync(CONFIG.chainsDir)) {
    const customChains = fs.readdirSync(CONFIG.chainsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));

    if (customChains.length > 0) {
      console.log(`Custom Chains:`);
      for (const name of customChains) {
        const chain = loadChain(name);
        if (chain) {
          console.log(`   ${name.padEnd(12)} ${chain.description}`);
        }
      }
      console.log();
    }
  }

  console.log(`
Usage:
   npm run brain:chain <name>           Run a chain
   npm run brain:chain <name> --dry-run Preview without executing
   npm run brain:chain <name> -v        Verbose output
`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2).filter(a => !a.startsWith('-'));
  const chainName = args[0];

  if (!chainName || chainName === 'list' || chainName === 'help') {
    listChains();
    return;
  }

  const chain = loadChain(chainName);

  if (!chain) {
    console.error(`\n❌ Unknown chain: ${chainName}\n`);
    console.log('Available chains:');
    for (const name of Object.keys(BUILT_IN_CHAINS)) {
      console.log(`   - ${name}`);
    }
    process.exit(1);
  }

  const success = await executeChain(chain);
  process.exit(success ? 0 : 1);
}

main().catch(console.error);
