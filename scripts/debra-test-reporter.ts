/**
 * DeBra Test Reporter
 *
 * Generates comprehensive HTML and JSON reports from test results.
 * Part of the DeBra (Development Brain) Test Runner system.
 *
 * Usage:
 *   npx tsx scripts/debra-test-reporter.ts --input <results.json> --output <dir>
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types (same as runner)
// ============================================================================

interface TestStep {
  id: string;
  section: string;
  action: string;
  expected: string;
  selector?: string;
}

interface FixResult {
  source: string;
  solution: string;
  file?: string;
  documented?: boolean;
}

interface TestResult {
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

interface ReportData {
  summary: {
    total: number;
    passed: number;
    failed: number;
    autoFixed: number;
    userGuided: number;
    skipped: number;
    blocked: number;
  };
  results: TestResult[];
}

// ============================================================================
// HTML Generator
// ============================================================================

function generateHTML(data: ReportData, outputDir: string): string {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DeBra Test Report</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      line-height: 1.6;
      padding: 20px;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
    }
    header {
      background: linear-gradient(135deg, #238636, #1f6feb);
      padding: 30px;
      border-radius: 10px;
      margin-bottom: 30px;
    }
    h1 {
      color: white;
      font-size: 2em;
      margin-bottom: 10px;
    }
    .timestamp {
      color: rgba(255,255,255,0.8);
      font-size: 0.9em;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 10px;
      padding: 20px;
      text-align: center;
    }
    .stat-value {
      font-size: 2.5em;
      font-weight: bold;
    }
    .stat-label {
      color: #8b949e;
      font-size: 0.9em;
      margin-top: 5px;
    }
    .stat-passed .stat-value { color: #3fb950; }
    .stat-failed .stat-value { color: #f85149; }
    .stat-fixed .stat-value { color: #a371f7; }
    .stat-total .stat-value { color: #58a6ff; }

    .results {
      display: flex;
      flex-direction: column;
      gap: 15px;
    }
    .result-card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 10px;
      overflow: hidden;
    }
    .result-header {
      display: flex;
      align-items: center;
      gap: 15px;
      padding: 15px 20px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .result-header:hover {
      background: #1f2428;
    }
    .result-status {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.2em;
    }
    .status-passed { background: rgba(63, 185, 80, 0.2); }
    .status-failed { background: rgba(248, 81, 73, 0.2); }
    .status-auto-fixed { background: rgba(163, 113, 247, 0.2); }
    .status-user-guided { background: rgba(56, 139, 253, 0.2); }
    .status-skipped { background: rgba(139, 148, 158, 0.2); }
    .status-blocked { background: rgba(248, 81, 73, 0.3); }

    .result-info {
      flex: 1;
    }
    .result-title {
      font-weight: 600;
      color: #f0f6fc;
    }
    .result-meta {
      color: #8b949e;
      font-size: 0.85em;
    }
    .result-details {
      display: none;
      padding: 20px;
      border-top: 1px solid #30363d;
      background: #0d1117;
    }
    .result-details.active {
      display: block;
    }
    .detail-section {
      margin-bottom: 20px;
    }
    .detail-label {
      color: #8b949e;
      font-size: 0.85em;
      margin-bottom: 5px;
    }
    .detail-value {
      background: #161b22;
      padding: 10px 15px;
      border-radius: 6px;
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 0.9em;
      overflow-x: auto;
    }
    .error-list {
      list-style: none;
    }
    .error-list li {
      background: rgba(248, 81, 73, 0.1);
      border-left: 3px solid #f85149;
      padding: 10px 15px;
      margin-bottom: 5px;
      border-radius: 0 6px 6px 0;
    }
    .fix-info {
      background: rgba(163, 113, 247, 0.1);
      border-left: 3px solid #a371f7;
      padding: 15px;
      border-radius: 0 6px 6px 0;
    }
    .screenshot {
      max-width: 100%;
      border-radius: 8px;
      margin-top: 10px;
      border: 1px solid #30363d;
    }
    .progress-bar {
      height: 8px;
      background: #21262d;
      border-radius: 4px;
      overflow: hidden;
      margin-top: 20px;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #3fb950, #238636);
      transition: width 0.3s;
    }
    .filter-bar {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    .filter-btn {
      padding: 8px 16px;
      background: #21262d;
      border: 1px solid #30363d;
      border-radius: 20px;
      color: #c9d1d9;
      cursor: pointer;
      transition: all 0.2s;
    }
    .filter-btn:hover, .filter-btn.active {
      background: #30363d;
      border-color: #58a6ff;
    }
    @media (max-width: 768px) {
      .summary {
        grid-template-columns: repeat(2, 1fr);
      }
      .stat-value {
        font-size: 2em;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🧠 DeBra Test Report</h1>
      <p class="timestamp">Generated: ${new Date().toLocaleString()}</p>
    </header>

    <div class="summary">
      <div class="stat-card stat-total">
        <div class="stat-value">${data.summary.total}</div>
        <div class="stat-label">Total Steps</div>
      </div>
      <div class="stat-card stat-passed">
        <div class="stat-value">${data.summary.passed}</div>
        <div class="stat-label">✅ Passed</div>
      </div>
      <div class="stat-card stat-failed">
        <div class="stat-value">${data.summary.failed}</div>
        <div class="stat-label">❌ Failed</div>
      </div>
      <div class="stat-card stat-fixed">
        <div class="stat-value">${data.summary.autoFixed + data.summary.userGuided}</div>
        <div class="stat-label">🔧 Fixed</div>
      </div>
    </div>

    <div class="progress-bar">
      <div class="progress-fill" style="width: ${Math.round((data.summary.passed / data.summary.total) * 100)}%"></div>
    </div>
    <p style="text-align: center; margin: 10px 0 30px; color: #8b949e;">
      ${Math.round((data.summary.passed / data.summary.total) * 100)}% Pass Rate
    </p>

    <div class="filter-bar">
      <button class="filter-btn active" onclick="filterResults('all')">All</button>
      <button class="filter-btn" onclick="filterResults('passed')">✅ Passed</button>
      <button class="filter-btn" onclick="filterResults('failed')">❌ Failed</button>
      <button class="filter-btn" onclick="filterResults('auto-fixed')">🔧 Auto-Fixed</button>
    </div>

    <div class="results">
      ${data.results
        .map(
          (result, i) => `
        <div class="result-card" data-status="${result.status}">
          <div class="result-header" onclick="toggleDetails(${i})">
            <div class="result-status status-${result.status}">
              ${getStatusIcon(result.status)}
            </div>
            <div class="result-info">
              <div class="result-title">${result.step.id}: ${escapeHtml(result.step.section)}</div>
              <div class="result-meta">
                ${result.step.action} · ${result.duration ? `${result.duration}ms` : 'N/A'}
                ${result.fix ? ` · Fixed via ${result.fix.source}` : ''}
              </div>
            </div>
          </div>
          <div class="result-details" id="details-${i}">
            <div class="detail-section">
              <div class="detail-label">Expected</div>
              <div class="detail-value">${escapeHtml(result.step.expected)}</div>
            </div>
            ${
              result.step.selector
                ? `
            <div class="detail-section">
              <div class="detail-label">Selector</div>
              <div class="detail-value">${escapeHtml(result.step.selector)}</div>
            </div>
            `
                : ''
            }
            ${
              result.consoleErrors && result.consoleErrors.length > 0
                ? `
            <div class="detail-section">
              <div class="detail-label">Console Errors</div>
              <ul class="error-list">
                ${result.consoleErrors.map((err) => `<li>${escapeHtml(err.substring(0, 200))}</li>`).join('')}
              </ul>
            </div>
            `
                : ''
            }
            ${
              result.fix
                ? `
            <div class="detail-section">
              <div class="detail-label">Fix Applied</div>
              <div class="fix-info">
                <strong>Source:</strong> ${result.fix.source}<br>
                <strong>Solution:</strong> ${escapeHtml(result.fix.solution)}
                ${result.fix.file ? `<br><strong>File:</strong> ${result.fix.file}` : ''}
              </div>
            </div>
            `
                : ''
            }
            ${
              result.screenshot
                ? `
            <div class="detail-section">
              <div class="detail-label">Screenshot</div>
              <img class="screenshot" src="${path.basename(result.screenshot)}" alt="Screenshot" loading="lazy">
            </div>
            `
                : ''
            }
          </div>
        </div>
      `
        )
        .join('')}
    </div>
  </div>

  <script>
    function toggleDetails(index) {
      const details = document.getElementById('details-' + index);
      details.classList.toggle('active');
    }

    function filterResults(status) {
      document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
      event.target.classList.add('active');

      document.querySelectorAll('.result-card').forEach(card => {
        if (status === 'all' || card.dataset.status === status) {
          card.style.display = 'block';
        } else {
          card.style.display = 'none';
        }
      });
    }
  </script>
</body>
</html>`;

  const htmlPath = path.join(outputDir, 'report.html');
  fs.writeFileSync(htmlPath, html);
  return htmlPath;
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'passed':
      return '✅';
    case 'failed':
      return '❌';
    case 'auto-fixed':
      return '🔧';
    case 'user-guided':
      return '💬';
    case 'skipped':
      return '⏭️';
    case 'blocked':
      return '🚫';
    default:
      return '❓';
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================================
// Markdown Generator (for DeBra context)
// ============================================================================

function generateMarkdown(data: ReportData, outputDir: string): string {
  let md = `# DeBra Test Feedback

**Generated:** ${new Date().toISOString()}

## Summary

| Metric | Count |
|--------|-------|
| Total Steps | ${data.summary.total} |
| ✅ Passed | ${data.summary.passed} |
| ❌ Failed | ${data.summary.failed} |
| 🔧 Auto-Fixed | ${data.summary.autoFixed} |
| 💬 User-Guided | ${data.summary.userGuided} |
| Pass Rate | ${Math.round((data.summary.passed / data.summary.total) * 100)}% |

---

## Issues Found

`;

  const issues = data.results.filter((r) => r.status === 'failed' || r.status === 'auto-fixed');

  if (issues.length === 0) {
    md += '*No issues found - all tests passed!*\n';
  } else {
    for (const result of issues) {
      md += `### ${result.step.section}\n\n`;
      md += `**Status:** ${result.status}\n`;
      md += `**Step:** ${result.step.action}\n`;

      if (result.consoleErrors?.length) {
        md += `**Errors:**\n`;
        for (const err of result.consoleErrors) {
          md += `- \`${err.substring(0, 100)}\`\n`;
        }
      }

      if (result.fix) {
        md += `**Fix Applied:**\n`;
        md += `- Source: ${result.fix.source}\n`;
        md += `- Solution: ${result.fix.solution}\n`;
        if (result.fix.file) {
          md += `- File: ${result.fix.file}\n`;
        }
      }

      md += '\n---\n\n';
    }
  }

  md += `## Lessons Learned

*Add observations and lessons from this test run here.*

`;

  const feedbackDir = path.join(process.cwd(), 'e2e/scenarios/feedback');
  if (!fs.existsSync(feedbackDir)) {
    fs.mkdirSync(feedbackDir, { recursive: true });
  }

  const date = new Date().toISOString().split('T')[0];
  const mdPath = path.join(feedbackDir, `${date}-test-feedback.md`);
  fs.writeFileSync(mdPath, md);

  // Also write to output dir
  const outputMdPath = path.join(outputDir, 'feedback.md');
  fs.writeFileSync(outputMdPath, md);

  return mdPath;
}

// ============================================================================
// Main
// ============================================================================

export function generateReports(data: ReportData, outputDir: string): void {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const htmlPath = generateHTML(data, outputDir);
  const mdPath = generateMarkdown(data, outputDir);

  console.log(`📊 Reports generated:`);
  console.log(`   HTML: ${htmlPath}`);
  console.log(`   Feedback: ${mdPath}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
DeBra Test Reporter
===================

Generate comprehensive reports from test results.

Usage:
  npx tsx scripts/debra-test-reporter.ts --input <results.json> [--output <dir>]

Options:
  --input <path>     Path to report.json from test run
  --output <dir>     Output directory (default: same as input)
  --help             Show this help
`);
    process.exit(0);
  }

  const inputIndex = args.indexOf('--input');
  if (inputIndex === -1 || !args[inputIndex + 1]) {
    console.error('❌ Error: --input argument required');
    process.exit(1);
  }

  const inputPath = args[inputIndex + 1];
  const outputIndex = args.indexOf('--output');
  const outputDir = outputIndex !== -1 ? args[outputIndex + 1] : path.dirname(inputPath);

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const data: ReportData = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  generateReports(data, outputDir);
}

main();
