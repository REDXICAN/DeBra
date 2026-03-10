#!/usr/bin/env npx tsx

/**
 * DeBra - Learning System
 *
 * Captures read AND edit patterns - learns from Claude's exploration and coding.
 *
 * Features:
 * - PostToolUse hooks: Records every file read AND edit with context
 * - Session tracking: Groups reads/edits into sessions
 * - Co-read detection: Files explored together suggest conceptual relationships
 * - Co-edit detection: Files edited together get stronger weighted edges
 * - Auto-rule generation: Repeated patterns become rules
 * - Exploration paths: Track investigation sequences
 *
 * Learning Philosophy:
 *   - Reading = Exploration (weaker signal, but shows what's related)
 *   - Editing = Action (stronger signal, confirms relationships)
 *   - Combined = Full developer brain activity
 *
 * Usage:
 *   npm run brain:learn                    # Show learning stats
 *   npm run brain:learn session            # Show current session
 *   npm run brain:learn rules              # Show auto-generated rules
 *   npm run brain:learn weights            # Show edge weights
 *   npm run brain:learn reads              # Show read patterns
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  debraDir: './.debra',
  memoryDir: './.debra/memory',
  sessionsDir: './.debra/memory/sessions',
  learningDir: './.debra/learning',
  graphDir: './.debra/graph',

  // Learning thresholds
  coEditThreshold: 3,           // Edits together before strengthening edge
  coReadThreshold: 2,           // Reads together before noting relationship (lower - reading is exploratory)
  ruleGenerationThreshold: 3,   // Same pattern before suggesting rule
  sessionTimeoutMinutes: 30,    // Minutes before new session starts

  // Weights (edit > read since edits are stronger signals)
  coEditWeight: 0.5,            // Added to edge weight per co-edit
  coReadWeight: 0.2,            // Added to edge weight per co-read (weaker signal)
  maxEdgeWeight: 10.0,          // Maximum edge weight
};

// ============================================================================
// TYPES
// ============================================================================

interface EditRecord {
  timestamp: string;
  file: string;
  domain: string;
  changeType: 'add' | 'modify' | 'delete';
  linesChanged: number;
  context: string;  // Brief description of what was changed
}

interface ReadRecord {
  timestamp: string;
  file: string;
  domain: string;
  linesRead: number;
  context: string;  // Why this file was read (investigation, understanding, etc.)
}

interface Session {
  id: string;
  startTime: string;
  lastActivityTime: string;  // Renamed from lastEditTime - tracks both reads and edits
  // Edit tracking
  edits: EditRecord[];
  filesEdited: string[];
  coEditPairs: CoEditPair[];
  // Read tracking (new)
  reads: ReadRecord[];
  filesRead: string[];
  coReadPairs: CoReadPair[];
  // Exploration paths (sequence of reads showing investigation flow)
  explorationPath: string[];
  // Combined
  domains: string[];
}

interface CoEditPair {
  fileA: string;
  fileB: string;
  count: number;
  domains: string[];
}

interface CoReadPair {
  fileA: string;
  fileB: string;
  count: number;
  domains: string[];
  firstReadTogether: string;  // Timestamp of first co-read
}

interface EdgeWeight {
  from: string;
  to: string;
  weight: number;
  coEditCount: number;
  lastUpdated: string;
}

interface AutoRule {
  id: string;
  pattern: string;
  description: string;
  domain: string;
  confidence: number;
  occurrences: number;
  createdAt: string;
  files: string[];
}

interface LearningStats {
  totalSessions: number;
  totalEdits: number;
  totalReads: number;
  uniqueFilesEdited: number;
  uniqueFilesRead: number;
  autoRules: number;
  weightedEdges: number;
  lastSession: string;
}

// Domain mapping (matches debra-index.ts)
const DOMAINS: Record<string, string[]> = {
  auth: ['auth', 'login', 'session', 'AuthGuard'],
  home: ['home', 'HomeScreen', 'dashboard', 'KPI'],
  products: ['products', 'catalog', 'ProductCard', 'SpecSheet'],
  cart: ['cart', 'CartScreen', 'CartItem'],
  quotes: ['quotes', 'QuoteDetail', 'QuoteEmail'],
  email: ['email', 'EmailDialog', 'BulkSend', 'Resend'],
  customers: ['clients', 'customers', 'ClientDetail', 'CustomerCard'],
  projects: ['projects', 'ProjectDetail'],
  oc: ['order-confirmation', 'OrderConfirmation', 'OC'],
  admin: ['admin', 'AdminDashboard'],
  users: ['users', 'UserCard', 'UserDetails'],
  ui: ['components', 'theme', 'styles', 'Button', 'Card'],
  backend: ['api', 'service', 'controller', 'routes'],
};

// ============================================================================
// UTILITIES
// ============================================================================

function log(msg: string, level: 'info' | 'success' | 'warn' | 'error' | 'learn' = 'info') {
  const icons = { info: '🔵', success: '✅', warn: '⚠️', error: '❌', learn: '🧠' };
  console.log(`${icons[level]} ${msg}`);
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function detectDomain(filePath: string): string {
  const lowerPath = filePath.toLowerCase();
  for (const [domain, patterns] of Object.entries(DOMAINS)) {
    if (patterns.some(p => lowerPath.includes(p.toLowerCase()))) {
      return domain;
    }
  }
  return 'other';
}

function getSessionId(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}`;
}

function getSessionPath(sessionId: string): string {
  return path.join(CONFIG.sessionsDir, `${sessionId}.json`);
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

function loadOrCreateSession(): Session {
  ensureDir(CONFIG.sessionsDir);

  const sessionId = getSessionId();
  const sessionPath = getSessionPath(sessionId);

  // Check for existing session
  if (fs.existsSync(sessionPath)) {
    const session: Session = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));

    // Migrate old sessions that don't have read tracking
    if (!session.reads) {
      session.reads = [];
      session.filesRead = [];
      session.coReadPairs = [];
      session.explorationPath = [];
    }
    if (!session.lastActivityTime) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      session.lastActivityTime = (session as any).lastEditTime || new Date().toISOString();
    }

    // Check if session timed out
    const lastActivity = new Date(session.lastActivityTime);
    const now = new Date();
    const minutesSinceLastActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60);

    if (minutesSinceLastActivity < CONFIG.sessionTimeoutMinutes) {
      return session;
    }
  }

  // Create new session
  const newSession: Session = {
    id: sessionId,
    startTime: new Date().toISOString(),
    lastActivityTime: new Date().toISOString(),
    // Edit tracking
    edits: [],
    filesEdited: [],
    coEditPairs: [],
    // Read tracking
    reads: [],
    filesRead: [],
    coReadPairs: [],
    explorationPath: [],
    // Combined
    domains: [],
  };

  return newSession;
}

function saveSession(session: Session) {
  ensureDir(CONFIG.sessionsDir);
  const sessionPath = getSessionPath(session.id);
  fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
}

// ============================================================================
// EDIT RECORDING (PostToolUse Hook)
// ============================================================================

function recordEdit(
  filePath: string,
  context: string = '',
  linesChanged: number = 0
): void {
  const session = loadOrCreateSession();
  const normalizedPath = path.normalize(filePath).replace(/\\/g, '/');
  const domain = detectDomain(normalizedPath);

  // Create edit record
  const edit: EditRecord = {
    timestamp: new Date().toISOString(),
    file: normalizedPath,
    domain,
    changeType: 'modify',
    linesChanged,
    context: context || `Edit to ${path.basename(filePath)}`,
  };

  session.edits.push(edit);
  session.lastActivityTime = edit.timestamp;

  // Track unique files
  if (!session.filesEdited.includes(normalizedPath)) {
    session.filesEdited.push(normalizedPath);
  }

  // Track domains
  if (!session.domains.includes(domain)) {
    session.domains.push(domain);
  }

  // Update co-edit pairs (files edited in same session)
  updateCoEditPairs(session, normalizedPath);

  // Save session
  saveSession(session);

  // Output for hook feedback
  console.log(`DEBRA LEARN: Recorded edit to ${normalizedPath} [${domain}]`);

  // Check for patterns
  checkPatterns(session);
}

// ============================================================================
// READ RECORDING (PostToolUse Hook for Read tool)
// ============================================================================

function recordRead(
  filePath: string,
  context: string = '',
  linesRead: number = 0
): void {
  const session = loadOrCreateSession();
  const normalizedPath = path.normalize(filePath).replace(/\\/g, '/');
  const domain = detectDomain(normalizedPath);

  // Skip non-source files (node_modules, etc.)
  if (normalizedPath.includes('node_modules') ||
      normalizedPath.includes('.git') ||
      normalizedPath.endsWith('.lock') ||
      normalizedPath.endsWith('.log')) {
    return;
  }

  // Create read record
  const read: ReadRecord = {
    timestamp: new Date().toISOString(),
    file: normalizedPath,
    domain,
    linesRead,
    context: context || `Read ${path.basename(filePath)}`,
  };

  session.reads.push(read);
  session.lastActivityTime = read.timestamp;

  // Track unique files read
  if (!session.filesRead.includes(normalizedPath)) {
    session.filesRead.push(normalizedPath);
    // Add to exploration path (sequence of unique file reads)
    session.explorationPath.push(normalizedPath);
  }

  // Track domains
  if (!session.domains.includes(domain)) {
    session.domains.push(domain);
  }

  // Update co-read pairs (files read together suggest conceptual relationship)
  updateCoReadPairs(session, normalizedPath);

  // Save session
  saveSession(session);

  // Output for hook feedback (shorter than edit to reduce noise)
  console.log(`DEBRA: Read ${path.basename(normalizedPath)} [${domain}]`);

  // Check for read patterns
  checkReadPatterns(session);
}

function updateCoReadPairs(session: Session, newFile: string) {
  // For each previously read file, create/update co-read pair
  // Only consider recent reads (last 10) to avoid noise
  const recentReads = session.filesRead.slice(-10);

  for (const existingFile of recentReads) {
    if (existingFile === newFile) continue;

    // Sort files alphabetically for consistent pair ID
    const [fileA, fileB] = [existingFile, newFile].sort();

    // Find existing pair or create new
    let pair = session.coReadPairs.find(
      p => p.fileA === fileA && p.fileB === fileB
    );

    if (!pair) {
      pair = {
        fileA,
        fileB,
        count: 0,
        domains: [],
        firstReadTogether: new Date().toISOString(),
      };
      session.coReadPairs.push(pair);
    }

    pair.count++;

    const domainA = detectDomain(fileA);
    const domainB = detectDomain(fileB);
    if (!pair.domains.includes(domainA)) pair.domains.push(domainA);
    if (!pair.domains.includes(domainB)) pair.domains.push(domainB);
  }
}

function checkReadPatterns(session: Session) {
  // Check for repeated co-reads
  for (const pair of session.coReadPairs) {
    if (pair.count >= CONFIG.coReadThreshold) {
      // Don't log every time, only when threshold first crossed
      if (pair.count === CONFIG.coReadThreshold) {
        log(`Read pattern: ${path.basename(pair.fileA)} <-> ${path.basename(pair.fileB)} explored together`, 'learn');
      }
      updateReadEdgeWeight(pair.fileA, pair.fileB);
    }
  }
}

function updateReadEdgeWeight(fileA: string, fileB: string) {
  ensureDir(CONFIG.learningDir);
  const weightsPath = path.join(CONFIG.learningDir, 'edge-weights.json');

  // Load existing weights
  let weights: EdgeWeight[] = [];
  if (fs.existsSync(weightsPath)) {
    weights = JSON.parse(fs.readFileSync(weightsPath, 'utf-8'));
  }

  // Find or create weight entry
  const [from, to] = [fileA, fileB].sort();
  let edge = weights.find(w => w.from === from && w.to === to);

  if (!edge) {
    edge = {
      from,
      to,
      weight: 0.5,  // Start lower than edit-created edges
      coEditCount: 0,
      lastUpdated: new Date().toISOString(),
    };
    weights.push(edge);
  }

  // Increment weight (smaller increment for reads)
  edge.weight = Math.min(CONFIG.maxEdgeWeight, edge.weight + CONFIG.coReadWeight);
  edge.lastUpdated = new Date().toISOString();

  fs.writeFileSync(weightsPath, JSON.stringify(weights, null, 2));

  // Also update the main graph edges
  updateGraphEdge(from, to, edge.weight);
}

function updateCoEditPairs(session: Session, newFile: string) {
  // For each previously edited file, create/update co-edit pair
  for (const existingFile of session.filesEdited) {
    if (existingFile === newFile) continue;

    // Sort files alphabetically for consistent pair ID
    const [fileA, fileB] = [existingFile, newFile].sort();

    // Find existing pair or create new
    let pair = session.coEditPairs.find(
      p => p.fileA === fileA && p.fileB === fileB
    );

    if (!pair) {
      pair = {
        fileA,
        fileB,
        count: 0,
        domains: [],
      };
      session.coEditPairs.push(pair);
    }

    pair.count++;

    const domainA = detectDomain(fileA);
    const domainB = detectDomain(fileB);
    if (!pair.domains.includes(domainA)) pair.domains.push(domainA);
    if (!pair.domains.includes(domainB)) pair.domains.push(domainB);
  }
}

// ============================================================================
// PATTERN DETECTION & AUTO-RULES
// ============================================================================

function checkPatterns(session: Session) {
  // Check for repeated co-edits
  for (const pair of session.coEditPairs) {
    if (pair.count >= CONFIG.coEditThreshold) {
      log(`Pattern detected: ${path.basename(pair.fileA)} <-> ${path.basename(pair.fileB)} edited together ${pair.count} times`, 'learn');
      updateEdgeWeight(pair.fileA, pair.fileB);
    }
  }

  // Check for domain-specific patterns
  const domainEditCounts: Record<string, number> = {};
  for (const edit of session.edits) {
    domainEditCounts[edit.domain] = (domainEditCounts[edit.domain] || 0) + 1;
  }

  for (const [domain, count] of Object.entries(domainEditCounts)) {
    if (count >= CONFIG.ruleGenerationThreshold) {
      suggestAutoRule(session, domain);
    }
  }
}

function suggestAutoRule(session: Session, domain: string) {
  ensureDir(CONFIG.learningDir);
  const rulesPath = path.join(CONFIG.learningDir, 'auto-rules.json');

  // Load existing rules
  let rules: AutoRule[] = [];
  if (fs.existsSync(rulesPath)) {
    rules = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
  }

  // Check if rule already exists for this pattern
  const domainFiles = session.edits
    .filter(e => e.domain === domain)
    .map(e => e.file);

  const patternKey = domainFiles.sort().join(',');
  const existingRule = rules.find(r => r.pattern === patternKey);

  if (existingRule) {
    existingRule.occurrences++;
    existingRule.confidence = Math.min(1.0, existingRule.occurrences / 10);
    log(`Updated rule confidence: ${existingRule.description} (${(existingRule.confidence * 100).toFixed(0)}%)`, 'learn');
  } else {
    // Create new rule suggestion
    const newRule: AutoRule = {
      id: `rule-${Date.now()}`,
      pattern: patternKey,
      description: `Files in ${domain} domain are frequently edited together`,
      domain,
      confidence: 0.3,
      occurrences: 1,
      createdAt: new Date().toISOString(),
      files: domainFiles,
    };
    rules.push(newRule);
    log(`New pattern learned: ${newRule.description}`, 'learn');
  }

  fs.writeFileSync(rulesPath, JSON.stringify(rules, null, 2));
}

// ============================================================================
// EDGE WEIGHT MANAGEMENT
// ============================================================================

function updateEdgeWeight(fileA: string, fileB: string) {
  ensureDir(CONFIG.learningDir);
  const weightsPath = path.join(CONFIG.learningDir, 'edge-weights.json');

  // Load existing weights
  let weights: EdgeWeight[] = [];
  if (fs.existsSync(weightsPath)) {
    weights = JSON.parse(fs.readFileSync(weightsPath, 'utf-8'));
  }

  // Find or create weight entry
  const [from, to] = [fileA, fileB].sort();
  let edge = weights.find(w => w.from === from && w.to === to);

  if (!edge) {
    edge = {
      from,
      to,
      weight: 1.0,
      coEditCount: 0,
      lastUpdated: new Date().toISOString(),
    };
    weights.push(edge);
  }

  // Increment weight
  edge.coEditCount++;
  edge.weight = Math.min(CONFIG.maxEdgeWeight, edge.weight + CONFIG.coEditWeight);
  edge.lastUpdated = new Date().toISOString();

  fs.writeFileSync(weightsPath, JSON.stringify(weights, null, 2));

  // Also update the main graph edges
  updateGraphEdge(from, to, edge.weight);
}

function updateGraphEdge(fileA: string, fileB: string, weight: number) {
  const edgesPath = path.join(CONFIG.graphDir, 'edges.json');
  if (!fs.existsSync(edgesPath)) return;

  try {
    const edges = JSON.parse(fs.readFileSync(edgesPath, 'utf-8'));

    // Find edges between these files and update their metadata
    for (const edge of edges) {
      if ((edge.from.includes(fileA) && edge.to.includes(fileB)) ||
          (edge.from.includes(fileB) && edge.to.includes(fileA))) {
        edge.learnedWeight = weight;
        edge.coEditScore = weight;
      }
    }

    fs.writeFileSync(edgesPath, JSON.stringify(edges, null, 2));
  } catch {
    // Graph file may not exist or be corrupted
  }
}

// ============================================================================
// LEARNING STATS
// ============================================================================

function getStats(): LearningStats {
  ensureDir(CONFIG.sessionsDir);
  ensureDir(CONFIG.learningDir);

  // Count sessions
  const sessionFiles = fs.existsSync(CONFIG.sessionsDir)
    ? fs.readdirSync(CONFIG.sessionsDir).filter(f => f.endsWith('.json'))
    : [];

  // Count total edits/reads and unique files
  let totalEdits = 0;
  let totalReads = 0;
  const uniqueFilesEdited = new Set<string>();
  const uniqueFilesRead = new Set<string>();
  let lastSession = 'none';

  for (const sessionFile of sessionFiles) {
    const sessionPath = path.join(CONFIG.sessionsDir, sessionFile);
    try {
      const session: Session = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
      totalEdits += session.edits.length;
      totalReads += (session.reads || []).length;
      session.filesEdited.forEach(f => uniqueFilesEdited.add(f));
      (session.filesRead || []).forEach(f => uniqueFilesRead.add(f));
      lastSession = session.id;
    } catch {
      // Skip corrupted sessions
    }
  }

  // Count auto-rules
  const rulesPath = path.join(CONFIG.learningDir, 'auto-rules.json');
  let autoRules = 0;
  if (fs.existsSync(rulesPath)) {
    autoRules = JSON.parse(fs.readFileSync(rulesPath, 'utf-8')).length;
  }

  // Count weighted edges
  const weightsPath = path.join(CONFIG.learningDir, 'edge-weights.json');
  let weightedEdges = 0;
  if (fs.existsSync(weightsPath)) {
    weightedEdges = JSON.parse(fs.readFileSync(weightsPath, 'utf-8')).length;
  }

  return {
    totalSessions: sessionFiles.length,
    totalEdits,
    totalReads,
    uniqueFilesEdited: uniqueFilesEdited.size,
    uniqueFilesRead: uniqueFilesRead.size,
    autoRules,
    weightedEdges,
    lastSession,
  };
}

function showCurrentSession() {
  const session = loadOrCreateSession();

  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                         🧠 CURRENT LEARNING SESSION                           ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║   Session ID:    ${session.id.padEnd(54)}║
║   Started:       ${session.startTime.padEnd(54)}║
║   Last Activity: ${session.lastActivityTime.padEnd(54)}║
║                                                                               ║
║   📖 Reads:      ${String(session.reads.length).padEnd(54)}║
║   ✏️  Edits:      ${String(session.edits.length).padEnd(54)}║
║   📁 Files Read: ${String(session.filesRead.length).padEnd(54)}║
║   📝 Files Edit: ${String(session.filesEdited.length).padEnd(54)}║
║   🏷️  Domains:    ${session.domains.join(', ').padEnd(54).slice(0, 54)}║
║   🔗 Co-Read:    ${String(session.coReadPairs.length).padEnd(54)}║
║   🔗 Co-Edit:    ${String(session.coEditPairs.length).padEnd(54)}║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);

  // Show exploration path (unique file reads in order)
  if (session.explorationPath && session.explorationPath.length > 0) {
    console.log('📍 Exploration Path (investigation flow):');
    const recentPath = session.explorationPath.slice(-8);
    console.log(`   ${recentPath.map(f => path.basename(f)).join(' → ')}`);
  }

  // Show recent reads
  if (session.reads.length > 0) {
    console.log('\n📖 Recent Reads:');
    for (const read of session.reads.slice(-5)) {
      console.log(`   ${new Date(read.timestamp).toLocaleTimeString()} [${read.domain}] ${path.basename(read.file)}`);
    }
  }

  // Show recent edits
  if (session.edits.length > 0) {
    console.log('\n✏️  Recent Edits:');
    for (const edit of session.edits.slice(-5)) {
      console.log(`   ${new Date(edit.timestamp).toLocaleTimeString()} [${edit.domain}] ${path.basename(edit.file)}`);
    }
  }

  // Show co-read patterns
  if (session.coReadPairs.length > 0) {
    const significantCoReads = session.coReadPairs.filter(p => p.count >= 2);
    if (significantCoReads.length > 0) {
      console.log('\n🔗 Co-Read Patterns (files explored together):');
      for (const pair of significantCoReads.slice(0, 5)) {
        console.log(`   ${path.basename(pair.fileA)} <-> ${path.basename(pair.fileB)} (${pair.count}x)`);
      }
    }
  }

  // Show co-edit patterns
  if (session.coEditPairs.length > 0) {
    const significantCoEdits = session.coEditPairs.filter(p => p.count >= 2);
    if (significantCoEdits.length > 0) {
      console.log('\n🔗 Co-Edit Patterns (files modified together):');
      for (const pair of significantCoEdits.slice(0, 5)) {
        console.log(`   ${path.basename(pair.fileA)} <-> ${path.basename(pair.fileB)} (${pair.count}x)`);
      }
    }
  }
}

function showAutoRules() {
  const rulesPath = path.join(CONFIG.learningDir, 'auto-rules.json');

  if (!fs.existsSync(rulesPath)) {
    log('No auto-generated rules yet. Keep coding!', 'info');
    return;
  }

  const rules: AutoRule[] = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));

  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                          🧠 AUTO-GENERATED RULES                              ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);

  for (const rule of rules.sort((a, b) => b.confidence - a.confidence)) {
    console.log(`  [${(rule.confidence * 100).toFixed(0)}%] ${rule.description}`);
    console.log(`       Domain: ${rule.domain} | Occurrences: ${rule.occurrences}`);
    console.log(`       Files: ${rule.files.map(f => path.basename(f)).join(', ')}`);
    console.log();
  }
}

function showEdgeWeights() {
  const weightsPath = path.join(CONFIG.learningDir, 'edge-weights.json');

  if (!fs.existsSync(weightsPath)) {
    log('No weighted edges yet. Keep coding!', 'info');
    return;
  }

  const weights: EdgeWeight[] = JSON.parse(fs.readFileSync(weightsPath, 'utf-8'));

  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                          🧠 LEARNED EDGE WEIGHTS                              ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);

  for (const edge of weights.sort((a, b) => b.weight - a.weight).slice(0, 20)) {
    const bar = '█'.repeat(Math.round(edge.weight));
    console.log(`  ${bar.padEnd(10)} ${path.basename(edge.from)} <-> ${path.basename(edge.to)}`);
    console.log(`             Weight: ${edge.weight.toFixed(1)} | Co-edits: ${edge.coEditCount}`);
  }
}

function showStats() {
  const stats = getStats();

  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                          🧠 DEBRA LEARNING STATS                              ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║   Total Sessions:      ${String(stats.totalSessions).padEnd(50)}║
║   📖 Total Reads:      ${String(stats.totalReads).padEnd(50)}║
║   ✏️  Total Edits:      ${String(stats.totalEdits).padEnd(50)}║
║   📁 Unique Files Read: ${String(stats.uniqueFilesRead).padEnd(49)}║
║   📝 Unique Files Edit: ${String(stats.uniqueFilesEdited).padEnd(49)}║
║   🤖 Auto Rules:        ${String(stats.autoRules).padEnd(49)}║
║   🔗 Weighted Edges:    ${String(stats.weightedEdges).padEnd(49)}║
║   ⏰ Last Session:      ${stats.lastSession.padEnd(49)}║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝

📖 Reading = Exploration (weaker signal, shows what's related)
✏️  Editing = Action (stronger signal, confirms relationships)

Commands:
  npm run brain:learn              Show stats
  npm run brain:learn session      Show current session
  npm run brain:learn rules        Show auto-generated rules
  npm run brain:learn weights      Show learned edge weights
  npm run brain:learn reads        Show read patterns
`);
}

function showReadPatterns() {
  const session = loadOrCreateSession();

  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                          📖 DEBRA READ PATTERNS                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);

  // Show exploration path
  if (session.explorationPath && session.explorationPath.length > 0) {
    console.log('📍 Exploration Path (how you navigated the codebase):');
    console.log('');
    for (let i = 0; i < session.explorationPath.length; i++) {
      const file = session.explorationPath[i];
      const domain = detectDomain(file);
      const indent = '   ';
      const arrow = i < session.explorationPath.length - 1 ? '↓' : '●';
      console.log(`${indent}${arrow} [${domain}] ${path.basename(file)}`);
    }
    console.log('');
  }

  // Show domain distribution of reads
  const domainCounts: Record<string, number> = {};
  for (const read of session.reads) {
    domainCounts[read.domain] = (domainCounts[read.domain] || 0) + 1;
  }

  if (Object.keys(domainCounts).length > 0) {
    console.log('📊 Read Distribution by Domain:');
    const sortedDomains = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]);
    for (const [domain, count] of sortedDomains) {
      const bar = '█'.repeat(Math.min(30, Math.round(count / 2)));
      console.log(`   ${domain.padEnd(12)} ${bar} ${count}`);
    }
    console.log('');
  }

  // Show co-read clusters (files frequently read together)
  if (session.coReadPairs.length > 0) {
    console.log('🔗 Co-Read Clusters (files that belong together conceptually):');
    const sorted = session.coReadPairs.sort((a, b) => b.count - a.count);
    for (const pair of sorted.slice(0, 10)) {
      console.log(`   ${path.basename(pair.fileA)}`);
      console.log(`     ↔ ${path.basename(pair.fileB)} (${pair.count}x together)`);
    }
  }
}

// ============================================================================
// HOOK MODE - For PostToolUse Edit/Write hooks
// ============================================================================

interface HookInput {
  tool_name?: string;
  tool_input?: {
    file_path?: string;
    old_string?: string;
    new_string?: string;
    content?: string;
    limit?: number;
    offset?: number;
  };
  tool_response?: {
    success?: boolean;
    content?: string;
  };
}

async function runHookMode(): Promise<void> {
  // Debug log to track hook execution
  const debugLogPath = path.join(CONFIG.debraDir, 'hook-debug.log');
  const debugLog = (msg: string) => {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(debugLogPath, `[${timestamp}] ${msg}\n`);
  };

  debugLog('Hook triggered (event-based stdin)');
  debugLog(`process.argv: ${JSON.stringify(process.argv)}`);
  debugLog(`stdin.isTTY: ${process.stdin.isTTY}`);

  // Use event-based stdin reading (recommended by Claude Code docs)
  return new Promise((resolve) => {
    let input = '';

    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (chunk: string) => {
      input += chunk;
      debugLog(`stdin chunk received: ${chunk.length} bytes`);
    });

    process.stdin.on('end', () => {
      debugLog(`stdin complete. Total: ${input.length} bytes`);
      debugLog(`stdin content: ${input.substring(0, 500)}`);
      processHookInput(input, debugLog);
      resolve();
    });

    process.stdin.on('error', (err) => {
      debugLog(`stdin error: ${err}`);
      resolve();
    });

    // Timeout fallback in case stdin never ends
    setTimeout(() => {
      if (!input) {
        debugLog('stdin timeout - no data received');
        resolve();
      }
    }, 5000);
  });
}

function processHookInput(input: string, debugLog: (msg: string) => void): void {

  let filePath: string | undefined;
  let linesCount = 0;
  let toolName: string | undefined;

  // Try to parse stdin as JSON (from Claude Code hook)
  if (input.trim()) {
    debugLog(`Attempting to parse input as JSON`);
    try {
      const hookInput: HookInput = JSON.parse(input);
      debugLog(`JSON parsed successfully. tool_name: ${hookInput.tool_name}, file_path: ${hookInput.tool_input?.file_path}`);
      filePath = hookInput.tool_input?.file_path;
      toolName = hookInput.tool_name;

      // Estimate lines from content
      if (hookInput.tool_input?.new_string) {
        linesCount = hookInput.tool_input.new_string.split('\n').length;
      } else if (hookInput.tool_input?.content) {
        linesCount = hookInput.tool_input.content.split('\n').length;
      } else if (hookInput.tool_response?.content) {
        // For Read tool, count lines from response
        linesCount = hookInput.tool_response.content.split('\n').length;
      } else if (hookInput.tool_input?.limit) {
        // If Read tool with limit, use that
        linesCount = hookInput.tool_input.limit;
      }

      // Only record if tool was successful
      if (hookInput.tool_response?.success === false) {
        debugLog('Tool response was unsuccessful, skipping');
        return;
      }
    } catch (parseError) {
      debugLog(`JSON parse failed: ${parseError}`);
      // Not JSON, might be file path directly
      filePath = input.trim();
    }
  } else {
    debugLog('No stdin input received');
  }

  debugLog(`Final state: filePath=${filePath}, toolName=${toolName}, linesCount=${linesCount}`);

  if (filePath) {
    // Determine if this is a Read or Edit/Write operation
    const isReadOperation = toolName === 'Read' ||
                           process.argv.includes('--read') ||
                           (toolName === undefined && !process.argv.includes('Write') && !process.argv.includes('Edit'));

    debugLog(`isReadOperation=${isReadOperation}`);

    if (isReadOperation && toolName === 'Read') {
      // This is a Read operation - track exploration
      debugLog(`Recording READ: ${filePath}`);
      recordRead(filePath, `Read via Read tool`, linesCount);
    } else {
      // This is an Edit/Write operation - track modification
      const context = toolName === 'Write' ? 'Write via Write tool' : 'Edit via Edit tool';
      debugLog(`Recording EDIT: ${filePath} with context: ${context}`);
      recordEdit(filePath, context, linesCount);
    }
  } else {
    debugLog('No filePath to record');
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  // Hook mode - when called from PostToolUse hook
  if (process.argv.includes('--hook') || (!process.stdin.isTTY && args.length === 0)) {
    await runHookMode();
    process.exit(0);  // Explicit exit for hook mode
  }

  const command = args[0] || 'stats';

  // Ensure directories exist
  ensureDir(CONFIG.debraDir);
  ensureDir(CONFIG.memoryDir);
  ensureDir(CONFIG.sessionsDir);
  ensureDir(CONFIG.learningDir);

  switch (command) {
    case 'record':
      // Manual record mode: record <file> [context] [linesChanged]
      const file = args[1];
      const context = args[2] || '';
      const lines = parseInt(args[3] || '0');
      if (file) {
        recordEdit(file, context, lines);
      } else {
        log('Usage: npm run brain:learn record <file> [context] [lines]', 'error');
      }
      break;

    case 'read':
      // Manual read record mode: read <file> [context]
      const readFile = args[1];
      const readContext = args[2] || '';
      if (readFile) {
        recordRead(readFile, readContext, 0);
      } else {
        log('Usage: npm run brain:learn read <file> [context]', 'error');
      }
      break;

    case 'session':
      showCurrentSession();
      break;

    case 'rules':
      showAutoRules();
      break;

    case 'weights':
      showEdgeWeights();
      break;

    case 'reads':
      showReadPatterns();
      break;

    case 'stats':
    default:
      showStats();
      break;
  }
}

main().catch(console.error);
