#!/usr/bin/env npx tsx

/**
 * DeBra - Prompt Library Manager
 *
 * Manages a library of reusable .md prompts with metadata, tagging,
 * and semantic search powered by Ollama embeddings.
 *
 * Prompts live in /prompts/ as .md files with YAML frontmatter.
 * An auto-generated index enables fast lookup by name, tags, or content.
 *
 * Usage:
 *   npm run prompt:list                     # List all prompts
 *   npm run prompt:search "refactor"        # Semantic search prompts
 *   npm run prompt:show "code-review"       # Show a specific prompt
 *   npm run prompt:tags                     # List all tags
 *   npm run prompt:add "name" "desc"        # Scaffold a new prompt
 *   npm run prompt:index                    # Rebuild the index
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ============================================================================
// CONFIGURATION
// ============================================================================

const PROJECT_ROOT = process.cwd();
const PROMPTS_DIR = path.join(PROJECT_ROOT, 'prompts');
const INDEX_FILE = path.join(PROMPTS_DIR, '_index.json');
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBED_MODEL = process.env.EMBED_MODEL || 'nomic-embed-text';

// ============================================================================
// TYPES
// ============================================================================

interface PromptMeta {
  name: string;
  slug: string;
  description: string;
  tags: string[];
  category: string;
  author: string;
  created: string;
  updated: string;
  version: string;
  file: string;
  contentPreview: string;
  embedding?: number[];
}

interface PromptIndex {
  version: string;
  lastBuilt: string;
  totalPrompts: number;
  categories: Record<string, number>;
  tags: Record<string, number>;
  prompts: PromptMeta[];
}

// ============================================================================
// FRONTMATTER PARSER
// ============================================================================

function parseFrontmatter(content: string): { meta: Record<string, any>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: content };
  }

  const meta: Record<string, any> = {};
  const lines = match[1].split('\n');

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.substring(0, colonIdx).trim();
    let value = line.substring(colonIdx + 1).trim();

    // Handle arrays like: tags: [code-review, refactor, quality]
    if (value.startsWith('[') && value.endsWith(']')) {
      meta[key] = value.slice(1, -1).split(',').map(s => s.trim().replace(/"/g, ''));
    } else {
      // Remove quotes
      meta[key] = value.replace(/^["']|["']$/g, '');
    }
  }

  return { meta, body: match[2] };
}

// ============================================================================
// EMBEDDING (via Ollama)
// ============================================================================

async function getEmbedding(text: string): Promise<number[] | null> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
    });

    if (!response.ok) return null;
    const data = await response.json() as any;
    return data.embedding || null;
  } catch {
    return null;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ============================================================================
// INDEX BUILDER
// ============================================================================

async function buildIndex(withEmbeddings = true): Promise<PromptIndex> {
  console.log('📚 Building prompt library index...\n');

  if (!fs.existsSync(PROMPTS_DIR)) {
    fs.mkdirSync(PROMPTS_DIR, { recursive: true });
  }

  const files = fs.readdirSync(PROMPTS_DIR)
    .filter(f => f.endsWith('.md') && !f.startsWith('_'));

  const prompts: PromptMeta[] = [];
  const categories: Record<string, number> = {};
  const tags: Record<string, number> = {};

  let ollamaAvailable = false;
  if (withEmbeddings) {
    try {
      const resp = await fetch(`${OLLAMA_URL}/api/tags`);
      ollamaAvailable = resp.ok;
    } catch {
      ollamaAvailable = false;
    }
    if (!ollamaAvailable) {
      console.log('⚠️  Ollama not available - building index without embeddings\n');
    }
  }

  for (const file of files) {
    const filePath = path.join(PROMPTS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const { meta, body } = parseFrontmatter(content);

    const slug = file.replace(/\.md$/, '');
    const promptTags = Array.isArray(meta.tags) ? meta.tags :
                       typeof meta.tags === 'string' ? meta.tags.split(',').map((s: string) => s.trim()) : [];
    const category = meta.category || 'general';

    // Count categories and tags
    categories[category] = (categories[category] || 0) + 1;
    for (const tag of promptTags) {
      tags[tag] = (tags[tag] || 0) + 1;
    }

    const entry: PromptMeta = {
      name: meta.name || meta.title || slug,
      slug,
      description: meta.description || '',
      tags: promptTags,
      category,
      author: meta.author || 'unknown',
      created: meta.created || '',
      updated: meta.updated || meta.created || '',
      version: meta.version || '1.0',
      file,
      contentPreview: body.trim().substring(0, 200).replace(/\n/g, ' '),
    };

    // Get embedding for semantic search
    if (ollamaAvailable && withEmbeddings) {
      const searchText = `${entry.name} ${entry.description} ${promptTags.join(' ')} ${body.substring(0, 500)}`;
      const embedding = await getEmbedding(searchText);
      if (embedding) {
        entry.embedding = embedding;
        process.stdout.write(`  ✓ ${file}\n`);
      } else {
        process.stdout.write(`  ⚠ ${file} (no embedding)\n`);
      }
    } else {
      process.stdout.write(`  ✓ ${file}\n`);
    }

    prompts.push(entry);
  }

  const index: PromptIndex = {
    version: '1.0',
    lastBuilt: new Date().toISOString(),
    totalPrompts: prompts.length,
    categories,
    tags,
    prompts,
  };

  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));

  console.log(`\n✅ Index built: ${prompts.length} prompts, ${Object.keys(categories).length} categories, ${Object.keys(tags).length} tags`);
  console.log(`📄 Saved to: ${INDEX_FILE}`);

  return index;
}

// ============================================================================
// COMMANDS
// ============================================================================

function loadIndex(): PromptIndex | null {
  if (!fs.existsSync(INDEX_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

async function cmdList() {
  let index = loadIndex();
  if (!index) {
    index = await buildIndex(false);
  }

  console.log(`\n📚 Prompt Library (${index.totalPrompts} prompts)\n`);
  console.log('─'.repeat(80));

  // Group by category
  const byCategory: Record<string, PromptMeta[]> = {};
  for (const p of index.prompts) {
    const cat = p.category || 'general';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(p);
  }

  for (const [category, prompts] of Object.entries(byCategory).sort()) {
    console.log(`\n📁 ${category.toUpperCase()} (${prompts.length})`);
    for (const p of prompts.sort((a, b) => a.name.localeCompare(b.name))) {
      const tagStr = p.tags.length > 0 ? ` [${p.tags.join(', ')}]` : '';
      console.log(`  • ${p.name.padEnd(30)} ${p.description.substring(0, 45)}${tagStr}`);
    }
  }

  console.log('\n' + '─'.repeat(80));
  console.log(`Categories: ${Object.keys(index.categories).join(', ')}`);
  console.log(`Tags: ${Object.keys(index.tags).join(', ')}`);
}

async function cmdSearch(query: string) {
  let index = loadIndex();
  if (!index) {
    index = await buildIndex(true);
  }

  console.log(`\n🔍 Searching prompts for: "${query}"\n`);

  // Try semantic search first
  const queryEmbedding = await getEmbedding(query);

  type ScoredPrompt = PromptMeta & { score: number; matchType: string };
  const results: ScoredPrompt[] = [];

  for (const p of index.prompts) {
    let score = 0;
    let matchType = '';

    // Semantic similarity (if embeddings available)
    if (queryEmbedding && p.embedding) {
      const similarity = cosineSimilarity(queryEmbedding, p.embedding);
      if (similarity > 0.3) {
        score = Math.max(score, similarity);
        matchType = 'semantic';
      }
    }

    // Keyword matching (fallback / boost)
    const queryLower = query.toLowerCase();
    const searchable = `${p.name} ${p.description} ${p.tags.join(' ')} ${p.contentPreview}`.toLowerCase();

    if (searchable.includes(queryLower)) {
      const keywordScore = 0.8;
      if (keywordScore > score) {
        score = keywordScore;
        matchType = 'keyword';
      }
    }

    // Tag exact match (highest priority)
    if (p.tags.some(t => t.toLowerCase() === queryLower)) {
      score = Math.max(score, 0.95);
      matchType = 'tag';
    }

    // Name match
    if (p.name.toLowerCase().includes(queryLower) || p.slug.includes(queryLower)) {
      score = Math.max(score, 0.9);
      matchType = 'name';
    }

    if (score > 0.3) {
      results.push({ ...p, score, matchType });
    }
  }

  results.sort((a, b) => b.score - a.score);

  if (results.length === 0) {
    console.log('No matching prompts found.\n');
    console.log('Try: npm run prompt:list  (to see all available prompts)');
    return;
  }

  console.log(`Found ${results.length} matching prompt(s):\n`);

  for (const r of results.slice(0, 10)) {
    const relevance = r.score >= 0.85 ? '🟢 HIGH' : r.score >= 0.6 ? '🟡 MEDIUM' : '🔴 LOW';
    console.log(`${relevance} (${r.matchType}) ${r.name}`);
    console.log(`  📄 ${r.file} | Category: ${r.category}`);
    console.log(`  📝 ${r.description}`);
    if (r.tags.length > 0) console.log(`  🏷️  ${r.tags.join(', ')}`);
    console.log(`  Preview: ${r.contentPreview.substring(0, 100)}...`);
    console.log();
  }

  console.log(`Use: npm run prompt:show "${results[0].slug}" to view the full prompt`);
}

function cmdShow(slugOrName: string) {
  const index = loadIndex();

  // Try direct file first
  const directPath = path.join(PROMPTS_DIR, slugOrName.endsWith('.md') ? slugOrName : `${slugOrName}.md`);
  if (fs.existsSync(directPath)) {
    const content = fs.readFileSync(directPath, 'utf-8');
    const { meta, body } = parseFrontmatter(content);

    console.log(`\n📜 ${meta.name || slugOrName}`);
    console.log('─'.repeat(60));
    if (meta.description) console.log(`Description: ${meta.description}`);
    if (meta.tags) console.log(`Tags: ${Array.isArray(meta.tags) ? meta.tags.join(', ') : meta.tags}`);
    if (meta.category) console.log(`Category: ${meta.category}`);
    if (meta.version) console.log(`Version: ${meta.version}`);
    console.log('─'.repeat(60));
    console.log(body.trim());
    console.log('─'.repeat(60));
    return;
  }

  // Search by name in index
  if (index) {
    const match = index.prompts.find(p =>
      p.slug === slugOrName ||
      p.name.toLowerCase() === slugOrName.toLowerCase() ||
      p.slug.includes(slugOrName.toLowerCase())
    );

    if (match) {
      const content = fs.readFileSync(path.join(PROMPTS_DIR, match.file), 'utf-8');
      const { meta, body } = parseFrontmatter(content);

      console.log(`\n📜 ${match.name}`);
      console.log('─'.repeat(60));
      console.log(`Description: ${match.description}`);
      console.log(`Tags: ${match.tags.join(', ')}`);
      console.log(`Category: ${match.category}`);
      console.log(`File: ${match.file}`);
      console.log('─'.repeat(60));
      console.log(body.trim());
      console.log('─'.repeat(60));
      return;
    }
  }

  console.log(`❌ Prompt not found: "${slugOrName}"`);
  console.log('Use: npm run prompt:list  (to see all available prompts)');
}

function cmdTags() {
  const index = loadIndex();
  if (!index) {
    console.log('Index not built. Run: npm run prompt:index');
    return;
  }

  console.log(`\n🏷️  Tags (${Object.keys(index.tags).length} total)\n`);

  const sorted = Object.entries(index.tags).sort((a, b) => b[1] - a[1]);
  for (const [tag, count] of sorted) {
    console.log(`  ${tag.padEnd(25)} (${count} prompt${count > 1 ? 's' : ''})`);
  }

  console.log(`\n📁 Categories (${Object.keys(index.categories).length} total)\n`);
  for (const [cat, count] of Object.entries(index.categories).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat.padEnd(25)} (${count} prompt${count > 1 ? 's' : ''})`);
  }
}

function cmdAdd(name: string, description: string) {
  if (!name) {
    console.log('Usage: npm run prompt:add -- "prompt-name" "Description of the prompt"');
    return;
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const filePath = path.join(PROMPTS_DIR, `${slug}.md`);

  if (fs.existsSync(filePath)) {
    console.log(`❌ Prompt already exists: ${filePath}`);
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const template = `---
name: ${name}
description: ${description || 'TODO: Add description'}
tags: [general]
category: general
author: El Rojo
created: ${today}
updated: ${today}
version: "1.0"
---

# ${name}

${description || 'TODO: Add description'}

## Prompt

\`\`\`
TODO: Add your prompt content here
\`\`\`

## Usage Notes

- When to use this prompt
- Expected input/output
- Tips for best results

## Examples

### Example 1
**Input:** ...
**Output:** ...
`;

  fs.writeFileSync(filePath, template);
  console.log(`\n✅ Created prompt: ${filePath}`);
  console.log(`\nEdit the file to add your prompt content, then run:`);
  console.log(`  npm run prompt:index    (rebuild index)`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'list';

  switch (command) {
    case 'list':
      await cmdList();
      break;

    case 'search': {
      const query = args.slice(1).join(' ');
      if (!query) {
        console.log('Usage: npm run prompt:search "your query"');
        process.exit(1);
      }
      await cmdSearch(query);
      break;
    }

    case 'show': {
      const slug = args.slice(1).join(' ');
      if (!slug) {
        console.log('Usage: npm run prompt:show "prompt-name"');
        process.exit(1);
      }
      cmdShow(slug);
      break;
    }

    case 'tags':
      cmdTags();
      break;

    case 'add': {
      const name = args[1] || '';
      const desc = args.slice(2).join(' ') || '';
      cmdAdd(name, desc);
      break;
    }

    case 'index':
      await buildIndex(true);
      break;

    default:
      console.log(`Unknown command: ${command}`);
      console.log('Available: list, search, show, tags, add, index');
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
