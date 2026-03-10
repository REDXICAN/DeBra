#!/usr/bin/env npx tsx

/**
 * DeBra - Smart Context Injector
 *
 * Automatically loads relevant context based on:
 * - Files being edited
 * - Keywords in prompts
 * - Error messages
 * - Domain detection
 *
 * Can run as:
 * - CLI: npm run brain:context "query"
 * - MCP Server: Integrated with Claude Code
 *
 * Usage:
 *   npm run brain:context "cart total bug"
 *   npm run brain:context --file "CartScreen.tsx"
 *   npm run brain:context --error "Cannot read property"
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  rulesDir: './.claude/rules',
  memoryDir: './.debra/memory',
  contextRulesPath: './.debra/context-rules.json',
  maxContextSize: 4000, // Max characters per context block
  verbose: process.argv.includes('--verbose') || process.argv.includes('-v'),
};

// ============================================================================
// TYPES
// ============================================================================

interface ContextRule {
  trigger: {
    type: 'file' | 'keyword' | 'error' | 'domain';
    pattern: string;
  };
  inject: {
    file: string;
    section?: string;
    priority: number;
  }[];
}

interface ContextResult {
  source: string;
  content: string;
  relevance: number;
  reason: string;
}

// ============================================================================
// DOMAIN MAPPING
// ============================================================================

const DOMAIN_MAP: Record<string, string[]> = {
  cart: ['Cart', 'cart', 'Room', 'room', 'item', 'quantity', 'markup'],
  quotes: ['Quote', 'quote', 'pricing', 'discount', 'total', 'subtotal'],
  clients: ['Client', 'client', 'Customer', 'customer', 'contact', 'validation'],
  email: ['Email', 'email', 'send', 'recipient', 'attachment', 'Resend'],
  products: ['Product', 'product', 'catalog', 'spec', 'image'],
  projects: ['Project', 'project', 'location'],
  auth: ['Auth', 'auth', 'Login', 'login', 'JWT', 'token', 'session'],
  admin: ['Admin', 'admin', 'User', 'user', 'role', 'permission'],
  home: ['Home', 'home', 'Dashboard', 'dashboard', 'KPI', 'stats'],
  'factory-orders': ['FactoryOrder', 'factory', 'OC', 'order-confirmation', 'OrderConfirmation', 'pedido'],
  account: ['Account', 'account', 'Profile', 'profile', 'MyAccount'],
};

const FILE_TO_DOMAIN: Record<string, string> = {
  'Cart': 'cart',
  'Quote': 'quotes',
  'Client': 'clients',
  'Customer': 'clients',
  'Email': 'email',
  'Product': 'products',
  'Project': 'projects',
  'Auth': 'auth',
  'Login': 'auth',
  'Admin': 'admin',
  'User': 'admin',
  'Home': 'home',
  'Dashboard': 'home',
  'FactoryOrder': 'factory-orders',
  'OrderConfirmation': 'factory-orders',
  'Account': 'account',
  'Profile': 'account',
};

// ============================================================================
// CONTEXT DETECTION
// ============================================================================

function detectDomainFromFile(filename: string): string | null {
  for (const [prefix, domain] of Object.entries(FILE_TO_DOMAIN)) {
    if (filename.includes(prefix)) {
      return domain;
    }
  }
  return null;
}

function detectDomainsFromText(text: string): string[] {
  const domains: Set<string> = new Set();

  for (const [domain, keywords] of Object.entries(DOMAIN_MAP)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        domains.add(domain);
        break;
      }
    }
  }

  return Array.from(domains);
}

function detectErrorType(text: string): string | null {
  const errorPatterns: Record<string, string> = {
    'Cannot read property': 'null-reference',
    'undefined is not': 'null-reference',
    'is not a function': 'type-error',
    'Type.*is not assignable': 'typescript',
    'Module not found': 'import',
    'Failed to fetch': 'api',
    '401': 'auth',
    '403': 'auth',
    '500': 'server',
  };

  for (const [pattern, errorType] of Object.entries(errorPatterns)) {
    if (new RegExp(pattern, 'i').test(text)) {
      return errorType;
    }
  }

  return null;
}

// ============================================================================
// CONTEXT LOADING
// ============================================================================

function loadFixFile(domain: string): string | null {
  const fixFile = path.join(CONFIG.rulesDir, `${domain}-fixes.md`);

  if (!fs.existsSync(fixFile)) {
    return null;
  }

  try {
    const content = fs.readFileSync(fixFile, 'utf-8');
    // Truncate if too long
    if (content.length > CONFIG.maxContextSize) {
      return content.slice(0, CONFIG.maxContextSize) + '\n\n[... truncated ...]';
    }
    return content;
  } catch {
    return null;
  }
}

function loadErrorSolutions(): string | null {
  const errorFile = path.join(CONFIG.rulesDir, 'error-solutions.md');

  if (!fs.existsSync(errorFile)) {
    return null;
  }

  try {
    return fs.readFileSync(errorFile, 'utf-8');
  } catch {
    return null;
  }
}

function loadMemoryFile(filename: string): string | null {
  const memoryFile = path.join(CONFIG.memoryDir, filename);

  if (!fs.existsSync(memoryFile)) {
    return null;
  }

  try {
    return fs.readFileSync(memoryFile, 'utf-8');
  } catch {
    return null;
  }
}

function extractRelevantSection(content: string, keywords: string[]): string {
  const lines = content.split('\n');
  const relevantLines: string[] = [];
  let inRelevantSection = false;
  let sectionDepth = 0;

  for (const line of lines) {
    // Check if this is a header
    const headerMatch = line.match(/^(#+)\s+(.+)/);

    if (headerMatch) {
      const depth = headerMatch[1].length;
      const title = headerMatch[2].toLowerCase();

      // Check if header contains any keyword
      const isRelevant = keywords.some(k => title.includes(k.toLowerCase()));

      if (isRelevant) {
        inRelevantSection = true;
        sectionDepth = depth;
        relevantLines.push(line);
      } else if (inRelevantSection && depth <= sectionDepth) {
        // Exiting relevant section
        inRelevantSection = false;
      } else if (inRelevantSection) {
        relevantLines.push(line);
      }
    } else if (inRelevantSection) {
      relevantLines.push(line);
    }
  }

  return relevantLines.join('\n');
}

// ============================================================================
// MAIN CONTEXT FUNCTION
// ============================================================================

interface GetContextOptions {
  query?: string;
  file?: string;
  error?: string;
  domains?: string[];
}

function getContext(options: GetContextOptions): ContextResult[] {
  const results: ContextResult[] = [];
  const detectedDomains: Set<string> = new Set(options.domains || []);

  // Detect domains from file
  if (options.file) {
    const domain = detectDomainFromFile(options.file);
    if (domain) {
      detectedDomains.add(domain);
    }
  }

  // Detect domains from query
  if (options.query) {
    const domains = detectDomainsFromText(options.query);
    domains.forEach(d => detectedDomains.add(d));
  }

  // Detect domains from error
  if (options.error) {
    const domains = detectDomainsFromText(options.error);
    domains.forEach(d => detectedDomains.add(d));
  }

  // Load fix files for detected domains
  for (const domain of detectedDomains) {
    const fixContent = loadFixFile(domain);
    if (fixContent) {
      results.push({
        source: `${domain}-fixes.md`,
        content: fixContent,
        relevance: 0.9,
        reason: `Domain "${domain}" detected`,
      });
    }
  }

  // Always include shared-fixes for cross-cutting concerns
  if (detectedDomains.size > 0) {
    const sharedContent = loadFixFile('shared');
    if (sharedContent) {
      results.push({
        source: 'shared-fixes.md',
        content: sharedContent,
        relevance: 0.7,
        reason: 'Cross-cutting patterns',
      });
    }
  }

  // Handle error context
  if (options.error) {
    const errorType = detectErrorType(options.error);
    const errorSolutions = loadErrorSolutions();

    if (errorSolutions) {
      // Extract relevant section based on error type
      const keywords = errorType ? [errorType, options.error.slice(0, 50)] : [options.error.slice(0, 50)];
      const relevantSection = extractRelevantSection(errorSolutions, keywords);

      if (relevantSection) {
        results.push({
          source: 'error-solutions.md',
          content: relevantSection || errorSolutions.slice(0, CONFIG.maxContextSize),
          relevance: 0.95,
          reason: `Error pattern detected: ${errorType || 'unknown'}`,
        });
      }
    }
  }

  // Load lessons for learning context
  const lessons = loadMemoryFile('lessons.md');
  if (lessons && options.query) {
    const relevantLessons = extractRelevantSection(lessons, options.query.split(' '));
    if (relevantLessons.length > 100) {
      results.push({
        source: 'lessons.md',
        content: relevantLessons,
        relevance: 0.6,
        reason: 'Related lessons found',
      });
    }
  }

  // Load ClaudeTeacher.md for teaching continuity (READ back into context)
  const teacherPath = './docs/ClaudeTeacher.md';
  if (fs.existsSync(teacherPath) && options.query) {
    try {
      const teacherContent = fs.readFileSync(teacherPath, 'utf-8');
      const relevantTeaching = extractRelevantSection(teacherContent, options.query.split(' '));
      if (relevantTeaching.length > 100) {
        results.push({
          source: 'ClaudeTeacher.md',
          content: relevantTeaching,
          relevance: 0.5,
          reason: 'Previous lessons for El Rojo on this topic',
        });
      }
    } catch {
      // Ignore if file can't be read
    }
  }

  // Sort by relevance
  results.sort((a, b) => b.relevance - a.relevance);

  return results;
}

// ============================================================================
// CLI OUTPUT
// ============================================================================

function formatCLIOutput(results: ContextResult[]): void {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                      🧠 DeBra - Smart Context Injector                        ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);

  if (results.length === 0) {
    console.log('No relevant context found.\n');
    return;
  }

  console.log(`Found ${results.length} relevant context sources:\n`);

  for (const result of results) {
    const relevancePercent = Math.round(result.relevance * 100);
    console.log(`${'─'.repeat(80)}`);
    console.log(`📄 ${result.source} (${relevancePercent}% relevant)`);
    console.log(`   Reason: ${result.reason}`);
    console.log();

    if (CONFIG.verbose) {
      // Show full content in verbose mode
      console.log(result.content);
    } else {
      // Show preview
      const preview = result.content.slice(0, 500);
      console.log(preview);
      if (result.content.length > 500) {
        console.log('\n   [... use --verbose to see full content ...]');
      }
    }
    console.log();
  }

  console.log(`${'═'.repeat(80)}`);
  console.log(`\nTotal context: ${results.reduce((sum, r) => sum + r.content.length, 0)} characters`);
}

// ============================================================================
// MCP SERVER MODE
// ============================================================================

function runMCPServer(): void {
  // Simple stdin/stdout JSON-RPC for MCP
  const readline = require('readline');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  // Send capabilities on start
  const capabilities = {
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      capabilities: {
        tools: {
          'debra-context': {
            description: 'Get relevant context for a query, file, or error',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search query or description' },
                file: { type: 'string', description: 'File being edited' },
                error: { type: 'string', description: 'Error message to look up' },
              },
            },
          },
        },
      },
    },
  };

  console.log(JSON.stringify(capabilities));

  rl.on('line', (line: string) => {
    try {
      const request = JSON.parse(line);

      if (request.method === 'tools/call' && request.params?.name === 'debra-context') {
        const args = request.params.arguments || {};
        const results = getContext({
          query: args.query,
          file: args.file,
          error: args.error,
        });

        const response = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            content: results.map(r => ({
              type: 'text',
              text: `## ${r.source}\n\n${r.content}`,
            })),
          },
        };

        console.log(JSON.stringify(response));
      }
    } catch (e) {
      // Ignore parse errors
    }
  });
}

// ============================================================================
// HOOK MODE - For PreToolUse Edit hook
// ============================================================================

interface HookInput {
  tool_name?: string;
  tool_input?: {
    file_path?: string;
    old_string?: string;
    new_string?: string;
  };
}

interface DoNotRule {
  domain: string;
  rule: string;
  section: string;
}

function extractDoNotRules(domain: string): DoNotRule[] {
  const fixFile = path.join(CONFIG.rulesDir, `${domain}-fixes.md`);
  if (!fs.existsSync(fixFile)) return [];

  const content = fs.readFileSync(fixFile, 'utf-8');
  const rules: DoNotRule[] = [];

  // Split into sections (## headers)
  const sections = content.split(/^## /gm);

  for (const section of sections) {
    if (!section.trim()) continue;

    const lines = section.split('\n');
    const sectionTitle = lines[0].trim();

    // Find all "DO NOT:" rules
    for (const line of lines) {
      const doNotMatch = line.match(/\*?\*?DO NOT:?\*?\*?\s*(.+)/i);
      if (doNotMatch) {
        const rule = doNotMatch[1].trim();
        // Filter out noise (empty rules, markdown artifacts, title fragments)
        if (rule.length > 5 &&
            !rule.startsWith('*') &&
            !rule.startsWith(':') &&
            !rule.match(/^RE-?FIX$/i) &&
            !rule.match(/^BREAK$/i)) {
          rules.push({
            domain,
            rule,
            section: sectionTitle
          });
        }
      }
    }
  }

  return rules;
}

function mapFileToDomainsFromPath(filePath: string): string[] {
  const domains: string[] = [];
  const normalizedPath = filePath.toLowerCase().replace(/\\/g, '/');

  // Check path patterns
  if (normalizedPath.includes('/cart') || normalizedPath.includes('cart')) {
    domains.push('cart');
  }
  if (normalizedPath.includes('/quote') || normalizedPath.includes('quote')) {
    domains.push('quotes');
  }
  if (normalizedPath.includes('/email') || normalizedPath.includes('email') || normalizedPath.includes('dialog')) {
    domains.push('email');
  }
  if (normalizedPath.includes('/client') || normalizedPath.includes('client') || normalizedPath.includes('customer')) {
    domains.push('clients');
  }
  if (normalizedPath.includes('/product') || normalizedPath.includes('product')) {
    domains.push('products');
  }
  if (normalizedPath.includes('/project') || normalizedPath.includes('project')) {
    domains.push('projects');
  }
  if (normalizedPath.includes('/admin') || normalizedPath.includes('admin')) {
    domains.push('admin');
  }
  if (normalizedPath.includes('/auth') || normalizedPath.includes('login')) {
    domains.push('auth');
  }
  if (normalizedPath.includes('/services/') || normalizedPath.includes('/types/') ||
      normalizedPath.includes('/utils/') || normalizedPath.includes('/components/')) {
    domains.push('shared');
  }
  if (normalizedPath.includes('/home') || normalizedPath.includes('dashboard')) {
    domains.push('home');
  }

  return domains;
}

interface CalledByInfo {
  callerName: string;
  callerFile: string;
  callerDomain: string;
  edgeType: string;
}

function findCalledBy(filePath: string): CalledByInfo[] {
  const nodesPath = './.debra/graph/nodes.json';
  const edgesPath = './.debra/graph/edges.json';

  if (!fs.existsSync(nodesPath) || !fs.existsSync(edgesPath)) {
    return [];
  }

  try {
    const nodes = JSON.parse(fs.readFileSync(nodesPath, 'utf-8'));
    const edges = JSON.parse(fs.readFileSync(edgesPath, 'utf-8'));

    // Normalize file path for matching
    const normalizedPath = path.normalize(filePath).toLowerCase();

    // Find all nodes in this file
    const fileNodes = nodes.filter((n: any) =>
      path.normalize(n.file).toLowerCase().includes(normalizedPath) ||
      normalizedPath.includes(path.normalize(n.file).toLowerCase())
    );

    const fileNodeIds = new Set(fileNodes.map((n: any) => n.id));

    // Find all incoming edges (other files that depend on this file)
    const calledBy: CalledByInfo[] = [];

    for (const edge of edges) {
      if (fileNodeIds.has(edge.to) && !fileNodeIds.has(edge.from)) {
        const callerNode = nodes.find((n: any) => n.id === edge.from);
        if (callerNode) {
          calledBy.push({
            callerName: callerNode.name,
            callerFile: callerNode.file,
            callerDomain: callerNode.domain,
            edgeType: edge.type,
          });
        }
      }
    }

    return calledBy;
  } catch {
    return [];
  }
}

function outputHookWarnings(filePath: string): void {
  // Map file to domains
  const domains = mapFileToDomainsFromPath(filePath);

  // Always include shared for common patterns
  if (!domains.includes('shared')) {
    domains.push('shared');
  }

  // Get all DO NOT rules
  const allRules: DoNotRule[] = [];
  for (const domain of domains) {
    allRules.push(...extractDoNotRules(domain));
  }

  // Get "called by" information from knowledge graph
  const calledBy = findCalledBy(filePath);

  // Output in a clear format
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('DEBRA CONTEXT FOR: ' + filePath);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('DOMAINS: ' + (domains.length > 0 ? domains.join(', ') : 'general'));
  console.log('');

  // Show "called by" warnings if there are dependencies
  if (calledBy.length > 0) {
    console.log(`USED BY ${calledBy.length} OTHER FILES:`);

    // Group by domain
    const byDomain: Record<string, CalledByInfo[]> = {};
    for (const cb of calledBy) {
      if (!byDomain[cb.callerDomain]) byDomain[cb.callerDomain] = [];
      byDomain[cb.callerDomain].push(cb);
    }

    for (const [domain, callers] of Object.entries(byDomain)) {
      console.log(`  [${domain.toUpperCase()}] (${callers.length} files):`);
      for (const caller of callers.slice(0, 3)) {
        console.log(`    • ${caller.callerName} (${caller.edgeType})`);
      }
      if (callers.length > 3) {
        console.log(`    ... and ${callers.length - 3} more`);
      }
    }

    if (calledBy.length >= 5) {
      console.log('');
      console.log('HIGH CONNECTIVITY: Changes may affect multiple domains!');
    }
    console.log('');
  }

  if (allRules.length === 0) {
    console.log('No specific DO NOT rules for this file.');
  } else {
    console.log(`RULES TO FOLLOW (${allRules.length} items):`);
    console.log('');

    // Group by domain
    const byDomain: Record<string, DoNotRule[]> = {};
    for (const r of allRules) {
      if (!byDomain[r.domain]) byDomain[r.domain] = [];
      byDomain[r.domain].push(r);
    }

    for (const [domain, rules] of Object.entries(byDomain)) {
      console.log(`[${domain.toUpperCase()}]`);
      for (const r of rules) {
        console.log(`  • DO NOT: ${r.rule}`);
      }
      console.log('');
    }
  }

  console.log('───────────────────────────────────────────────────────────────');
  console.log('Review rules above before editing.');
  console.log('');
}

async function runHookMode(): Promise<void> {
  // Read stdin for hook input
  let input = '';

  try {
    if (!process.stdin.isTTY) {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      input = Buffer.concat(chunks).toString('utf-8');
    }
  } catch {
    // No stdin available
  }

  let filePath: string | undefined;

  // Try to parse stdin as JSON (from Claude Code hook)
  if (input.trim()) {
    try {
      const hookInput: HookInput = JSON.parse(input);
      filePath = hookInput.tool_input?.file_path;
    } catch {
      // Not JSON, might be file path directly
      filePath = input.trim();
    }
  }

  // Fallback to CLI argument
  if (!filePath && process.argv[2] && !process.argv[2].startsWith('-')) {
    filePath = process.argv[2];
  }

  if (filePath) {
    outputHookWarnings(filePath);
  }

  // Always exit 0 (don't block edits)
  process.exit(0);
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter(a => !a.startsWith('-'));

  // Hook mode - when called from PreToolUse hook (detects stdin or --hook flag)
  if (process.argv.includes('--hook') || !process.stdin.isTTY) {
    await runHookMode();
    return;
  }

  // MCP Server mode
  if (process.argv.includes('--mcp')) {
    runMCPServer();
    return;
  }

  // Parse options
  const fileIndex = process.argv.indexOf('--file');
  const errorIndex = process.argv.indexOf('--error');

  const options: GetContextOptions = {
    query: args.join(' ') || undefined,
    file: fileIndex !== -1 ? process.argv[fileIndex + 1] : undefined,
    error: errorIndex !== -1 ? process.argv[errorIndex + 1] : undefined,
  };

  if (!options.query && !options.file && !options.error) {
    console.log(`
Usage:
  npm run brain:context "search query"
  npm run brain:context --file "CartScreen.tsx"
  npm run brain:context --error "Cannot read property 'trim'"
  npm run brain:context "cart total" --verbose
  npm run brain:context --hook  (PreToolUse hook mode)

Options:
  --verbose, -v   Show full context content
  --file <name>   Detect context from filename
  --error <msg>   Look up error solution
  --mcp           Run as MCP server
  --hook          Run as PreToolUse hook (reads stdin JSON)
`);
    return;
  }

  const results = getContext(options);
  formatCLIOutput(results);
}

main().catch(() => process.exit(0));
