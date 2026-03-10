/**
 * DeBra Test Parser
 *
 * Parses markdown test scripts into executable TestStep objects.
 * Part of the DeBra (Development Brain) Test Runner system.
 *
 * Usage:
 *   npx tsx scripts/debra-test-parser.ts <script.md>
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// ============================================================================
// Types
// ============================================================================

export interface TestStep {
  id: string;
  section: string;
  action: 'navigate' | 'click' | 'fill' | 'verify' | 'dragOrSelect' | 'type' | 'keyboard' | 'manual';
  selector?: string;
  value?: string;
  fields?: Record<string, string>;
  expected: string;
  verify?: string;
  screenshot?: string;
  checks?: Record<string, string> | string[];
  pattern?: string;
  calculation?: boolean;
  dataValidation?: boolean;
  onElement?: string;
  then?: ThenAction[];
}

interface ThenAction {
  action: string;
  selector?: string;
  value?: string;
}

export interface TestConfig {
  baseUrl: string;
  timeout: number;
  screenshotOnStep: boolean;
  screenshotOnError: boolean;
  retryOnError: number;
}

export interface DataVerification {
  calculations: Array<{
    name: string;
    formula: string;
    tolerance: number;
  }>;
  formats: Array<{
    name: string;
    pattern: string;
    example: string;
  }>;
}

export interface ErrorHints {
  technicalErrors: string[];
  visualErrors: string[];
  dataErrors: string[];
  functionalErrors: string[];
}

export interface ParsedScript {
  title: string;
  domain: string;
  prerequisites: string;
  config: TestConfig;
  steps: TestStep[];
  dataVerification?: DataVerification;
  errorHints?: ErrorHints;
}

// ============================================================================
// Parser
// ============================================================================

/**
 * Parse a markdown test script into structured data
 */
export function parseTestScript(content: string): ParsedScript {
  const lines = content.split('\n');
  const result: ParsedScript = {
    title: '',
    domain: '',
    prerequisites: '',
    config: {
      baseUrl: '',
      timeout: 30000,
      screenshotOnStep: true,
      screenshotOnError: true,
      retryOnError: 3,
    },
    steps: [],
  };

  let currentSection = '';
  let currentStep: Partial<TestStep> | null = null;
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockContent: string[] = [];
  let stepCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Handle code blocks
    if (trimmed.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = trimmed.slice(3).trim();
        codeBlockContent = [];
      } else {
        inCodeBlock = false;
        // Process code block content
        if (codeBlockLang === 'yaml' && currentSection === 'config') {
          try {
            const parsed = yaml.load(codeBlockContent.join('\n')) as Partial<TestConfig>;
            result.config = { ...result.config, ...parsed };
          } catch {
            // Ignore YAML parse errors
          }
        } else if (codeBlockLang === 'yaml' && currentSection === 'dataVerification') {
          try {
            result.dataVerification = yaml.load(codeBlockContent.join('\n')) as DataVerification;
          } catch {
            // Ignore YAML parse errors
          }
        } else if (codeBlockLang === 'yaml' && currentSection === 'errorHints') {
          try {
            result.errorHints = yaml.load(codeBlockContent.join('\n')) as ErrorHints;
          } catch {
            // Ignore YAML parse errors
          }
        }
        codeBlockLang = '';
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Parse title
    if (trimmed.startsWith('# ') && !result.title) {
      result.title = trimmed.slice(2).trim();
      continue;
    }

    // Parse metadata
    if (trimmed.startsWith('**Domain:**')) {
      result.domain = trimmed.replace('**Domain:**', '').trim();
      continue;
    }
    if (trimmed.startsWith('**Prerequisites:**')) {
      result.prerequisites = trimmed.replace('**Prerequisites:**', '').trim();
      continue;
    }

    // Detect section headers
    if (trimmed.startsWith('## Test Configuration')) {
      currentSection = 'config';
      continue;
    }
    if (trimmed.startsWith('## Steps')) {
      currentSection = 'steps';
      continue;
    }
    if (trimmed.startsWith('## Data Verification')) {
      currentSection = 'dataVerification';
      continue;
    }
    if (trimmed.startsWith('## Error Detection')) {
      currentSection = 'errorHints';
      continue;
    }

    // Parse steps
    if (currentSection === 'steps') {
      // New step header: ### 1. Dashboard Overview or ### 0b. Enter Email
      const stepMatch = trimmed.match(/^### (\d+[a-z]?)\. (.+)$/);
      if (stepMatch) {
        // Save previous step
        if (currentStep && currentStep.expected) {
          result.steps.push(currentStep as TestStep);
        }

        stepCounter++;
        currentStep = {
          id: `step-${stepCounter}`,
          section: stepMatch[2].trim(),
          action: 'verify', // Default action
          expected: '',
        };
        continue;
      }

      // Parse step properties
      if (currentStep && trimmed.startsWith('- **')) {
        const propMatch = trimmed.match(/^- \*\*(\w+):\*\* (.+)$/);
        if (propMatch) {
          const [, key, value] = propMatch;
          const lowerKey = key.toLowerCase();

          switch (lowerKey) {
            case 'navigate':
              currentStep.action = 'navigate';
              currentStep.value = value;
              break;
            case 'action':
              currentStep.action = value.toLowerCase() as TestStep['action'];
              break;
            case 'selector':
              currentStep.selector = value;
              break;
            case 'value':
              currentStep.value = value;
              break;
            case 'expected':
              currentStep.expected = value;
              break;
            case 'verify':
              currentStep.verify = value;
              break;
            case 'screenshot':
              currentStep.screenshot = value;
              break;
            case 'pattern':
              currentStep.pattern = value;
              break;
            case 'onelement':
              currentStep.onElement = value;
              break;
            case 'calculation':
              currentStep.calculation = value.toLowerCase() === 'true';
              break;
            case 'datavalidation':
              currentStep.dataValidation = value.toLowerCase() === 'true';
              break;
          }
        }
      }

      // Parse fields block
      if (currentStep && trimmed.startsWith('- **fields:**')) {
        currentStep.fields = {};
        // Read subsequent indented lines
        for (let j = i + 1; j < lines.length; j++) {
          const fieldLine = lines[j].trim();
          if (!fieldLine.startsWith('- ') || fieldLine.startsWith('- **')) {
            break;
          }
          const fieldMatch = fieldLine.match(/^- (\w+): "?(.+?)"?$/);
          if (fieldMatch && currentStep.fields) {
            currentStep.fields[fieldMatch[1]] = fieldMatch[2].replace(/^"|"$/g, '');
          }
          i = j;
        }
        continue;
      }

      // Parse checks block
      if (currentStep && trimmed.startsWith('- **checks:**')) {
        currentStep.checks = {};
        for (let j = i + 1; j < lines.length; j++) {
          const checkLine = lines[j].trim();
          if (!checkLine.startsWith('- ') || checkLine.startsWith('- **')) {
            break;
          }
          const checkMatch = checkLine.match(/^- (.+?): (.+)$/);
          if (checkMatch && typeof currentStep.checks === 'object') {
            (currentStep.checks as Record<string, string>)[checkMatch[1]] = checkMatch[2];
          }
          i = j;
        }
        continue;
      }

      // Parse then actions
      if (currentStep && trimmed.startsWith('- **then:**')) {
        currentStep.then = currentStep.then || [];
        const thenAction = trimmed.replace('- **then:**', '').trim();
        if (thenAction) {
          currentStep.then.push({ action: thenAction });
        }
        continue;
      }
    }
  }

  // Save last step
  if (currentStep && currentStep.expected) {
    result.steps.push(currentStep as TestStep);
  }

  return result;
}

/**
 * Load and parse a test script from file
 */
export function loadTestScript(filePath: string): ParsedScript {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Test script not found: ${absolutePath}`);
  }

  const content = fs.readFileSync(absolutePath, 'utf-8');
  return parseTestScript(content);
}

/**
 * Validate a parsed script
 */
export function validateScript(script: ParsedScript): string[] {
  const errors: string[] = [];

  if (!script.title) {
    errors.push('Missing script title');
  }

  if (!script.config.baseUrl) {
    errors.push('Missing baseUrl in configuration');
  }

  if (script.steps.length === 0) {
    errors.push('No steps found in script');
  }

  for (const step of script.steps) {
    if (!step.expected) {
      errors.push(`Step "${step.section}" missing expected outcome`);
    }

    if (step.action === 'click' && !step.selector) {
      errors.push(`Step "${step.section}" is a click action but missing selector`);
    }

    if (step.action === 'fill' && !step.selector && !step.fields) {
      errors.push(`Step "${step.section}" is a fill action but missing selector or fields`);
    }
  }

  return errors;
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
DeBra Test Parser
=================

Usage: npx tsx scripts/debra-test-parser.ts <script.md> [--validate] [--json]

Options:
  --validate    Only validate the script, don't output parsed data
  --json        Output parsed script as JSON

Examples:
  npx tsx scripts/debra-test-parser.ts e2e/scenarios/zero-to-quote-v5.md
  npx tsx scripts/debra-test-parser.ts e2e/scenarios/zero-to-quote-v5.md --validate
  npx tsx scripts/debra-test-parser.ts e2e/scenarios/zero-to-quote-v5.md --json
`);
    process.exit(0);
  }

  const filePath = args[0];
  const validateOnly = args.includes('--validate');
  const outputJson = args.includes('--json');

  try {
    console.log(`\n📋 Parsing: ${filePath}\n`);

    const script = loadTestScript(filePath);

    console.log(`Title: ${script.title}`);
    console.log(`Domain: ${script.domain}`);
    console.log(`Steps: ${script.steps.length}`);
    console.log(`Base URL: ${script.config.baseUrl}`);
    console.log('');

    // Validate
    const errors = validateScript(script);

    if (errors.length > 0) {
      console.log('⚠️  Validation Warnings:');
      for (const error of errors) {
        console.log(`   - ${error}`);
      }
      console.log('');
    } else {
      console.log('✅ Script valid\n');
    }

    if (validateOnly) {
      process.exit(errors.length > 0 ? 1 : 0);
    }

    if (outputJson) {
      console.log(JSON.stringify(script, null, 2));
    } else {
      // Summary output
      console.log('Steps Summary:');
      console.log('─'.repeat(60));

      for (const step of script.steps) {
        const actionIcon =
          step.action === 'navigate'
            ? '🔗'
            : step.action === 'click'
              ? '👆'
              : step.action === 'fill'
                ? '✏️'
                : step.action === 'verify'
                  ? '✓'
                  : '📋';

        console.log(`${step.id.padEnd(10)} ${actionIcon} ${step.section}`);
        if (step.selector) {
          console.log(`           └─ selector: ${step.selector.substring(0, 50)}...`);
        }
      }
    }
  } catch (error: unknown) {
    console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Run if called directly (not when imported as module)
const isMainModule = import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;
if (isMainModule) {
  main();
}
