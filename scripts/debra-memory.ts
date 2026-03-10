#!/usr/bin/env npx tsx
/**
 * DeBra Memory MCP Server
 * Provides memory operations via MCP protocol
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const MEMORY_DIR = path.join(ROOT, '.debra', 'memory');

// Memory file paths
const FACTS_FILE = path.join(MEMORY_DIR, 'facts.md');
const DECISIONS_FILE = path.join(MEMORY_DIR, 'decisions.md');
const LESSONS_FILE = path.join(MEMORY_DIR, 'lessons.md');

interface MemoryEntry {
  content: string;
  timestamp: string;
  category?: string;
}

function ensureMemoryDir(): void {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

function readMemoryFile(filePath: string): string[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const content = fs.readFileSync(filePath, 'utf8');
  return content.split('\n').filter(line => line.startsWith('- '));
}

function appendToFile(filePath: string, entry: string): void {
  ensureMemoryDir();
  const timestamp = new Date().toISOString().split('T')[0];
  const line = `- [${timestamp}] ${entry}\n`;
  fs.appendFileSync(filePath, line);
}

function searchMemory(query: string): MemoryEntry[] {
  const results: MemoryEntry[] = [];
  const queryLower = query.toLowerCase();

  const files = [
    { path: FACTS_FILE, category: 'fact' },
    { path: DECISIONS_FILE, category: 'decision' },
    { path: LESSONS_FILE, category: 'lesson' }
  ];

  for (const file of files) {
    const entries = readMemoryFile(file.path);
    for (const entry of entries) {
      if (entry.toLowerCase().includes(queryLower)) {
        // Extract timestamp if present
        const match = entry.match(/^\- \[(\d{4}-\d{2}-\d{2})\] (.+)$/);
        if (match) {
          results.push({
            content: match[2],
            timestamp: match[1],
            category: file.category
          });
        } else {
          results.push({
            content: entry.replace(/^- /, ''),
            timestamp: 'unknown',
            category: file.category
          });
        }
      }
    }
  }

  return results;
}

function getMemoryStats(): { facts: number; decisions: number; lessons: number } {
  return {
    facts: readMemoryFile(FACTS_FILE).length,
    decisions: readMemoryFile(DECISIONS_FILE).length,
    lessons: readMemoryFile(LESSONS_FILE).length
  };
}

// CLI mode
function runCLI(): void {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'remember':
    case 'fact':
      if (args[1]) {
        appendToFile(FACTS_FILE, args.slice(1).join(' '));
        console.log('✅ Fact saved');
      } else {
        console.log('Usage: debra-memory remember <fact>');
      }
      break;

    case 'decide':
    case 'decision':
      if (args[1]) {
        appendToFile(DECISIONS_FILE, args.slice(1).join(' '));
        console.log('✅ Decision logged');
      } else {
        console.log('Usage: debra-memory decide <decision>');
      }
      break;

    case 'lesson':
    case 'learn':
      if (args[1]) {
        appendToFile(LESSONS_FILE, args.slice(1).join(' '));
        console.log('✅ Lesson saved');
      } else {
        console.log('Usage: debra-memory lesson <lesson>');
      }
      break;

    case 'recall':
    case 'search':
      if (args[1]) {
        const results = searchMemory(args.slice(1).join(' '));
        if (results.length === 0) {
          console.log('No matching memories found.');
        } else {
          console.log(`Found ${results.length} matching memories:\n`);
          for (const r of results) {
            console.log(`[${r.category}] ${r.timestamp}: ${r.content}`);
          }
        }
      } else {
        console.log('Usage: debra-memory recall <query>');
      }
      break;

    case 'status':
    case 'stats':
      const stats = getMemoryStats();
      console.log(`
╔════════════════════════════════════════╗
║         🧠 Memory Bank Status          ║
╠════════════════════════════════════════╣
║  Facts:     ${String(stats.facts).padStart(4)}                      ║
║  Decisions: ${String(stats.decisions).padStart(4)}                      ║
║  Lessons:   ${String(stats.lessons).padStart(4)}                      ║
╚════════════════════════════════════════╝
`);
      break;

    case '--mcp':
      // MCP server mode - would implement MCP protocol
      console.log('MCP mode not yet implemented. Use CLI commands.');
      break;

    default:
      console.log(`
🧠 DeBra Memory Commands:

  remember <fact>     Save a fact
  decide <decision>   Log an architecture decision
  lesson <lesson>     Save a learned lesson
  recall <query>      Search memory
  status              Show memory stats

Examples:
  npx tsx scripts/debra-memory.ts remember "Cart uses Redux for state"
  npx tsx scripts/debra-memory.ts recall "cart"
`);
  }
}

runCLI();
