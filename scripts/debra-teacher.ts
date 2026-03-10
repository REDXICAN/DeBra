#!/usr/bin/env npx tsx

/**
 * DeBra - Claude Teacher Generator
 *
 * Generates engaging technical documentation for "El Rojo"
 * Synthesizes knowledge from:
 * - Memory files (lessons, facts, decisions)
 * - Git history (recent changes)
 *
 * Usage:
 *   npm run brain:teacher           # Generate full ClaudeTeacher.md
 *   npm run brain:teacher --check   # Check if update needed
 *   npm run brain:teach "topic"     # Explain specific topic
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Output
  outputPath: './docs/ClaudeTeacher.md',

  // Sources
  memoryDir: './.debra/memory',
  lessonsFile: './.debra/memory/lessons.md',
  factsFile: './.debra/memory/facts.md',
  decisionsFile: './.debra/memory/decisions.md',

  // Git
  recentCommitsCount: 15,

  // Style
  targetAudience: 'El Rojo',
};

// ============================================================================
// TYPES
// ============================================================================

interface Lesson {
  number: number;
  title: string;
  date: string;
  bug: string;
  rootCause: string;
  lesson: string;
  pattern?: string;
}

interface Decision {
  id: string;
  title: string;
  date: string;
  status: string;
  context: string;
  decision: string;
  consequences: string[];
}

interface Commit {
  hash: string;
  date: string;
  message: string;
}

// ============================================================================
// PARSING FUNCTIONS
// ============================================================================

function parseLessons(content: string): Lesson[] {
  const lessons: Lesson[] = [];
  const lessonBlocks = content.split(/^## Lesson \d+/m).slice(1);

  for (let i = 0; i < lessonBlocks.length; i++) {
    const block = lessonBlocks[i];
    const titleMatch = block.match(/^:\s*(.+?)$/m);
    const dateMatch = block.match(/\*\*Date:\*\*\s*(.+?)$/m);
    const bugMatch = block.match(/\*\*Bug:\*\*\s*(.+?)$/m);
    const rootCauseMatch = block.match(/\*\*Root Cause:\*\*\s*(.+?)$/m);
    const lessonMatch = block.match(/\*\*Lesson:\*\*\s*(.+?)$/m);
    const patternMatch = block.match(/```[\w]*\n([\s\S]*?)```/);

    lessons.push({
      number: i + 1,
      title: titleMatch?.[1]?.trim() || `Lesson ${i + 1}`,
      date: dateMatch?.[1]?.trim() || 'Unknown',
      bug: bugMatch?.[1]?.trim() || '',
      rootCause: rootCauseMatch?.[1]?.trim() || '',
      lesson: lessonMatch?.[1]?.trim() || '',
      pattern: patternMatch?.[1]?.trim(),
    });
  }

  return lessons;
}

function parseDecisions(content: string): Decision[] {
  const decisions: Decision[] = [];
  const adrBlocks = content.split(/^## ADR-/m).slice(1);

  for (const block of adrBlocks) {
    const idMatch = block.match(/^(\d+):/m);
    const titleMatch = block.match(/^\d+:\s*(.+?)$/m);
    const dateMatch = block.match(/\*\*Date:\*\*\s*(.+?)$/m);
    const statusMatch = block.match(/\*\*Status:\*\*\s*(.+?)$/m);
    const contextMatch = block.match(/\*\*Context:\*\*\s*(.+?)$/m);
    const decisionMatch = block.match(/\*\*Decision:\*\*\s*(.+?)$/m);
    const consequencesMatch = block.match(/\*\*Consequences:\*\*\n([\s\S]*?)(?=\n---|\n$|$)/);

    const consequences = consequencesMatch?.[1]
      ?.split('\n')
      .filter(line => line.startsWith('-'))
      .map(line => line.replace(/^-\s*/, '').trim()) || [];

    decisions.push({
      id: `ADR-${idMatch?.[1] || '???'}`,
      title: titleMatch?.[1]?.trim() || 'Unknown Decision',
      date: dateMatch?.[1]?.trim() || 'Unknown',
      status: statusMatch?.[1]?.trim() || 'Unknown',
      context: contextMatch?.[1]?.trim() || '',
      decision: decisionMatch?.[1]?.trim() || '',
      consequences,
    });
  }

  return decisions;
}

function getRecentCommits(count: number): Commit[] {
  try {
    const output = execSync(
      `git log -${count} --pretty=format:"%h|%ad|%s" --date=short`,
      { encoding: 'utf-8' }
    );

    return output.split('\n').filter(Boolean).map(line => {
      const [hash, date, ...messageParts] = line.split('|');
      return {
        hash,
        date,
        message: messageParts.join('|'),
      };
    });
  } catch {
    return [];
  }
}

function getFileModTime(filePath: string): Date | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.statSync(filePath).mtime;
  } catch {
    return null;
  }
}

// ============================================================================
// CONTENT GENERATION
// ============================================================================

function generateEngagingLesson(lesson: Lesson): string {
  // Create engaging story from lesson
  const stories: Record<string, string> = {
    'Nullish Coalescing for Numbers': `
### The Zero Dollar Bug

Picture this: A salesperson prices a custom item at $0 (maybe it's a free sample).
They save the quote, but when they open it again - surprise! - the price shows the default MSRP.

**What happened?** The code used \`||\` to fall back to a default price:

\`\`\`typescript
const price = item.customPrice || item.defaultPrice;  // Bug: 0 is "falsy"
\`\`\`

JavaScript treats \`0\` as "falsy" - same as \`null\` or \`undefined\`.
So \`||\` said "zero? That's nothing! Let me use the default instead."

**The fix:** Use \`??\` (nullish coalescing):

\`\`\`typescript
const price = item.customPrice ?? item.defaultPrice;  // Correct: 0 is preserved
\`\`\`

**Rule of thumb:** If a number can legitimately be zero, use \`??\`, not \`||\`.
`,
    'MUI v7 Autocomplete Key': `
### The Mysterious White Screen

Users click a dropdown, select an option, and BAM - white screen of death.

**What happened?** MUI v7 changed how keys work in \`renderOption\`. The old code:

\`\`\`typescript
renderOption={(props, option) => <Box {...props}>{option.label}</Box>}
\`\`\`

...stopped working because \`props\` now contains a \`key\` that needs to be extracted:

\`\`\`typescript
renderOption={({ key, ...props }, option) => <Box key={key} {...props}>{option.label}</Box>}
\`\`\`

**Lesson:** When upgrading libraries, check the changelog for breaking changes in commonly-used components.
`,
    'Fresh Data for Dialogs': `
### The Case of the Missing Notes

A salesperson adds special instructions to a quote: "Customer needs delivery before 9am."
They send the email... but the notes aren't there!

**What happened?** The email dialog was using the \`quote\` prop passed from the parent screen.
But that prop was stale - it had the data from when the screen loaded, not the latest saved version.

\`\`\`typescript
// Bug: Using stale data
const emailContent = generateEmail(quote);

// Fix: Fetch fresh data when dialog opens
useEffect(() => {
  if (open && quote?.id) {
    const fresh = await databaseService.getQuote(quote.id);
    setFreshQuote(fresh);
  }
}, [open, quote?.id]);
\`\`\`

**Rule:** When a dialog needs complete data, fetch it fresh when the dialog opens.
`,
  };

  // Check if we have a custom story
  for (const [key, story] of Object.entries(stories)) {
    if (lesson.title.includes(key) || lesson.lesson.includes(key.split(' ')[0])) {
      return story;
    }
  }

  // Generate default format
  return `
### Lesson ${lesson.number}: ${lesson.title}

**The Bug:** ${lesson.bug}

**Why it happened:** ${lesson.rootCause}

**The Lesson:** ${lesson.lesson}
${lesson.pattern ? `
\`\`\`typescript
${lesson.pattern}
\`\`\`
` : ''}
`;
}

function generateDocument(
  lessons: Lesson[],
  decisions: Decision[],
  facts: string,
  commits: Commit[]
): string {
  const today = new Date().toISOString().split('T')[0];

  return `# TAQuotesUS - Technical Guide for Humans

> Your friendly guide to understanding TAQuotesUS, written for ${CONFIG.targetAudience}.
> Skip the jargon, keep the knowledge.
>
> Last updated: ${today} | Generated by DeBra v3.0

---

## What Is This System? (The 30-Second Pitch)

Imagine you're running a commercial refrigeration company in Mexico. Your sales team needs to:
- Find the right freezer for a restaurant's kitchen
- Calculate prices with markups and discounts
- Create professional quotes (cotizaciones)
- Email them to customers with PDF attachments
- Track which quotes turned into orders

**TAQuotesUS does all of this in a web app.** Think of it as a specialized CRM meets spreadsheet meets email system, all tailored for selling refrigerators to businesses.

**By the numbers:**
- 2,354 products in the catalog
- 500+ users across Mexico and the US
- 5 user roles (superadmin, admin, sales, distributor, logistics)
- 11 quality sessions with 300+ bug fixes

---

## The Cast of Characters (Domains)

Think of TAQuotesUS as a company with departments. Each has its own job:

### The Front Office
| Domain | Role | Think of it as... |
|--------|------|-------------------|
| **Auth** | Security guard | Checks your badge, decides what rooms you can enter |
| **Home** | Reception desk | Shows today's numbers and what needs attention |

### The Sales Floor
| Domain | Role | Think of it as... |
|--------|------|-------------------|
| **Products** | Catalog room | 2,354 refrigerators to browse |
| **Cart** | Shopping basket | Organize items by room (Kitchen, Bar, etc.) |
| **Quotes** | Proposal writer | Turns your cart into a professional document |
| **Email** | Mailroom | Sends quotes as PDFs to customers |

### Customer Relations
| Domain | Role | Think of it as... |
|--------|------|-------------------|
| **Customers** | The rolodex | Who are we selling to? |
| **Projects** | Big picture board | "Marriott Renovation" with 5 separate quotes |

### Back Office
| Domain | Role | Think of it as... |
|--------|------|-------------------|
| **OC** | Order processor | Creates official Order Confirmations with fiscal data |
| **Inventory** | Warehouse | What's in stock? |
| **Admin** | Command center | Analytics and system management |
| **Users** | HR | Who can access what? |

---

## The Greatest Hits (Lessons We Learned the Hard Way)

These are the bugs that taught us something. Each one cost time to find and fix.
Learn from our pain!

${lessons.slice(0, 10).map(lesson => generateEngagingLesson(lesson)).join('\n---\n')}

---

## Big Decisions We Made (And Why)

Every system has architectural decisions. Here are ours, explained simply:

${decisions.map(d => `
### ${d.id}: ${d.title}
**When:** ${d.date} | **Status:** ${d.status}

**The Problem:** ${d.context}

**Our Solution:** ${d.decision}

**What This Means:**
${d.consequences.map(c => `- ${c}`).join('\n')}
`).join('\n---\n')}

---

## What's Been Happening Lately

Recent changes to the system:

| Date | Change |
|------|--------|
${commits.slice(0, 10).map(c => `| ${c.date} | ${c.message} |`).join('\n')}

---

## The Gotchas (Things That Bite)

Quick reference for things that catch people off guard:

1. **The Zero Trap**: Use \`??\` not \`||\` for numbers (zero is valid!)
2. **MUI Keys**: Extract \`key\` from props in \`renderOption\`
3. **Fresh Data**: Fetch data when dialogs open, don't trust parent props
4. **Button Style**: Always \`variant="contained"\` (outlined is hard to read)
5. **Number Format**: Use \`formatCurrency()\`, never inline \`toFixed()\`
6. **Field Names**: Backend uses snake_case, frontend uses camelCase

---

## Quick Commands for Claude

When working with Claude Code on this project:

| Need | Command |
|------|---------|
| Search code | \`npm run brain:search "query"\` |
| Check impact | \`npm run brain:impact "file"\` |
| System health | \`npm run brain:health\` |
| Recall memory | \`npm run brain:recall "topic"\` |

---

*This document is auto-generated. If something's wrong, the lessons.md or decisions.md files might need updating.*
`;
}

// ============================================================================
// CLI FUNCTIONS
// ============================================================================

function checkStaleness(): { stale: boolean; reason: string } {
  const teacherMtime = getFileModTime(CONFIG.outputPath);
  const lessonsMtime = getFileModTime(CONFIG.lessonsFile);
  const decisionsMtime = getFileModTime(CONFIG.decisionsFile);

  if (!teacherMtime) {
    return { stale: true, reason: 'ClaudeTeacher.md does not exist' };
  }

  if (lessonsMtime && lessonsMtime > teacherMtime) {
    return { stale: true, reason: 'lessons.md has been updated' };
  }

  if (decisionsMtime && decisionsMtime > teacherMtime) {
    return { stale: true, reason: 'decisions.md has been updated' };
  }

  // Check age
  const daysSinceUpdate = (Date.now() - teacherMtime.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceUpdate > 7) {
    return { stale: true, reason: `Document is ${Math.floor(daysSinceUpdate)} days old` };
  }

  return { stale: false, reason: 'Document is up to date' };
}

function generateFull(): void {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    🎓 DeBra - Claude Teacher Generator                        ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);

  console.log('🔍 Reading memory files...\n');

  // Read source files
  const lessonsContent = fs.existsSync(CONFIG.lessonsFile)
    ? fs.readFileSync(CONFIG.lessonsFile, 'utf-8')
    : '';
  const factsContent = fs.existsSync(CONFIG.factsFile)
    ? fs.readFileSync(CONFIG.factsFile, 'utf-8')
    : '';
  const decisionsContent = fs.existsSync(CONFIG.decisionsFile)
    ? fs.readFileSync(CONFIG.decisionsFile, 'utf-8')
    : '';

  // Parse content
  const lessons = parseLessons(lessonsContent);
  const decisions = parseDecisions(decisionsContent);
  const commits = getRecentCommits(CONFIG.recentCommitsCount);

  console.log(`   📚 Lessons:   ${lessons.length}`);
  console.log(`   📋 Decisions: ${decisions.length}`);
  console.log(`   📝 Commits:   ${commits.length}`);
  console.log();

  // Generate document
  console.log('✍️  Generating engaging documentation...\n');
  const document = generateDocument(lessons, decisions, factsContent, commits);

  // Ensure output directory exists
  const outputDir = path.dirname(CONFIG.outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write output
  fs.writeFileSync(CONFIG.outputPath, document);

  const wordCount = document.split(/\s+/).length;
  const sectionCount = (document.match(/^## /gm) || []).length;

  console.log('═'.repeat(80));
  console.log();
  console.log(`✅ Generated: ${CONFIG.outputPath}`);
  console.log(`   📄 ${sectionCount} sections, ${wordCount} words`);
  console.log(`   👤 Written for: ${CONFIG.targetAudience}`);
  console.log();
}

function runCheck(): void {
  const result = checkStaleness();

  if (result.stale) {
    console.log(`⚠️  ClaudeTeacher.md needs update: ${result.reason}`);
    console.log('   Run: npm run brain:teacher');
    process.exit(1);
  } else {
    console.log(`✅ ClaudeTeacher.md is up to date`);
    process.exit(0);
  }
}

function explainTopic(topic: string): void {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    🎓 DeBra - Topic Explanation                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝

Topic: "${topic}"
`);

  // Read all memory files
  const lessonsContent = fs.existsSync(CONFIG.lessonsFile)
    ? fs.readFileSync(CONFIG.lessonsFile, 'utf-8')
    : '';
  const factsContent = fs.existsSync(CONFIG.factsFile)
    ? fs.readFileSync(CONFIG.factsFile, 'utf-8')
    : '';
  const decisionsContent = fs.existsSync(CONFIG.decisionsFile)
    ? fs.readFileSync(CONFIG.decisionsFile, 'utf-8')
    : '';

  const topicLower = topic.toLowerCase();

  // Find relevant lessons
  const lessons = parseLessons(lessonsContent);
  const relevantLessons = lessons.filter(l =>
    l.title.toLowerCase().includes(topicLower) ||
    l.bug.toLowerCase().includes(topicLower) ||
    l.lesson.toLowerCase().includes(topicLower)
  );

  // Find relevant decisions
  const decisions = parseDecisions(decisionsContent);
  const relevantDecisions = decisions.filter(d =>
    d.title.toLowerCase().includes(topicLower) ||
    d.context.toLowerCase().includes(topicLower) ||
    d.decision.toLowerCase().includes(topicLower)
  );

  // Find relevant facts
  const factLines = factsContent.split('\n').filter(line =>
    line.toLowerCase().includes(topicLower)
  );

  console.log(`Found: ${relevantLessons.length} lessons, ${relevantDecisions.length} decisions, ${factLines.length} facts\n`);
  console.log('═'.repeat(80));

  if (relevantLessons.length > 0) {
    console.log('\n📚 LESSONS:\n');
    for (const lesson of relevantLessons) {
      console.log(generateEngagingLesson(lesson));
    }
  }

  if (relevantDecisions.length > 0) {
    console.log('\n📋 DECISIONS:\n');
    for (const d of relevantDecisions) {
      console.log(`${d.id}: ${d.title}`);
      console.log(`   ${d.decision}`);
      console.log();
    }
  }

  if (factLines.length > 0) {
    console.log('\n📝 FACTS:\n');
    for (const fact of factLines) {
      console.log(`   ${fact}`);
    }
  }

  if (relevantLessons.length === 0 && relevantDecisions.length === 0 && factLines.length === 0) {
    console.log(`No information found about "${topic}".`);
    console.log('Try a different search term or check the memory files directly.');
  }
}

function showHelp(): void {
  console.log(`
🎓 DeBra - Claude Teacher Generator

Commands:
  npm run brain:teacher              Generate full ClaudeTeacher.md
  npm run brain:teacher --check      Check if update needed (for CI/scripts)
  npm run brain:teach "topic"        Explain specific topic

Options:
  --check        Check staleness without generating
  --topic, -t    Explain specific topic

Examples:
  npm run brain:teacher
  npm run brain:teacher --check
  npm run brain:teach "cart"
  npm run brain:teach "nullish coalescing"
`);
}

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  if (args.includes('--check')) {
    runCheck();
    return;
  }

  const topicIndex = args.indexOf('--topic');
  const shortTopicIndex = args.indexOf('-t');

  if (topicIndex !== -1 && args[topicIndex + 1]) {
    explainTopic(args[topicIndex + 1]);
    return;
  }

  if (shortTopicIndex !== -1 && args[shortTopicIndex + 1]) {
    explainTopic(args[shortTopicIndex + 1]);
    return;
  }

  // If first arg doesn't start with -, treat it as a topic
  if (args[0] && !args[0].startsWith('-')) {
    explainTopic(args.join(' '));
    return;
  }

  // Default: full generation
  generateFull();
}

main();
