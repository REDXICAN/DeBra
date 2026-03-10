#!/usr/bin/env npx tsx

/**
 * DeBra - Knowledge Graph Operations
 * 
 * Manages the code knowledge graph:
 * - Query relationships
 * - Visualize dependencies
 * - Generate Mermaid diagrams
 * 
 * Usage:
 *   npm run debra:graph show
 *   npm run debra:graph query "CartScreen"
 *   npm run debra:graph mermaid cart
 *   npm run debra:graph deps CartSidebar
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  graphNodesPath: './.debra/graph/nodes.json',
  graphEdgesPath: './.debra/graph/edges.json',
  outputDir: './.debra/diagrams',
};

// ============================================================================
// TYPES
// ============================================================================

interface GraphNode {
  id: string;
  type: 'file' | 'component' | 'function' | 'hook' | 'type' | 'constant';
  name: string;
  file: string;
  domain: string;
  line: number;
}

interface GraphEdge {
  from: string;
  to: string;
  type: 'imports' | 'exports' | 'calls' | 'extends' | 'uses';
}

// ============================================================================
// LOAD DATA
// ============================================================================

function loadGraph(): { nodes: GraphNode[], edges: GraphEdge[] } {
  if (!fs.existsSync(CONFIG.graphNodesPath)) {
    console.error('❌ Graph not found. Run: npm run debra:index');
    process.exit(1);
  }
  
  const nodes = JSON.parse(fs.readFileSync(CONFIG.graphNodesPath, 'utf-8'));
  const edges = JSON.parse(fs.readFileSync(CONFIG.graphEdgesPath, 'utf-8'));
  
  return { nodes, edges };
}

// ============================================================================
// COMMANDS
// ============================================================================

function showGraph() {
  const { nodes, edges } = loadGraph();
  
  // Group by domain
  const byDomain: Record<string, GraphNode[]> = {};
  for (const node of nodes) {
    if (!byDomain[node.domain]) byDomain[node.domain] = [];
    byDomain[node.domain].push(node);
  }
  
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                        📊 DeBra - Knowledge Graph                             ║
╚═══════════════════════════════════════════════════════════════════════════════╝

📈 Summary:
   Nodes: ${nodes.length}
   Edges: ${edges.length}
   Domains: ${Object.keys(byDomain).length}

📁 By Domain:
`);
  
  for (const [domain, domainNodes] of Object.entries(byDomain).sort((a, b) => b[1].length - a[1].length)) {
    const types: Record<string, number> = {};
    for (const node of domainNodes) {
      types[node.type] = (types[node.type] || 0) + 1;
    }
    
    const typeSummary = Object.entries(types)
      .map(([t, c]) => `${t}:${c}`)
      .join(', ');
    
    console.log(`   ${domain.toUpperCase().padEnd(12)} ${String(domainNodes.length).padStart(4)} nodes (${typeSummary})`);
  }
  
  // Most connected
  const connectionCounts: Record<string, number> = {};
  for (const edge of edges) {
    connectionCounts[edge.from] = (connectionCounts[edge.from] || 0) + 1;
    connectionCounts[edge.to] = (connectionCounts[edge.to] || 0) + 1;
  }
  
  const mostConnected = Object.entries(connectionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  console.log(`
🔗 Most Connected Nodes:
`);
  
  for (const [nodeId, count] of mostConnected) {
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      console.log(`   ${String(count).padStart(3)} connections: ${node.name} [${node.domain}]`);
    }
  }
}

function queryGraph(query: string) {
  const { nodes, edges } = loadGraph();
  const queryLower = query.toLowerCase();
  
  // Find matching nodes
  const matchingNodes = nodes.filter(n =>
    n.name.toLowerCase().includes(queryLower) ||
    n.file.toLowerCase().includes(queryLower)
  );
  
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                      🔍 DeBra - Graph Query                                   ║
╚═══════════════════════════════════════════════════════════════════════════════╝

Query: "${query}"
Found: ${matchingNodes.length} nodes
`);
  
  for (const node of matchingNodes.slice(0, 20)) {
    console.log(`\n📦 ${node.name} (${node.type})`);
    console.log(`   📁 ${node.file}:${node.line}`);
    console.log(`   🏷️  Domain: ${node.domain}`);
    
    // Find connections
    const outgoing = edges.filter(e => e.from === node.id);
    const incoming = edges.filter(e => e.to === node.id);
    
    if (outgoing.length > 0) {
      console.log(`   ➡️  Uses (${outgoing.length}):`);
      for (const edge of outgoing.slice(0, 5)) {
        const target = nodes.find(n => n.id === edge.to);
        if (target) {
          console.log(`       └─ ${edge.type} → ${target.name}`);
        }
      }
    }
    
    if (incoming.length > 0) {
      console.log(`   ⬅️  Used by (${incoming.length}):`);
      for (const edge of incoming.slice(0, 5)) {
        const source = nodes.find(n => n.id === edge.from);
        if (source) {
          console.log(`       └─ ${source.name} → ${edge.type}`);
        }
      }
    }
  }
  
  if (matchingNodes.length > 20) {
    console.log(`\n... and ${matchingNodes.length - 20} more`);
  }
}

function generateMermaid(scope: string) {
  const { nodes, edges } = loadGraph();
  
  // Filter by domain if specified
  const scopeLower = scope.toLowerCase();
  const filteredNodes = scope === 'all'
    ? nodes
    : nodes.filter(n => n.domain === scopeLower || n.file.toLowerCase().includes(scopeLower));
  
  const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
  const filteredEdges = edges.filter(e => 
    filteredNodeIds.has(e.from) || filteredNodeIds.has(e.to)
  );
  
  // Generate Mermaid
  let mermaid = `graph TD\n`;
  mermaid += `    %% DeBra Knowledge Graph - ${scope}\n`;
  mermaid += `    %% Generated: ${new Date().toISOString()}\n\n`;
  
  // Add subgraphs by domain
  const byDomain: Record<string, GraphNode[]> = {};
  for (const node of filteredNodes) {
    if (!byDomain[node.domain]) byDomain[node.domain] = [];
    byDomain[node.domain].push(node);
  }
  
  for (const [domain, domainNodes] of Object.entries(byDomain)) {
    mermaid += `    subgraph ${domain.toUpperCase()}\n`;
    for (const node of domainNodes.slice(0, 20)) {
      const safeId = node.id.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
      const shape = node.type === 'component' ? `[${node.name}]` :
                    node.type === 'hook' ? `((${node.name}))` :
                    node.type === 'type' ? `{{${node.name}}}` :
                    `(${node.name})`;
      mermaid += `        ${safeId}${shape}\n`;
    }
    mermaid += `    end\n\n`;
  }
  
  // Add edges
  mermaid += `    %% Relationships\n`;
  for (const edge of filteredEdges.slice(0, 50)) {
    const fromId = edge.from.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
    const toId = edge.to.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
    const arrow = edge.type === 'imports' ? '-->' :
                  edge.type === 'extends' ? '-.->|extends|' :
                  '-->';
    mermaid += `    ${fromId} ${arrow} ${toId}\n`;
  }
  
  // Save
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  }
  
  const filename = `graph-${scope}-${Date.now()}.mermaid`;
  const filepath = path.join(CONFIG.outputDir, filename);
  fs.writeFileSync(filepath, mermaid);
  
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                     🎨 DeBra - Mermaid Diagram Generated                      ║
╚═══════════════════════════════════════════════════════════════════════════════╝

Scope: ${scope}
Nodes: ${filteredNodes.length}
Edges: ${Math.min(filteredEdges.length, 50)}

📁 Saved to: ${filepath}

Preview the first 30 lines:
${'─'.repeat(60)}
${mermaid.split('\n').slice(0, 30).join('\n')}
${filteredNodes.length > 30 ? '...' : ''}
`);
}

function showDeps(target: string) {
  const { nodes, edges } = loadGraph();
  const targetLower = target.toLowerCase();
  
  // Find target node
  const targetNode = nodes.find(n =>
    n.name.toLowerCase() === targetLower ||
    n.name.toLowerCase().includes(targetLower)
  );
  
  if (!targetNode) {
    console.log(`❌ Node not found: "${target}"`);
    return;
  }
  
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                     📊 DeBra - Dependency Tree                                ║
╚═══════════════════════════════════════════════════════════════════════════════╝

📦 ${targetNode.name} (${targetNode.type})
   📁 ${targetNode.file}
   🏷️  Domain: ${targetNode.domain}
`);
  
  // BFS to find all dependencies
  const visited = new Set<string>();
  const queue: { id: string; depth: number }[] = [{ id: targetNode.id, depth: 0 }];
  const deps: { node: GraphNode; depth: number }[] = [];
  
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visited.has(id) || depth > 3) continue;
    visited.add(id);
    
    const outgoing = edges.filter(e => e.from === id);
    for (const edge of outgoing) {
      const target = nodes.find(n => n.id === edge.to);
      if (target && !visited.has(target.id)) {
        deps.push({ node: target, depth: depth + 1 });
        queue.push({ id: target.id, depth: depth + 1 });
      }
    }
  }
  
  console.log(`📊 Dependency Tree (max depth 3):\n`);
  
  const byDepth: Record<number, GraphNode[]> = {};
  for (const { node, depth } of deps) {
    if (!byDepth[depth]) byDepth[depth] = [];
    byDepth[depth].push(node);
  }
  
  for (const [depth, depthNodes] of Object.entries(byDepth)) {
    console.log(`   Level ${depth}:`);
    for (const node of depthNodes.slice(0, 10)) {
      console.log(`   ${'  '.repeat(parseInt(depth))}└─ ${node.name} [${node.domain}]`);
    }
    if (depthNodes.length > 10) {
      console.log(`   ${'  '.repeat(parseInt(depth))}   ... and ${depthNodes.length - 10} more`);
    }
  }
  
  console.log(`\n📈 Total dependencies: ${deps.length}`);
}

// ============================================================================
// CLI
// ============================================================================

const command = process.argv[2];
const arg = process.argv[3];

if (!command || command === '--help' || command === '-h') {
  console.log(`
🧠 DeBra - Knowledge Graph Operations

Commands:
  show                Show graph summary
  query <name>        Query nodes by name
  mermaid <scope>     Generate Mermaid diagram
  deps <component>    Show dependency tree

Examples:
  npm run debra:graph show
  npm run debra:graph query "CartScreen"
  npm run debra:graph mermaid cart
  npm run debra:graph mermaid all
  npm run debra:graph deps CartSidebar
`);
  process.exit(0);
}

switch (command) {
  case 'show':
    showGraph();
    break;
  case 'query':
    if (!arg) {
      console.log('Usage: npm run debra:graph query <name>');
      process.exit(1);
    }
    queryGraph(arg);
    break;
  case 'mermaid':
    generateMermaid(arg || 'all');
    break;
  case 'deps':
    if (!arg) {
      console.log('Usage: npm run debra:graph deps <component>');
      process.exit(1);
    }
    showDeps(arg);
    break;
  default:
    console.log(`Unknown command: ${command}`);
    process.exit(1);
}
