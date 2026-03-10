#!/usr/bin/env npx tsx

/**
 * DeBra - Development Brain Semantic Search
 * 
 * Features:
 * - Semantic search using Ollama embeddings
 * - Domain filtering
 * - Type filtering
 * - Knowledge graph integration
 * 
 * Usage: 
 *   npm run debra:search "cart total calculation"
 *   npm run debra:search "cart total" --domain cart
 *   npm run debra:search "hooks" --type hook
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
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  embedModel: process.env.EMBED_MODEL || 'nomic-embed-text',
  defaultTopK: 10,
};

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
  hash: string;
}

interface SearchResult extends CodeChunk {
  similarity: number;
  relevance: 'high' | 'medium' | 'low';
}

interface GraphNode {
  id: string;
  type: string;
  name: string;
  file: string;
  domain: string;
  line: number;
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
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

function getRelevance(similarity: number): 'high' | 'medium' | 'low' {
  if (similarity >= 0.85) return 'high';
  if (similarity >= 0.70) return 'medium';
  return 'low';
}

function formatPercent(n: number): string {
  return (n * 100).toFixed(1) + '%';
}

function truncate(str: string, maxLines: number = 5): string {
  const lines = str.split('\n');
  if (lines.length <= maxLines) return str;
  return lines.slice(0, maxLines).join('\n') + '\n...';
}

// ============================================================================
// DATA LOADING
// ============================================================================

function loadVectors(): CodeChunk[] {
  if (!fs.existsSync(CONFIG.vectorsPath)) {
    console.error('❌ Vector index not found. Run: npm run debra:index');
    process.exit(1);
  }
  
  return JSON.parse(fs.readFileSync(CONFIG.vectorsPath, 'utf-8'));
}

function loadGraph(): { nodes: GraphNode[], edges: any[] } {
  const nodes: GraphNode[] = fs.existsSync(CONFIG.graphNodesPath)
    ? JSON.parse(fs.readFileSync(CONFIG.graphNodesPath, 'utf-8'))
    : [];
  
  const edges: any[] = fs.existsSync(CONFIG.graphEdgesPath)
    ? JSON.parse(fs.readFileSync(CONFIG.graphEdgesPath, 'utf-8'))
    : [];
  
  return { nodes, edges };
}

// ============================================================================
// OLLAMA EMBEDDING
// ============================================================================

async function getEmbedding(text: string): Promise<number[]> {
  try {
    const response = await fetch(`${CONFIG.ollamaUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CONFIG.embedModel,
        prompt: text,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.embedding;
  } catch (error) {
    console.error('❌ Ollama error. Is it running? Try: ollama serve');
    process.exit(1);
  }
}

// ============================================================================
// SEARCH FUNCTION
// ============================================================================

async function search(
  query: string,
  options: {
    domain?: string;
    type?: string;
    topK?: number;
    showGraph?: boolean;
  } = {}
): Promise<SearchResult[]> {
  const topK = options.topK || CONFIG.defaultTopK;
  
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                      🔍 DeBra - Semantic Code Search                          ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);
  
  console.log(`📝 Query: "${query}"`);
  if (options.domain) console.log(`🏷️  Domain filter: ${options.domain}`);
  if (options.type) console.log(`📦 Type filter: ${options.type}`);
  console.log();
  
  // Get query embedding
  console.log('🔄 Getting embedding...');
  const queryEmbedding = await getEmbedding(query);
  
  // Load vectors
  let chunks = loadVectors();
  console.log(`📚 Searching ${chunks.length} chunks...`);
  
  // Apply filters
  if (options.domain) {
    chunks = chunks.filter(c => c.domain === options.domain);
    console.log(`   Filtered to ${chunks.length} chunks in domain "${options.domain}"`);
  }
  
  if (options.type) {
    chunks = chunks.filter(c => c.type === options.type);
    console.log(`   Filtered to ${chunks.length} chunks of type "${options.type}"`);
  }
  
  // Calculate similarities
  const results: SearchResult[] = chunks
    .filter(chunk => chunk.embedding && chunk.embedding.length > 0)
    .map(chunk => ({
      ...chunk,
      similarity: cosineSimilarity(queryEmbedding, chunk.embedding),
      relevance: getRelevance(cosineSimilarity(queryEmbedding, chunk.embedding)),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
  
  // Display results
  console.log(`
${'═'.repeat(80)}
📊 Top ${results.length} Results
${'═'.repeat(80)}
`);
  
  // Separate lessons from code results for display
  const lessonResults = results.filter(r => r.type === 'lesson');
  const codeResults = results.filter(r => r.type !== 'lesson');

  // Show lesson results first if any
  if (lessonResults.length > 0) {
    console.log(`
${'═'.repeat(80)}
📚 Relevant Lessons (${lessonResults.length})
${'═'.repeat(80)}
`);
    for (let i = 0; i < lessonResults.length; i++) {
      const r = lessonResults[i];
      const similarity = formatPercent(r.similarity);
      const relevanceIcon = r.relevance === 'high' ? '🟢' : r.relevance === 'medium' ? '🟡' : '🔴';
      const domainBadge = `[${r.domain.toUpperCase()}]`;
      const lessonExport = r.exports[0] || 'Lesson';

      console.log(`${i + 1}. ${relevanceIcon} ${similarity} ${domainBadge} 📖 ${lessonExport}`);

      // Show lesson title and preview
      const lines = r.content.split('\n');
      const titleLine = lines[0] || '';
      console.log(`   ${titleLine}`);
      console.log('   ' + '─'.repeat(70));

      // Show key info from lesson (Bug, Root Cause, Lesson)
      const bugMatch = r.content.match(/\*\*Bug:\*\*\s*(.+)/);
      const causeMatch = r.content.match(/\*\*Root Cause:\*\*\s*(.+)/);
      const lessonMatch = r.content.match(/\*\*Lesson:\*\*\s*(.+)/);

      if (bugMatch) console.log(`   🐛 Bug: ${bugMatch[1]}`);
      if (causeMatch) console.log(`   🔍 Cause: ${causeMatch[1]}`);
      if (lessonMatch) console.log(`   💡 Lesson: ${lessonMatch[1]}`);
      console.log();
    }
  }

  // Show code results
  if (codeResults.length > 0) {
    console.log(`
${'═'.repeat(80)}
💻 Code Results (${codeResults.length})
${'═'.repeat(80)}
`);
    for (let i = 0; i < codeResults.length; i++) {
      const r = codeResults[i];
      const similarity = formatPercent(r.similarity);
      const relevanceIcon = r.relevance === 'high' ? '🟢' : r.relevance === 'medium' ? '🟡' : '🔴';
      const domainBadge = `[${r.domain.toUpperCase()}]`;
      const typeBadge = `(${r.type})`;

      console.log(`${i + 1}. ${relevanceIcon} ${similarity} ${domainBadge} ${typeBadge}`);
      console.log(`   📁 ${r.file}:${r.startLine}-${r.endLine}`);

      if (r.exports.length > 0) {
        console.log(`   📤 Exports: ${r.exports.join(', ')}`);
      }

      console.log('   ' + '─'.repeat(70));

      // Show preview
      const preview = truncate(r.content, 5);
      console.log('   ' + preview.split('\n').map(l => '   ' + l).join('\n'));
      console.log();
    }
  }
  
  // Show graph connections if requested
  if (options.showGraph && results.length > 0) {
    const { nodes, edges } = loadGraph();
    
    console.log(`
${'═'.repeat(80)}
🔗 Related Components (Knowledge Graph)
${'═'.repeat(80)}
`);
    
    const topResultFiles = new Set(results.slice(0, 3).map(r => r.file));
    
    for (const file of topResultFiles) {
      const fileNodes = nodes.filter(n => n.file === file);
      const relatedEdges = edges.filter(e => 
        fileNodes.some(n => e.from === n.id || e.to === n.id)
      );
      
      if (fileNodes.length > 0) {
        console.log(`📁 ${file}`);
        for (const node of fileNodes.slice(0, 3)) {
          console.log(`   └─ ${node.type}: ${node.name}`);
        }
        if (relatedEdges.length > 0) {
          console.log(`   🔗 ${relatedEdges.length} connections`);
        }
        console.log();
      }
    }
  }
  
  // Summary
  console.log(`${'═'.repeat(80)}`);
  const highRelevance = results.filter(r => r.relevance === 'high').length;
  const mediumRelevance = results.filter(r => r.relevance === 'medium').length;
  const lowRelevance = results.filter(r => r.relevance === 'low').length;
  console.log(`Found ${highRelevance} high, ${mediumRelevance} medium, ${lowRelevance} low relevance results`);
  console.log(`  📚 ${lessonResults.length} lessons | 💻 ${codeResults.length} code chunks`);
  
  return results;
}

// ============================================================================
// CLI PARSING
// ============================================================================

function parseArgs(): {
  query: string;
  domain?: string;
  type?: string;
  topK?: number;
  showGraph?: boolean;
} {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
🧠 DeBra - Semantic Code Search

Usage:
  npm run debra:search "<query>"
  npm run debra:search "<query>" --domain <domain>
  npm run debra:search "<query>" --type <type>
  npm run debra:search "<query>" --top <N>
  npm run debra:search "<query>" --graph

Domains:
  auth, home, products, cart, quotes, email, customers, projects,
  oc, inventory, admin, users, i18n, ui, backend, tester

Types:
  component, hook, service, store, type, util, test, screen, lesson, other

Examples:
  npm run debra:search "cart total calculation"
  npm run debra:search "email sending" --domain email
  npm run debra:search "state management" --type hook
  npm run debra:search "auth" --graph
`);
    process.exit(0);
  }
  
  const result: ReturnType<typeof parseArgs> = {
    query: args[0],
  };
  
  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--domain':
      case '-d':
        result.domain = args[++i];
        break;
      case '--type':
      case '-t':
        result.type = args[++i];
        break;
      case '--top':
      case '-n':
        result.topK = parseInt(args[++i]);
        break;
      case '--graph':
      case '-g':
        result.showGraph = true;
        break;
    }
  }
  
  return result;
}

// ============================================================================
// SESSION TRACKING
// ============================================================================

function recordSearch(query: string): void {
  try {
    // Record that a search was performed
    execSync(`npx tsx scripts/debra-enforce.ts --record search "${query.replace(/"/g, '\\"')}"`, {
      stdio: 'ignore',
      cwd: process.cwd(),
    });
  } catch {
    // Silent fail - don't break search if recording fails
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const { query, ...options } = parseArgs();
  await search(query, options);

  // Record successful search for enforcement tracking
  recordSearch(query);
}

main().catch(console.error);
