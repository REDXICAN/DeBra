#!/usr/bin/env npx tsx

/**
 * DeBra - Impact Analysis
 * 
 * Analyzes what might break when you change a file/component
 * Uses both semantic similarity and knowledge graph relationships
 * 
 * Usage:
 *   npm run debra:impact "CartSidebar"
 *   npm run debra:impact "src/features/cart/CartScreen.tsx"
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  vectorsPath: './.debra/vectors/vectors.json',
  graphNodesPath: './.debra/graph/nodes.json',
  graphEdgesPath: './.debra/graph/edges.json',
  featureMapPath: './.debra/rules/feature-map.md',
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  embedModel: process.env.EMBED_MODEL || 'nomic-embed-text',
  
  thresholds: {
    high: 0.85,
    medium: 0.70,
    low: 0.55,
  },
};

// Domain dependencies (from feature-map.md)
const DOMAIN_DEPS: Record<string, string[]> = {
  auth: ['products', 'quotes', 'customers', 'admin', 'inventory', 'users', 'home', 'cart'],
  pricing: ['cart', 'quotes', 'oc', 'email'],
  products: ['cart', 'quotes', 'inventory'],
  cart: ['quotes', 'oc'],
  quotes: ['email', 'oc'],
  customers: ['quotes', 'projects'],
  projects: ['quotes'],
  email: [],
  oc: ['email'],
  inventory: ['products'],
  admin: ['users'],
  users: ['auth'],
  i18n: [],
  ui: [],
};

const CRITICAL_DOMAINS = ['auth', 'pricing'];
const HIGH_IMPACT_DOMAINS = ['products', 'quotes', 'cart', 'email'];

// ============================================================================
// TYPES
// ============================================================================

interface CodeChunk {
  id: string;
  file: string;
  startLine: number;
  endLine: number;
  content: string;
  type: string;
  domain: string;
  exports: string[];
  imports: string[];
  embedding: number[];
}

interface GraphNode {
  id: string;
  type: string;
  name: string;
  file: string;
  domain: string;
  line: number;
}

interface GraphEdge {
  from: string;
  to: string;
  type: string;
}

interface ImpactResult {
  file: string;
  domain: string;
  similarity: number;
  risk: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  graphConnections: number;
}

// ============================================================================
// UTILITIES
// ============================================================================

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function loadVectors(): CodeChunk[] {
  if (!fs.existsSync(CONFIG.vectorsPath)) {
    console.error('❌ Vector index not found. Run: npm run debra:index');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG.vectorsPath, 'utf-8'));
}

function loadGraph(): { nodes: GraphNode[], edges: GraphEdge[] } {
  const nodes = fs.existsSync(CONFIG.graphNodesPath)
    ? JSON.parse(fs.readFileSync(CONFIG.graphNodesPath, 'utf-8'))
    : [];
  const edges = fs.existsSync(CONFIG.graphEdgesPath)
    ? JSON.parse(fs.readFileSync(CONFIG.graphEdgesPath, 'utf-8'))
    : [];
  return { nodes, edges };
}

async function getEmbedding(text: string): Promise<number[]> {
  try {
    const response = await fetch(`${CONFIG.ollamaUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: CONFIG.embedModel, prompt: text }),
    });
    const data = await response.json();
    return data.embedding || [];
  } catch {
    return [];
  }
}

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

function findTargetChunks(chunks: CodeChunk[], target: string): CodeChunk[] {
  const targetLower = target.toLowerCase();
  
  return chunks.filter(chunk =>
    chunk.file.toLowerCase().includes(targetLower) ||
    chunk.content.toLowerCase().includes(targetLower) ||
    chunk.exports.some(e => e.toLowerCase().includes(targetLower))
  );
}

function findGraphConnections(
  nodes: GraphNode[],
  edges: GraphEdge[],
  targetFiles: Set<string>
): Map<string, number> {
  const connections = new Map<string, number>();
  
  // Find nodes in target files
  const targetNodeIds = new Set(
    nodes.filter(n => targetFiles.has(n.file)).map(n => n.id)
  );
  
  // Count connections to other files
  for (const edge of edges) {
    if (targetNodeIds.has(edge.from)) {
      const toNode = nodes.find(n => n.id === edge.to);
      if (toNode && !targetFiles.has(toNode.file)) {
        connections.set(toNode.file, (connections.get(toNode.file) || 0) + 1);
      }
    }
    if (targetNodeIds.has(edge.to)) {
      const fromNode = nodes.find(n => n.id === edge.from);
      if (fromNode && !targetFiles.has(fromNode.file)) {
        connections.set(fromNode.file, (connections.get(fromNode.file) || 0) + 1);
      }
    }
  }
  
  return connections;
}

function determineRisk(
  similarity: number,
  domain: string,
  targetDomain: string,
  graphConnections: number
): { risk: ImpactResult['risk']; reason: string } {
  // Critical if in critical domain
  if (CRITICAL_DOMAINS.includes(domain) && similarity > CONFIG.thresholds.medium) {
    return { risk: 'CRITICAL', reason: `Critical domain (${domain}) with high similarity` };
  }
  
  // Critical if in dependent domain with high similarity
  const dependentDomains = DOMAIN_DEPS[targetDomain] || [];
  if (dependentDomains.includes(domain) && similarity > CONFIG.thresholds.high) {
    return { risk: 'CRITICAL', reason: `Direct dependency from ${targetDomain}` };
  }
  
  // High if strong similarity or graph connection
  if (similarity >= CONFIG.thresholds.high) {
    return { risk: 'HIGH', reason: 'Very similar code' };
  }
  
  if (graphConnections >= 3 && similarity > CONFIG.thresholds.medium) {
    return { risk: 'HIGH', reason: `${graphConnections} direct graph connections` };
  }
  
  if (dependentDomains.includes(domain)) {
    return { risk: 'HIGH', reason: `In dependent domain (${domain})` };
  }
  
  // Medium
  if (similarity >= CONFIG.thresholds.medium) {
    return { risk: 'MEDIUM', reason: 'Moderately similar code' };
  }
  
  if (graphConnections >= 1) {
    return { risk: 'MEDIUM', reason: `${graphConnections} graph connection(s)` };
  }
  
  // Low
  return { risk: 'LOW', reason: 'Some similarity detected' };
}

// ============================================================================
// MAIN ANALYSIS
// ============================================================================

async function analyzeImpact(target: string) {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                       🎯 DeBra - Impact Analysis                              ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);
  
  console.log(`📍 Target: "${target}"\n`);
  
  // Load data
  const chunks = loadVectors();
  const { nodes, edges } = loadGraph();
  
  // Find target chunks
  const targetChunks = findTargetChunks(chunks, target);
  
  if (targetChunks.length === 0) {
    console.log(`❌ No code found matching "${target}"`);
    console.log('\nTry:');
    console.log('  - A component name: CartSidebar');
    console.log('  - A file path: src/features/cart/');
    console.log('  - An export name: calculateTotal');
    return;
  }
  
  // Determine primary domain
  const domainCounts: Record<string, number> = {};
  for (const chunk of targetChunks) {
    domainCounts[chunk.domain] = (domainCounts[chunk.domain] || 0) + 1;
  }
  const targetDomain = Object.entries(domainCounts).sort((a, b) => b[1] - a[1])[0][0];
  
  console.log(`📁 Found ${targetChunks.length} matching chunks`);
  console.log(`🏷️  Primary domain: ${targetDomain.toUpperCase()}`);
  
  // Show dependent domains
  const dependents = DOMAIN_DEPS[targetDomain] || [];
  if (dependents.length > 0) {
    console.log(`🔗 Dependent domains: ${dependents.join(', ')}`);
  }
  
  // Calculate average embedding
  const validEmbeddings = targetChunks.filter(c => c.embedding && c.embedding.length > 0);
  if (validEmbeddings.length === 0) {
    console.log('\n⚠️  No embeddings found. Run: npm run debra:index');
    return;
  }
  
  const avgEmbedding = new Array(validEmbeddings[0].embedding.length).fill(0);
  for (const chunk of validEmbeddings) {
    for (let i = 0; i < chunk.embedding.length; i++) {
      avgEmbedding[i] += chunk.embedding[i] / validEmbeddings.length;
    }
  }
  
  // Find graph connections
  const targetFiles = new Set(targetChunks.map(c => c.file));
  const graphConnections = findGraphConnections(nodes, edges, targetFiles);
  
  // Calculate impacts
  const otherChunks = chunks.filter(c => !targetFiles.has(c.file));
  const impacts: ImpactResult[] = [];
  const seenFiles = new Set<string>();
  
  for (const chunk of otherChunks) {
    if (seenFiles.has(chunk.file)) continue;
    if (!chunk.embedding || chunk.embedding.length === 0) continue;
    
    const similarity = cosineSimilarity(avgEmbedding, chunk.embedding);
    const connections = graphConnections.get(chunk.file) || 0;
    
    if (similarity >= CONFIG.thresholds.low || connections > 0) {
      const { risk, reason } = determineRisk(similarity, chunk.domain, targetDomain, connections);
      
      impacts.push({
        file: chunk.file,
        domain: chunk.domain,
        similarity,
        risk,
        reason,
        graphConnections: connections,
      });
      
      seenFiles.add(chunk.file);
    }
  }
  
  // Sort by risk
  const riskOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  impacts.sort((a, b) => {
    if (riskOrder[a.risk] !== riskOrder[b.risk]) {
      return riskOrder[a.risk] - riskOrder[b.risk];
    }
    return b.similarity - a.similarity;
  });
  
  // Display results
  const critical = impacts.filter(i => i.risk === 'CRITICAL');
  const high = impacts.filter(i => i.risk === 'HIGH');
  const medium = impacts.filter(i => i.risk === 'MEDIUM');
  const low = impacts.filter(i => i.risk === 'LOW');
  
  console.log(`
${'═'.repeat(80)}
`);
  
  if (critical.length > 0) {
    console.log(`🔴 CRITICAL RISK (${critical.length} files) - MUST TEST:\n`);
    for (const i of critical.slice(0, 10)) {
      const pct = (i.similarity * 100).toFixed(0);
      console.log(`   ${pct}% [${i.domain.toUpperCase()}] ${i.file}`);
      console.log(`       └─ ${i.reason}${i.graphConnections > 0 ? ` (${i.graphConnections} graph links)` : ''}`);
    }
    console.log();
  }
  
  if (high.length > 0) {
    console.log(`🟠 HIGH RISK (${high.length} files) - SHOULD TEST:\n`);
    for (const i of high.slice(0, 10)) {
      const pct = (i.similarity * 100).toFixed(0);
      console.log(`   ${pct}% [${i.domain.toUpperCase()}] ${i.file}`);
      console.log(`       └─ ${i.reason}`);
    }
    console.log();
  }
  
  if (medium.length > 0) {
    console.log(`🟡 MEDIUM RISK (${medium.length} files):\n`);
    for (const i of medium.slice(0, 5)) {
      const pct = (i.similarity * 100).toFixed(0);
      console.log(`   ${pct}% [${i.domain.toUpperCase()}] ${i.file}`);
    }
    if (medium.length > 5) console.log(`   ... and ${medium.length - 5} more`);
    console.log();
  }
  
  if (low.length > 0) {
    console.log(`🟢 LOW RISK (${low.length} files):\n`);
    for (const i of low.slice(0, 3)) {
      const pct = (i.similarity * 100).toFixed(0);
      console.log(`   ${pct}% [${i.domain.toUpperCase()}] ${i.file}`);
    }
    if (low.length > 3) console.log(`   ... and ${low.length - 3} more`);
    console.log();
  }
  
  // Summary and recommendations
  console.log(`${'═'.repeat(80)}`);
  console.log(`
📊 IMPACT SUMMARY

   🔴 Critical:  ${critical.length} files
   🟠 High:      ${high.length} files
   🟡 Medium:    ${medium.length} files
   🟢 Low:       ${low.length} files
   ─────────────────────
   📁 Total:     ${impacts.length} potentially affected files
`);
  
  // Test recommendations
  const domainsToTest = new Set([targetDomain, ...critical.map(i => i.domain), ...high.map(i => i.domain)]);
  
  console.log(`🧪 RECOMMENDED TESTS:\n`);
  for (const domain of domainsToTest) {
    console.log(`   npm run test:${domain}`);
  }
  console.log(`   npm run test          # Run all tests`);
  
  // Risk assessment
  console.log(`
⚠️  RISK ASSESSMENT:
`);
  
  if (CRITICAL_DOMAINS.includes(targetDomain)) {
    console.log(`   🔴 CRITICAL: You're modifying a critical domain (${targetDomain}).`);
    console.log(`   This affects virtually the ENTIRE application.`);
    console.log(`   ➜ Run full test suite before merging!`);
  } else if (HIGH_IMPACT_DOMAINS.includes(targetDomain)) {
    console.log(`   🟠 HIGH: You're modifying a high-impact domain (${targetDomain}).`);
    console.log(`   ➜ Test all dependent domains: ${dependents.join(', ') || 'none'}`);
  } else {
    console.log(`   🟢 MODERATE: Impact is contained to ${targetDomain} domain.`);
    console.log(`   ➜ Standard testing should suffice.`);
  }
  
  console.log();
}

// ============================================================================
// CLI
// ============================================================================

const target = process.argv[2];

if (!target || target === '--help' || target === '-h') {
  console.log(`
🧠 DeBra - Impact Analysis

Analyzes what might break when you change code.

Usage:
  npm run debra:impact "<target>"

Examples:
  npm run debra:impact "CartSidebar"
  npm run debra:impact "src/features/cart/"
  npm run debra:impact "calculateTotal"
  npm run debra:impact "QuoteEmailDialog"
`);
  process.exit(0);
}

// Record impact analysis for enforcement tracking
function recordImpact(target: string): void {
  try {
    execSync(`npx tsx scripts/debra-enforce.ts --record impact "${target.replace(/"/g, '\\"')}"`, {
      stdio: 'ignore',
      cwd: process.cwd(),
    });
  } catch {
    // Silent fail
  }
}

analyzeImpact(target)
  .then(() => recordImpact(target))
  .catch(console.error);
