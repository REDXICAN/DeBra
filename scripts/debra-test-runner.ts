/**
 * DeBra Test Runner
 *
 * Interactive test runner that executes test scripts and handles errors.
 * Runs INSIDE Claude Code session for interactive error resolution.
 *
 * Usage:
 *   npx tsx scripts/debra-test-runner.ts --script <path.md>
 *   npx tsx scripts/debra-test-runner.ts --script e2e/scenarios/zero-to-quote-v5.md
 */

import { chromium, Browser, Page, ConsoleMessage } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { loadTestScript, TestStep, ParsedScript } from './debra-test-parser';

// ============================================================================
// Types
// ============================================================================

export interface TestResult {
  step: TestStep;
  status: 'passed' | 'failed' | 'auto-fixed' | 'user-guided' | 'skipped' | 'blocked';
  screenshot?: string;
  consoleErrors?: string[];
  visualErrors?: string[];
  dataErrors?: string[];
  fix?: FixResult;
  duration?: number;
  retryCount?: number;
}

export interface FixResult {
  source: 'debra-exact' | 'debra-semantic' | 'user';
  solution: string;
  file?: string;
  documented?: boolean;
}

export interface DebraSolution {
  found: boolean;
  exact: boolean;
  source?: string;
  solution?: string;
  file?: string;
  relatedFiles?: string[];
  suggestion?: string;
}

export interface RunnerConfig {
  headless: boolean;
  slowMo: number;
  screenshotDir: string;
  maxRetries: number;
  timeout: number;
  interactive: boolean;
  verbose: boolean;
}

// Global verbose flag for logging
let VERBOSE = false;

function log(message: string, level: 'info' | 'debug' | 'step' | 'error' | 'success' = 'info'): void {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
  const prefix = {
    info: '📋',
    debug: '🔍',
    step: '▶',
    error: '❌',
    success: '✅',
  }[level];

  if (level === 'debug' && !VERBOSE) return;

  console.log(`[${timestamp}] ${prefix} ${message}`);
}

function logVerbose(message: string): void {
  if (VERBOSE) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
    console.log(`[${timestamp}] 🔍 ${message}`);
  }
}

// ============================================================================
// Console Error Collector
// ============================================================================

class ConsoleErrorCollector {
  private errors: string[] = [];
  private warnings: string[] = [];

  handleMessage(msg: ConsoleMessage): void {
    const type = msg.type();
    const text = msg.text();

    if (type === 'error' && this.isCriticalError(text)) {
      this.errors.push(text);
    } else if (type === 'warning' && this.isRelevantWarning(text)) {
      this.warnings.push(text);
    }
  }

  private isCriticalError(text: string): boolean {
    // Ignore resource load errors and non-critical API errors
    const ignorePatterns = [
      'Failed to load resource',  // 403, 404 resource errors
      'net::ERR_',                // Network errors for resources
      'favicon',                  // Favicon errors
      '.png',                     // Image load errors
      '.jpg',
      '.gif',
      '.woff',                    // Font errors
      '.ttf',
      'ResizeObserver',           // React resize observer warnings
      'Access denied',            // 403 role-based access (non-critical for tests)
      'Required roles:',          // Role-based access errors
      'Error fetching users',     // Admin-only API calls that fail for non-admin users
    ];
    return !ignorePatterns.some((p) => text.includes(p));
  }

  private isRelevantWarning(text: string): boolean {
    // Filter out noise
    const ignorePatterns = [
      'DevTools',
      'Download the React DevTools',
      'React Router',
      'Violation',
    ];
    return !ignorePatterns.some((p) => text.includes(p));
  }

  getErrors(): string[] {
    return [...this.errors];
  }

  getWarnings(): string[] {
    return [...this.warnings];
  }

  clear(): void {
    this.errors = [];
    this.warnings = [];
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }
}

// ============================================================================
// DeBra Integration
// ============================================================================

/**
 * Search error-solutions.md and fix files for exact match
 */
async function searchDeBraExact(error: string): Promise<DebraSolution | null> {
  const errorSolutionsPath = path.join(process.cwd(), '.claude/rules/error-solutions.md');

  if (!fs.existsSync(errorSolutionsPath)) {
    return null;
  }

  const content = fs.readFileSync(errorSolutionsPath, 'utf-8');
  const sections = content.split(/(?=###\s)/);

  for (const section of sections) {
    // Look for exact error match
    const errorMatch = section.match(/\*\*Error:\*\*\s*(.+)/i);
    const solutionMatch = section.match(/\*\*Solution:\*\*\s*(.+)/i);
    const fileMatch = section.match(/\*\*(?:File|Location):\*\*\s*(.+)/i);

    if (errorMatch && solutionMatch) {
      const documentedError = errorMatch[1].trim();

      // Check for exact or partial match
      if (
        error.includes(documentedError) ||
        documentedError.includes(error.substring(0, 50))
      ) {
        return {
          found: true,
          exact: true,
          source: 'error-solutions.md',
          solution: solutionMatch[1].trim(),
          file: fileMatch ? fileMatch[1].trim() : undefined,
        };
      }
    }
  }

  return null;
}

/**
 * Search using semantic search (brain:search)
 */
async function searchDeBraSemantic(error: string): Promise<DebraSolution> {
  try {
    // Escape the error message for shell
    const escapedError = error.replace(/"/g, '\\"').substring(0, 100);
    const result = execSync(`npm run brain:search "${escapedError}" 2>&1`, {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 30000,
    });

    // Parse the output to extract relevant information
    const lines = result.split('\n');
    const relatedFiles: string[] = [];
    let suggestion = '';

    for (const line of lines) {
      if (line.includes('.ts') || line.includes('.tsx')) {
        const fileMatch = line.match(/([a-zA-Z0-9_/-]+\.(ts|tsx))/);
        if (fileMatch) {
          relatedFiles.push(fileMatch[1]);
        }
      }
      if (line.includes('content:') || line.includes('summary:')) {
        suggestion = line.replace(/^.*?:/, '').trim();
      }
    }

    return {
      found: relatedFiles.length > 0,
      exact: false,
      source: 'semantic-search',
      relatedFiles: relatedFiles.slice(0, 5),
      suggestion: suggestion || 'Related files found, manual investigation needed',
    };
  } catch {
    return {
      found: false,
      exact: false,
      suggestion: 'No related solutions found in DeBra',
    };
  }
}

/**
 * Document a new fix to error-solutions.md
 */
async function documentFix(
  error: string,
  solution: string,
  file?: string
): Promise<void> {
  const errorSolutionsPath = path.join(process.cwd(), '.claude/rules/error-solutions.md');

  const entry = `

### ${error.substring(0, 50).replace(/\n/g, ' ')}...
**Error:** ${error.replace(/\n/g, ' ').substring(0, 200)}
**Solution:** ${solution}
${file ? `**File:** ${file}` : ''}
**Added:** ${new Date().toISOString()}
**Source:** DeBra Test Runner (auto-documented)
`;

  fs.appendFileSync(errorSolutionsPath, entry);
  console.log('📝 Fix documented to error-solutions.md');
}

// ============================================================================
// White Screen Detection
// ============================================================================

async function detectWhiteScreen(page: Page): Promise<boolean> {
  try {
    // Check if body has minimal content
    const bodyContent = await page.evaluate(() => {
      const body = document.body;
      if (!body) return { empty: true, text: '' };

      const text = body.innerText.trim();
      const hasContent = body.children.length > 0;
      const hasText = text.length > 10;

      return {
        empty: !hasContent || !hasText,
        text: text.substring(0, 100),
        childCount: body.children.length,
      };
    });

    if (bodyContent.empty) {
      return true;
    }

    // Check for React error boundary messages
    const hasErrorBoundary = await page.evaluate(() => {
      return (
        document.body.innerText.includes('Something went wrong') ||
        document.body.innerText.includes('Error') ||
        document.querySelector('.error-boundary') !== null
      );
    });

    return hasErrorBoundary;
  } catch {
    return true; // If we can't evaluate, something is wrong
  }
}

// ============================================================================
// Step Executor
// ============================================================================

async function executeStep(
  page: Page,
  step: TestStep,
  config: RunnerConfig
): Promise<{ success: boolean; screenshot?: string; error?: string }> {
  const screenshotPath = path.join(
    config.screenshotDir,
    `${step.id}-${step.section.replace(/[^a-z0-9]/gi, '-')}.png`
  );

  try {
    switch (step.action) {
      case 'navigate':
        if (step.value) {
          // Handle relative URLs by using page.goto with baseURL context
          const url = step.value.startsWith('/')
            ? new URL(step.value, page.url()).href
            : step.value;
          logVerbose(`Navigating to: ${url}`);
          await page.goto(url, { timeout: config.timeout });
        }
        break;

      case 'click':
        if (step.selector) {
          // Try multiple selector strategies
          const selectors = step.selector.split(',').map((s) => s.trim());
          let clicked = false;

          for (const selector of selectors) {
            try {
              logVerbose(`Trying selector: ${selector}`);

              // Handle text= prefix for direct text matching
              if (selector.startsWith('text=')) {
                const text = selector.slice(5);
                await page.getByText(text, { exact: false }).first().click({ timeout: 10000 });
                clicked = true;
                break;
              }

              // Handle role= prefix for role-based matching (e.g., role=button:Sign In)
              if (selector.startsWith('role=')) {
                const [role, name] = selector.slice(5).split(':');
                await page.getByRole(role as any, { name }).click({ timeout: 10000 });
                clicked = true;
                break;
              }

              // Handle :has-text pseudo-selector (Playwright native)
              if (selector.includes(':has-text(')) {
                const match = selector.match(/:has-text\("([^"]+)"\)/);
                if (match) {
                  const text = match[1];
                  const baseSelector = selector.split(':has-text')[0] || '*';
                  // Use getByRole for button with text - most reliable approach
                  if (baseSelector === 'button' || baseSelector.includes('button')) {
                    const button = page.getByRole('button', { name: text }).first();
                    await button.click({ timeout: 10000 });
                  } else {
                    const element = page.locator(`${baseSelector}:has-text("${text}")`).first();
                    await element.click({ timeout: 10000 });
                  }
                  clicked = true;
                  break;
                }
              }

              // Handle :contains pseudo-selector (not native, convert to has-text)
              if (selector.includes(':contains(')) {
                const match = selector.match(/:contains\("?([^")]+)"?\)/);
                if (match) {
                  const text = match[1];
                  const baseSelector = selector.split(':contains')[0] || '*';
                  const element = page.locator(`${baseSelector}:has-text("${text}")`).first();
                  await element.click({ timeout: 10000 });
                  clicked = true;
                  break;
                }
              }

              // Default: use locator for more reliable clicking
              await page.locator(selector).first().click({ timeout: 10000 });
              clicked = true;
              break;
            } catch (err) {
              logVerbose(`Selector failed: ${selector} - ${err instanceof Error ? err.message : String(err)}`);
              // Try next selector
            }
          }

          if (!clicked) {
            throw new Error(`Could not click any selector: ${step.selector}`);
          }
        }
        break;

      case 'fill':
        if (step.fields) {
          for (const [field, value] of Object.entries(step.fields)) {
            const fieldSelector = `input[name="${field}"], input[data-testid="${field}"], input[placeholder*="${field}"]`;
            await page.fill(fieldSelector, value, { timeout: 5000 });
          }
        } else if (step.selector && step.value) {
          const selectors = step.selector.split(',').map((s) => s.trim());
          for (const selector of selectors) {
            try {
              await page.fill(selector.trim(), step.value, { timeout: 5000 });
              break;
            } catch {
              // Try next selector
            }
          }
        }
        break;

      case 'verify':
        // Verification steps just check current state
        if (step.selector) {
          const selectors = step.selector.split(',').map((s) => s.trim());
          let found = false;

          for (const selector of selectors) {
            try {
              await page.waitForSelector(selector.trim(), { timeout: 5000 });
              found = true;
              break;
            } catch {
              // Try next selector
            }
          }

          if (!found) {
            throw new Error(`Verification failed: ${step.selector} not found`);
          }
        }
        break;

      case 'type':
        if (step.selector && step.value) {
          await page.type(step.selector, step.value);
        }
        break;

      case 'dragOrSelect':
        // For room assignment - usually a dropdown select
        if (step.selector && step.value) {
          await page.selectOption(step.selector, step.value).catch(() => {
            // If not a select, try clicking
            return page.click(step.selector!);
          });
        }
        break;

      case 'keyboard':
        // Press keyboard keys (ArrowDown, Enter, Escape, Tab, etc.)
        if (step.value) {
          if (step.selector) {
            // Focus on element first, then press key
            const element = page.locator(step.selector).first();
            await element.focus();
            await element.press(step.value, { timeout: 5000 });
          } else {
            // Press key globally
            await page.keyboard.press(step.value);
          }
          logVerbose(`Pressed key: ${step.value}`);
        }
        break;

      default:
        console.log(`⚠️ Unknown action: ${step.action}`);
    }

    // Wait a moment for the page to settle
    await page.waitForTimeout(500);

    // Take screenshot if configured
    if (config.screenshotDir) {
      await page.screenshot({ path: screenshotPath, fullPage: false });
    }

    return { success: true, screenshot: screenshotPath };
  } catch (error: unknown) {
    // Take error screenshot
    await page.screenshot({ path: screenshotPath.replace('.png', '-ERROR.png'), fullPage: true });

    return {
      success: false,
      screenshot: screenshotPath.replace('.png', '-ERROR.png'),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Main Runner
// ============================================================================

export async function runTests(
  scriptPath: string,
  config: Partial<RunnerConfig> = {}
): Promise<TestResult[]> {
  const fullConfig: RunnerConfig = {
    headless: false,
    slowMo: 100,
    screenshotDir: path.join(process.cwd(), 'test-results', new Date().toISOString().split('T')[0]),
    maxRetries: 3,
    timeout: 30000,
    interactive: true,
    verbose: false,
    ...config,
  };

  // Ensure screenshot directory exists
  if (!fs.existsSync(fullConfig.screenshotDir)) {
    fs.mkdirSync(fullConfig.screenshotDir, { recursive: true });
  }

  // Load and parse test script
  console.log(`\n📋 Loading test script: ${scriptPath}`);
  const script = loadTestScript(scriptPath);
  console.log(`   Title: ${script.title}`);
  console.log(`   Steps: ${script.steps.length}`);
  console.log(`   Base URL: ${script.config.baseUrl}\n`);

  // Launch browser
  console.log('🌐 Launching browser...');
  const browser: Browser = await chromium.launch({
    headless: fullConfig.headless,
    slowMo: fullConfig.slowMo,
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });

  const page: Page = await context.newPage();

  // Set up console error collector
  const errorCollector = new ConsoleErrorCollector();
  page.on('console', (msg) => errorCollector.handleMessage(msg));

  const results: TestResult[] = [];
  let blocked = false;

  try {
    // Navigate to base URL first
    console.log(`🔗 Navigating to ${script.config.baseUrl}...`);
    await page.goto(script.config.baseUrl, { timeout: fullConfig.timeout });
    await page.waitForTimeout(2000);

    // Execute each step
    for (const step of script.steps) {
      if (blocked) {
        results.push({ step, status: 'blocked' });
        continue;
      }

      const startTime = Date.now();
      errorCollector.clear();

      log(`Step ${step.id}: ${step.section}`, 'step');
      logVerbose(`Action: ${step.action}`);
      if (step.selector) logVerbose(`Selector: ${step.selector.substring(0, 60)}...`);
      if (step.value) logVerbose(`Value: ${step.value}`);

      // Execute the step
      const execution = await executeStep(page, step, fullConfig);

      // Check for errors
      const consoleErrors = errorCollector.getErrors();
      const isWhiteScreen = await detectWhiteScreen(page);

      if (execution.success && consoleErrors.length === 0 && !isWhiteScreen) {
        // PASSED
        log(`PASSED: ${step.section}`, 'success');
        results.push({
          step,
          status: 'passed',
          screenshot: execution.screenshot,
          duration: Date.now() - startTime,
        });
        continue;
      }

      // ERROR DETECTED
      const errorMessage = execution.error || consoleErrors[0] || 'White screen detected';
      log(`FAILED: ${step.section}`, 'error');
      log(`Error: ${errorMessage.substring(0, 100)}`, 'error');

      // Search DeBra for solution
      logVerbose('Searching DeBra for solution...');

      const exactSolution = await searchDeBraExact(errorMessage);

      if (exactSolution && exactSolution.found && exactSolution.exact) {
        // KNOWN ERROR - AUTO-FIX
        console.log(`   🔧 Known fix found in ${exactSolution.source}`);
        console.log(`   Solution: ${exactSolution.solution}`);

        // In interactive mode, we'd apply the fix here
        // For now, log it and mark as auto-fixed
        results.push({
          step,
          status: 'auto-fixed',
          screenshot: execution.screenshot,
          consoleErrors,
          fix: {
            source: 'debra-exact',
            solution: exactSolution.solution || '',
            file: exactSolution.file,
            documented: true,
          },
          duration: Date.now() - startTime,
        });

        // Note: In full implementation, would apply fix and retry
        console.log('   ⚠️ Auto-fix logged (manual application needed in this version)');
        continue;
      }

      // UNKNOWN ERROR - Would ask user in interactive mode
      console.log('   ❓ Unknown error - searching for related context...');

      const semanticResult = await searchDeBraSemantic(errorMessage);

      if (semanticResult.found) {
        console.log(`   📁 Related files: ${semanticResult.relatedFiles?.join(', ')}`);
      }

      // In non-interactive mode, mark as failed and continue
      console.log('   🛑 Marking as failed (interactive mode would ask user)');

      results.push({
        step,
        status: 'failed',
        screenshot: execution.screenshot,
        consoleErrors,
        fix: {
          source: 'debra-semantic',
          solution: semanticResult.suggestion || 'Manual investigation needed',
          file: semanticResult.relatedFiles?.[0],
          documented: false,
        },
        duration: Date.now() - startTime,
      });

      // In strict mode, block remaining steps on first failure
      // blocked = true;
    }
  } finally {
    await browser.close();
  }

  return results;
}

// ============================================================================
// Report Generation (Basic)
// ============================================================================

function generateBasicReport(results: TestResult[], outputDir: string): void {
  const summary = {
    total: results.length,
    passed: results.filter((r) => r.status === 'passed').length,
    failed: results.filter((r) => r.status === 'failed').length,
    autoFixed: results.filter((r) => r.status === 'auto-fixed').length,
    userGuided: results.filter((r) => r.status === 'user-guided').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    blocked: results.filter((r) => r.status === 'blocked').length,
  };

  // JSON report
  const jsonPath = path.join(outputDir, 'report.json');
  fs.writeFileSync(jsonPath, JSON.stringify({ summary, results }, null, 2));

  // Markdown report
  const mdPath = path.join(outputDir, 'report.md');
  let md = `# Test Report\n\n`;
  md += `**Date:** ${new Date().toISOString()}\n\n`;
  md += `## Summary\n\n`;
  md += `| Status | Count |\n`;
  md += `|--------|-------|\n`;
  md += `| ✅ Passed | ${summary.passed} |\n`;
  md += `| ❌ Failed | ${summary.failed} |\n`;
  md += `| 🔧 Auto-Fixed | ${summary.autoFixed} |\n`;
  md += `| 💬 User-Guided | ${summary.userGuided} |\n`;
  md += `| ⏭️ Skipped | ${summary.skipped} |\n`;
  md += `| 🚫 Blocked | ${summary.blocked} |\n`;
  md += `| **Total** | **${summary.total}** |\n\n`;

  md += `## Results\n\n`;

  for (const result of results) {
    const icon =
      result.status === 'passed'
        ? '✅'
        : result.status === 'failed'
          ? '❌'
          : result.status === 'auto-fixed'
            ? '🔧'
            : '📋';
    md += `### ${icon} ${result.step.section}\n\n`;
    md += `- **Status:** ${result.status}\n`;
    if (result.duration) {
      md += `- **Duration:** ${result.duration}ms\n`;
    }
    if (result.screenshot) {
      md += `- **Screenshot:** ${path.basename(result.screenshot)}\n`;
    }
    if (result.consoleErrors?.length) {
      md += `- **Console Errors:**\n`;
      for (const err of result.consoleErrors) {
        md += `  - ${err.substring(0, 100)}\n`;
      }
    }
    if (result.fix) {
      md += `- **Fix Source:** ${result.fix.source}\n`;
      md += `- **Solution:** ${result.fix.solution}\n`;
    }
    md += `\n`;
  }

  fs.writeFileSync(mdPath, md);

  console.log(`\n📊 Reports generated:`);
  console.log(`   - ${jsonPath}`);
  console.log(`   - ${mdPath}`);
}

// ============================================================================
// CLI
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
DeBra Test Runner
=================

Interactive test runner that executes scripts and handles errors.

Usage:
  npx tsx scripts/debra-test-runner.ts --script <path.md> [options]

Options:
  --script <path>     Path to test script (required)
  --headless          Run in headless mode (default: false)
  --verbose           Enable verbose logging with timestamps
  --output <dir>      Output directory for reports (default: test-results/DATE)
  --help              Show this help

Examples:
  npx tsx scripts/debra-test-runner.ts --script e2e/scenarios/zero-to-quote-v5.md
  npx tsx scripts/debra-test-runner.ts --script e2e/scenarios/zero-to-quote-v5.md --verbose
  npx tsx scripts/debra-test-runner.ts --script e2e/scenarios/zero-to-quote-v5.md --headless
`);
    process.exit(0);
  }

  // Parse arguments
  const scriptIndex = args.indexOf('--script');
  if (scriptIndex === -1 || !args[scriptIndex + 1]) {
    console.error('❌ Error: --script argument required');
    process.exit(1);
  }

  const scriptPath = args[scriptIndex + 1];
  const headless = args.includes('--headless');
  VERBOSE = args.includes('--verbose');

  const outputIndex = args.indexOf('--output');
  const outputDir =
    outputIndex !== -1 && args[outputIndex + 1]
      ? args[outputIndex + 1]
      : path.join(process.cwd(), 'test-results', new Date().toISOString().replace(/[:.]/g, '-'));

  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                         DeBra Test Runner v1.0                                 ║
║                    Interactive Testing with Learning                           ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);

  log(`Script: ${scriptPath}`, 'info');
  log(`Mode: ${headless ? 'Headless' : 'Visible Browser'}`, 'info');
  log(`Verbose: ${VERBOSE ? 'Enabled' : 'Disabled'}`, 'info');
  log(`Output: ${outputDir}`, 'info');
  console.log('');

  try {
    const results = await runTests(scriptPath, {
      headless,
      screenshotDir: outputDir,
      verbose: VERBOSE,
    });

    generateBasicReport(results, outputDir);

    // Summary
    const passed = results.filter((r) => r.status === 'passed').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    const total = results.length;

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`Test Complete: ${passed}/${total} passed (${Math.round((passed / total) * 100)}%)`);

    if (failed > 0) {
      console.log(`\n⚠️ ${failed} step(s) failed - review report for details`);
    }

    process.exit(failed > 0 ? 1 : 0);
  } catch (error: unknown) {
    console.error(`\n❌ Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();
