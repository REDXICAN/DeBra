#!/usr/bin/env npx tsx

/**
 * DeBra - Development Brain Indexer
 * 
 * Integrates:
 * - Ollama (nomic-embed-text) for embeddings
 * - FalkorDB/Graphiti for knowledge graph
 * - Local vector storage
 * 
 * Usage: npm run debra:index
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as ts from 'typescript';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Paths
  srcDir: './src',
  debraDir: './.debra',
  vectorsDir: './.debra/vectors',
  graphDir: './.debra/graph',
  
  // Ollama
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  embedModel: process.env.EMBED_MODEL || 'nomic-embed-text',
  
  // FalkorDB
  falkorHost: process.env.FALKOR_HOST || 'localhost',
  falkorPort: parseInt(process.env.FALKOR_PORT || '6379'),
  
  // Indexing
  extensions: ['.ts', '.tsx', '.js', '.jsx'],
  ignore: ['node_modules', 'dist', '.git', 'coverage', '__tests__', '*.test.*', '*.spec.*'],
  chunkSize: 50, // lines per chunk

  // Memory files to index
  lessonsPath: './.debra/memory/lessons.md',
  
  // Domain detection
  domains: {
    auth: ['auth', 'login', 'session', 'AuthGuard'],
    home: ['home', 'HomeScreen', 'dashboard', 'KPI'],
    products: ['products', 'catalog', 'ProductCard', 'SpecSheet'],
    cart: ['cart', 'CartScreen', 'CartItem'],
    quotes: ['quotes', 'QuoteDetail', 'QuoteEmail'],
    email: ['email', 'EmailDialog', 'BulkSend', 'Resend'],
    customers: ['clients', 'customers', 'ClientDetail', 'CustomerCard'],
    projects: ['projects', 'ProjectDetail'],
    oc: ['order-confirmation', 'OrderConfirmation', 'OC'],
    inventory: ['inventory', 'stock', 'StockTab', 'warehouse'],
    admin: ['admin', 'AdminDashboard'],
    users: ['users', 'UserCard', 'UserDetails'],
    i18n: ['i18n', 'locale', 'translation'],
    ui: ['components', 'theme', 'styles', 'Button', 'Card'],
    backend: ['api', 'service', 'controller', 'routes'],
    tester: ['test', 'spec', 'e2e', 'playwright'],
  },
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
  type: ChunkType;
  domain: string;
  exports: string[];
  imports: string[];
  embedding?: number[];
  hash: string;
}

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

type ChunkType = 'component' | 'hook' | 'service' | 'store' | 'type' | 'util' | 'test' | 'screen' | 'lesson' | 'other';

// TypeScript Compiler API Types
interface TSCompilerContext {
  program: ts.Program;
  checker: ts.TypeChecker;
  pathAliases: Map<string, string>;
}

interface ImportInfo {
  moduleSpecifier: string;
  resolvedPath: string | null;
  importedNames: string[];
  isTypeOnly: boolean;
  line: number;
}

interface ExportInfo {
  name: string;
  kind: 'function' | 'component' | 'hook' | 'type' | 'interface' | 'const' | 'class';
  isDefault: boolean;
  line: number;
}

interface CallInfo {
  callerName: string;
  calleeName: string;
  calleeModule: string | null;
  line: number;
}

// ============================================================================
// UTILITIES
// ============================================================================

function log(msg: string, level: 'info' | 'success' | 'warn' | 'error' = 'info') {
  const icons = { info: '🔵', success: '✅', warn: '⚠️', error: '❌' };
  console.log(`${icons[level]} ${msg}`);
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function hashContent(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
}

// ============================================================================
// DOMAIN & TYPE DETECTION
// ============================================================================

function detectDomain(filePath: string, content: string): string {
  const lowerPath = filePath.toLowerCase();
  const lowerContent = content.toLowerCase();
  
  for (const [domain, patterns] of Object.entries(CONFIG.domains)) {
    if (patterns.some(p => lowerPath.includes(p.toLowerCase()) || lowerContent.includes(p.toLowerCase()))) {
      return domain;
    }
  }
  
  return 'other';
}

function detectChunkType(content: string, filePath: string): ChunkType {
  if (filePath.includes('.test.') || filePath.includes('.spec.')) return 'test';
  if (filePath.includes('Screen')) return 'screen';
  if (content.match(/export\s+(function|const)\s+use[A-Z]/)) return 'hook';
  if (filePath.includes('store') || content.includes('create(')) return 'store';
  if (filePath.includes('service') || filePath.includes('api')) return 'service';
  if (content.match(/export\s+(type|interface)/)) return 'type';
  if (filePath.includes('utils') || filePath.includes('helpers')) return 'util';
  if (content.match(/export\s+(default\s+)?function/) || content.includes('React.FC')) return 'component';
  return 'other';
}

// ============================================================================
// TYPESCRIPT COMPILER API
// ============================================================================

function initTypeScriptCompiler(): TSCompilerContext | null {
  try {
    // Find tsconfig.app.json
    const configPath = ts.findConfigFile('./', ts.sys.fileExists, 'tsconfig.app.json');
    if (!configPath) {
      log('Could not find tsconfig.app.json, falling back to regex', 'warn');
      return null;
    }

    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    if (configFile.error) {
      log('Error reading tsconfig.app.json', 'warn');
      return null;
    }

    const parsedConfig = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(configPath)
    );

    // Build path alias map
    const pathAliases = new Map<string, string>();
    const paths = parsedConfig.options.paths || {};
    const baseUrl = parsedConfig.options.baseUrl || '.';

    for (const [alias, targets] of Object.entries(paths)) {
      const aliasPrefix = alias.replace('/*', '/');
      const targetPrefix = (targets as string[])[0].replace('/*', '/');
      pathAliases.set(aliasPrefix, path.resolve(baseUrl, targetPrefix));
    }

    // Create program
    const program = ts.createProgram(parsedConfig.fileNames, {
      ...parsedConfig.options,
      noEmit: true,
    });

    return {
      program,
      checker: program.getTypeChecker(),
      pathAliases,
    };
  } catch (error) {
    log(`TypeScript compiler init failed: ${error}`, 'warn');
    return null;
  }
}

function resolveImportPath(
  moduleSpecifier: string,
  containingFile: string,
  ctx: TSCompilerContext
): string | null {
  // Skip external modules
  if (!moduleSpecifier.startsWith('.') && !moduleSpecifier.startsWith('@')) {
    return null;
  }

  // Skip node_modules packages
  if (moduleSpecifier.startsWith('@mui') || moduleSpecifier.startsWith('@reduxjs') ||
      moduleSpecifier.startsWith('@emotion') || moduleSpecifier.startsWith('react') ||
      moduleSpecifier.startsWith('@testing-library') || moduleSpecifier.startsWith('i18next')) {
    return null;
  }

  const cwd = process.cwd();

  // Handle path aliases (@/, @app/, etc.)
  for (const [alias, targetDir] of ctx.pathAliases) {
    if (moduleSpecifier.startsWith(alias)) {
      const relativePart = moduleSpecifier.slice(alias.length);
      const candidates = [
        path.join(targetDir, relativePart + '.ts'),
        path.join(targetDir, relativePart + '.tsx'),
        path.join(targetDir, relativePart, 'index.ts'),
        path.join(targetDir, relativePart, 'index.tsx'),
      ];

      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          // Convert to relative path to match our file list
          const relativePath = path.relative(cwd, candidate);
          return path.normalize(relativePath);
        }
      }
    }
  }

  // Handle relative imports
  if (moduleSpecifier.startsWith('.')) {
    const dir = path.dirname(containingFile);
    const candidates = [
      path.join(dir, moduleSpecifier + '.ts'),
      path.join(dir, moduleSpecifier + '.tsx'),
      path.join(dir, moduleSpecifier, 'index.ts'),
      path.join(dir, moduleSpecifier, 'index.tsx'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        // Convert to relative path to match our file list
        const relativePath = path.relative(cwd, candidate);
        return path.normalize(relativePath);
      }
    }
  }

  return null;
}

function extractImportsAST(sourceFile: ts.SourceFile, ctx: TSCompilerContext): ImportInfo[] {
  const imports: ImportInfo[] = [];

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text;
      const importedNames: string[] = [];
      const isTypeOnly = node.importClause?.isTypeOnly ?? false;

      if (node.importClause) {
        // Default import
        if (node.importClause.name) {
          importedNames.push(node.importClause.name.text);
        }

        // Named imports { A, B }
        if (node.importClause.namedBindings) {
          if (ts.isNamedImports(node.importClause.namedBindings)) {
            for (const element of node.importClause.namedBindings.elements) {
              importedNames.push(element.name.text);
            }
          }
          // Namespace import * as X
          if (ts.isNamespaceImport(node.importClause.namedBindings)) {
            importedNames.push(node.importClause.namedBindings.name.text);
          }
        }
      }

      imports.push({
        moduleSpecifier,
        resolvedPath: resolveImportPath(moduleSpecifier, sourceFile.fileName, ctx),
        importedNames,
        isTypeOnly,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return imports;
}

function extractExportsAST(sourceFile: ts.SourceFile): ExportInfo[] {
  const exports: ExportInfo[] = [];

  function visit(node: ts.Node) {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    const isExported = modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    const isDefault = modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword);

    if (!isExported) {
      ts.forEachChild(node, visit);
      return;
    }

    let name: string | undefined;
    let kind: ExportInfo['kind'] = 'const';

    if (ts.isFunctionDeclaration(node) && node.name) {
      name = node.name.text;
      kind = name.startsWith('use') ? 'hook' :
             /^[A-Z]/.test(name) ? 'component' : 'function';
    } else if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          name = decl.name.text;
          if (decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
            kind = name.startsWith('use') ? 'hook' :
                   /^[A-Z]/.test(name) ? 'component' : 'function';
          }
        }
      }
    } else if (ts.isTypeAliasDeclaration(node)) {
      name = node.name.text;
      kind = 'type';
    } else if (ts.isInterfaceDeclaration(node)) {
      name = node.name.text;
      kind = 'interface';
    } else if (ts.isClassDeclaration(node) && node.name) {
      name = node.name.text;
      kind = 'class';
    }

    if (name) {
      exports.push({
        name,
        kind,
        isDefault: isDefault ?? false,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return exports;
}

function extractCallsAST(
  sourceFile: ts.SourceFile,
  imports: ImportInfo[]
): CallInfo[] {
  const calls: CallInfo[] = [];

  // Build map of imported names to their source files
  const importMap = new Map<string, string>();
  for (const imp of imports) {
    if (imp.resolvedPath) {
      for (const name of imp.importedNames) {
        importMap.set(name, imp.resolvedPath);
      }
    }
  }

  let currentFunction: string | null = null;

  function visit(node: ts.Node) {
    // Track current function context
    if (ts.isFunctionDeclaration(node) && node.name) {
      currentFunction = node.name.text;
    } else if (ts.isVariableDeclaration(node) &&
               ts.isIdentifier(node.name) &&
               node.initializer &&
               (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      currentFunction = node.name.text;
    }

    // Detect function calls
    if (ts.isCallExpression(node) && currentFunction) {
      let calleeName: string | null = null;

      // Simple call: functionName()
      if (ts.isIdentifier(node.expression)) {
        calleeName = node.expression.text;
      }
      // Method call: service.getProducts()
      else if (ts.isPropertyAccessExpression(node.expression)) {
        const obj = node.expression.expression;
        const method = node.expression.name.text;

        if (ts.isIdentifier(obj)) {
          calleeName = `${obj.text}.${method}`;
        }
      }

      if (calleeName) {
        const baseCallee = calleeName.split('.')[0];
        const calleeModule = importMap.get(baseCallee) || null;

        if (calleeModule) {
          calls.push({
            callerName: currentFunction,
            calleeName,
            calleeModule,
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return calls;
}

function buildGraphFromAST(
  ctx: TSCompilerContext,
  files: string[]
): { nodes: GraphNode[], edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIdMap = new Map<string, string>();
  const fileExportsMap = new Map<string, ExportInfo[]>();
  const fileImportsMap = new Map<string, ImportInfo[]>();

  // Phase 1: Extract all exports and create nodes
  for (const file of files) {
    const sourceFile = ctx.program.getSourceFile(path.resolve(file));
    if (!sourceFile) continue;

    const content = fs.readFileSync(file, 'utf-8');
    const domain = detectDomain(file, content);

    const exports = extractExportsAST(sourceFile);
    const imports = extractImportsAST(sourceFile, ctx);

    fileExportsMap.set(path.normalize(file), exports);
    fileImportsMap.set(path.normalize(file), imports);

    for (const exp of exports) {
      const nodeId = `${file}:${exp.name}`;
      const nodeType = exp.kind === 'component' ? 'component' :
                       exp.kind === 'hook' ? 'hook' :
                       exp.kind === 'type' || exp.kind === 'interface' ? 'type' :
                       'function';

      nodes.push({
        id: nodeId,
        type: nodeType,
        name: exp.name,
        file: file,
        domain: domain,
        line: exp.line,
      });
      nodeIdMap.set(nodeId, nodeId);
    }
  }

  // Phase 2: Create edges from imports
  for (const file of files) {
    const normalizedFile = path.normalize(file);
    const imports = fileImportsMap.get(normalizedFile);
    const sourceExports = fileExportsMap.get(normalizedFile);

    if (!imports || !sourceExports) continue;

    for (const imp of imports) {
      if (!imp.resolvedPath) continue;

      const targetExports = fileExportsMap.get(imp.resolvedPath);
      if (!targetExports) continue;

      for (const importedName of imp.importedNames) {
        const targetExport = targetExports.find(e => e.name === importedName);
        if (!targetExport) continue;

        const toNodeId = `${imp.resolvedPath}:${importedName}`;

        // Create edge from file-level (all exports in this file import from target)
        for (const sourceExport of sourceExports) {
          const fromNodeId = `${file}:${sourceExport.name}`;

          if (nodeIdMap.has(fromNodeId) && nodeIdMap.has(toNodeId)) {
            edges.push({
              from: fromNodeId,
              to: toNodeId,
              type: imp.isTypeOnly ? 'uses' : 'imports',
            });
          }
        }
      }
    }

    // Phase 3: Create edges from function calls
    const sourceFile = ctx.program.getSourceFile(path.resolve(file));
    if (!sourceFile) continue;

    const calls = extractCallsAST(sourceFile, imports || []);

    for (const call of calls) {
      if (!call.calleeModule) continue;

      const callerExport = sourceExports?.find(e => e.name === call.callerName);
      if (!callerExport) continue;

      const fromNodeId = `${file}:${call.callerName}`;
      const baseCallee = call.calleeName.split('.')[0];
      const toNodeId = `${call.calleeModule}:${baseCallee}`;

      if (nodeIdMap.has(fromNodeId) && nodeIdMap.has(toNodeId)) {
        edges.push({
          from: fromNodeId,
          to: toNodeId,
          type: 'calls',
        });
      }
    }
  }

  // Deduplicate edges
  const uniqueEdges = Array.from(
    new Map(edges.map(e => [`${e.from}->${e.to}:${e.type}`, e])).values()
  );

  return { nodes, edges: uniqueEdges };
}

// ============================================================================
// EXPORT/IMPORT EXTRACTION (Legacy - fallback when TS compiler not available)
// ============================================================================

function extractExports(content: string): string[] {
  const exports: string[] = [];

  // Named exports: export const/function/class Name
  const namedExports = content.matchAll(/export\s+(?:const|function|class|type|interface)\s+(\w+)/g);
  for (const match of namedExports) {
    exports.push(match[1]);
  }
  
  // Default exports
  const defaultExport = content.match(/export\s+default\s+(?:function\s+)?(\w+)/);
  if (defaultExport) {
    exports.push(defaultExport[1]);
  }
  
  return exports;
}

function extractImports(content: string): string[] {
  const imports: string[] = [];
  
  // import { x } from 'y' or import x from 'y'
  const importMatches = content.matchAll(/import\s+(?:{[^}]+}|\w+)\s+from\s+['"]([^'"]+)['"]/g);
  for (const match of importMatches) {
    imports.push(match[1]);
  }
  
  return imports;
}

// ============================================================================
// FILE PROCESSING
// ============================================================================

function getAllFiles(dir: string, files: string[] = []): string[] {
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    
    // Check ignore patterns
    if (CONFIG.ignore.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(item) || regex.test(fullPath);
      }
      return item === pattern || fullPath.includes(pattern);
    })) {
      continue;
    }
    
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      getAllFiles(fullPath, files);
    } else if (CONFIG.extensions.some(ext => item.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  
  return files;
}

function chunkFile(filePath: string): Omit<CodeChunk, 'embedding'>[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const chunks: Omit<CodeChunk, 'embedding'>[] = [];
  const domain = detectDomain(filePath, content);
  
  // Try to chunk by exports/functions
  const exportMatches = Array.from(content.matchAll(
    /export\s+(default\s+)?(function|const|class|type|interface)\s+(\w+)/g
  )).map(m => ({
    name: m[3],
    index: m.index!,
    line: content.substring(0, m.index!).split('\n').length
  }));
  
  if (exportMatches.length > 1) {
    // Chunk by exports
    for (let i = 0; i < exportMatches.length; i++) {
      const start = exportMatches[i].line;
      const end = i < exportMatches.length - 1 
        ? exportMatches[i + 1].line - 1 
        : lines.length;
      
      const chunkContent = lines.slice(start - 1, end).join('\n');
      const chunkHash = hashContent(chunkContent);
      
      chunks.push({
        id: `${filePath}:${start}-${end}`,
        file: filePath,
        startLine: start,
        endLine: end,
        content: chunkContent,
        type: detectChunkType(chunkContent, filePath),
        domain,
        exports: extractExports(chunkContent),
        imports: extractImports(chunkContent),
        hash: chunkHash,
      });
    }
  } else {
    // Chunk by line count
    for (let i = 0; i < lines.length; i += CONFIG.chunkSize) {
      const start = i + 1;
      const end = Math.min(i + CONFIG.chunkSize, lines.length);
      const chunkContent = lines.slice(i, end).join('\n');
      
      if (chunkContent.trim().length > 0) {
        const chunkHash = hashContent(chunkContent);
        
        chunks.push({
          id: `${filePath}:${start}-${end}`,
          file: filePath,
          startLine: start,
          endLine: end,
          content: chunkContent,
          type: detectChunkType(chunkContent, filePath),
          domain,
          exports: extractExports(chunkContent),
          imports: extractImports(chunkContent),
          hash: chunkHash,
        });
      }
    }
  }
  
  return chunks;
}

// ============================================================================
// LESSON PARSING
// ============================================================================

interface LessonChunk {
  id: string;
  file: string;
  startLine: number;
  endLine: number;
  content: string;
  type: ChunkType;
  domain: string;
  exports: string[];
  imports: string[];
  hash: string;
  lessonNumber: number;
  lessonTitle: string;
  tags: string[];
}

function parseLessons(): Omit<LessonChunk, 'embedding'>[] {
  if (!fs.existsSync(CONFIG.lessonsPath)) {
    log('No lessons.md found, skipping lesson indexing', 'warn');
    return [];
  }

  const content = fs.readFileSync(CONFIG.lessonsPath, 'utf-8');
  // Normalize line endings (handle CRLF from Windows)
  const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalizedContent.split('\n');
  const lessons: Omit<LessonChunk, 'embedding'>[] = [];

  // Parse lessons by ## Lesson N: Title pattern
  const lessonRegex = /^## Lesson (\d+): (.+)$/;
  let currentLesson: {
    number: number;
    title: string;
    startLine: number;
    lines: string[];
  } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(lessonRegex);

    if (match) {
      // Save previous lesson if exists
      if (currentLesson && currentLesson.lines.length > 0) {
        const lessonContent = currentLesson.lines.join('\n').trim();
        const domain = detectDomainFromLesson(lessonContent, currentLesson.title);
        const tags = extractLessonTags(lessonContent, currentLesson.title);

        lessons.push({
          id: `lessons.md:lesson-${currentLesson.number}`,
          file: CONFIG.lessonsPath,
          startLine: currentLesson.startLine,
          endLine: i,
          content: `## Lesson ${currentLesson.number}: ${currentLesson.title}\n${lessonContent}`,
          type: 'lesson',
          domain,
          exports: [`Lesson ${currentLesson.number}`],
          imports: [],
          hash: hashContent(lessonContent),
          lessonNumber: currentLesson.number,
          lessonTitle: currentLesson.title,
          tags,
        });
      }

      // Start new lesson
      currentLesson = {
        number: parseInt(match[1]),
        title: match[2],
        startLine: i + 1,
        lines: [],
      };
    } else if (currentLesson && line !== '---') {
      currentLesson.lines.push(line);
    }
  }

  // Don't forget the last lesson
  if (currentLesson && currentLesson.lines.length > 0) {
    const lessonContent = currentLesson.lines.join('\n').trim();
    const domain = detectDomainFromLesson(lessonContent, currentLesson.title);
    const tags = extractLessonTags(lessonContent, currentLesson.title);

    lessons.push({
      id: `lessons.md:lesson-${currentLesson.number}`,
      file: CONFIG.lessonsPath,
      startLine: currentLesson.startLine,
      endLine: lines.length,
      content: `## Lesson ${currentLesson.number}: ${currentLesson.title}\n${lessonContent}`,
      type: 'lesson',
      domain,
      exports: [`Lesson ${currentLesson.number}`],
      imports: [],
      hash: hashContent(lessonContent),
      lessonNumber: currentLesson.number,
      lessonTitle: currentLesson.title,
      tags,
    });
  }

  return lessons;
}

function detectDomainFromLesson(content: string, title: string): string {
  const combined = `${title} ${content}`.toLowerCase();

  // Domain keywords - more specific checks
  const domainKeywords: Record<string, string[]> = {
    cart: ['cart', 'room', 'add to cart', 'cartscreen', 'cartitem'],
    quotes: ['quote', 'quoteedit', 'quotecreate', 'line total', 'markup', 'discount'],
    email: ['email', 'resend', 'emaildialog', 'recipient', 'attachment'],
    clients: ['client', 'customer', 'contact', 'validation', 'clientform'],
    products: ['product', 'catalog', 'sku', 'specsheet'],
    auth: ['auth', 'login', 'jwt', 'token', 'password'],
    backend: ['backend', 'controller', 'api', 'database', 'mysql', 'parameter'],
    ui: ['ui', 'component', 'mui', 'material', 'autocomplete', 'dialog', 'input'],
    admin: ['admin', 'user management', 'superadmin'],
    projects: ['project', 'projectdetail'],
  };

  for (const [domain, keywords] of Object.entries(domainKeywords)) {
    if (keywords.some(k => combined.includes(k))) {
      return domain;
    }
  }

  return 'general';
}

function extractLessonTags(content: string, title: string): string[] {
  const tags: string[] = [];
  const combined = `${title} ${content}`.toLowerCase();

  // Extract common bug patterns
  if (combined.includes('typescript') || combined.includes('type error')) tags.push('typescript');
  if (combined.includes('null') || combined.includes('undefined')) tags.push('null-safety');
  if (combined.includes('mapping') || combined.includes('field name')) tags.push('data-mapping');
  if (combined.includes('state') || combined.includes('redux')) tags.push('state-management');
  if (combined.includes('api') || combined.includes('fetch')) tags.push('api');
  if (combined.includes('mui') || combined.includes('material')) tags.push('mui');
  if (combined.includes('validation')) tags.push('validation');
  if (combined.includes('calculation') || combined.includes('math')) tags.push('calculations');
  if (combined.includes('format') || combined.includes('currency')) tags.push('formatting');
  if (combined.includes('json') || combined.includes('parse')) tags.push('json');

  return tags;
}

// ============================================================================
// GRAPH BUILDING
// ============================================================================

function buildGraph(chunks: CodeChunk[]): { nodes: GraphNode[], edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();
  
  // Create nodes from exports
  for (const chunk of chunks) {
    for (const exportName of chunk.exports) {
      const nodeId = `${chunk.file}:${exportName}`;
      
      if (!nodeIds.has(nodeId)) {
        nodes.push({
          id: nodeId,
          type: chunk.type === 'hook' ? 'hook' : 
                chunk.type === 'component' ? 'component' :
                chunk.type === 'type' ? 'type' : 'function',
          name: exportName,
          file: chunk.file,
          domain: chunk.domain,
          line: chunk.startLine,
        });
        nodeIds.add(nodeId);
      }
    }
  }
  
  // Create edges from imports
  for (const chunk of chunks) {
    for (const importPath of chunk.imports) {
      // Resolve relative imports
      if (importPath.startsWith('.')) {
        const resolvedPath = path.resolve(path.dirname(chunk.file), importPath);
        
        // Find matching node
        for (const node of nodes) {
          if (node.file.startsWith(resolvedPath) || node.file.includes(importPath.replace('./', ''))) {
            for (const exportName of chunk.exports) {
              const fromId = `${chunk.file}:${exportName}`;
              if (nodeIds.has(fromId)) {
                edges.push({
                  from: fromId,
                  to: node.id,
                  type: 'imports',
                });
              }
            }
          }
        }
      }
    }
  }
  
  return { nodes, edges };
}

// ============================================================================
// OLLAMA INTEGRATION
// ============================================================================

async function checkOllama(): Promise<boolean> {
  try {
    const response = await fetch(`${CONFIG.ollamaUrl}/api/tags`);
    if (!response.ok) return false;
    
    const data = await response.json();
    const hasModel = data.models?.some((m: any) => m.name.includes(CONFIG.embedModel));
    
    if (!hasModel) {
      log(`Model ${CONFIG.embedModel} not found. Run: ollama pull ${CONFIG.embedModel}`, 'warn');
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

async function getEmbedding(text: string): Promise<number[]> {
  try {
    const response = await fetch(`${CONFIG.ollamaUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CONFIG.embedModel,
        prompt: text.substring(0, 8000), // Limit context
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.embedding;
  } catch (error) {
    console.error('Embedding error:', error);
    return [];
  }
}

// ============================================================================
// FALKORDB INTEGRATION (Optional)
// ============================================================================

async function checkFalkor(): Promise<boolean> {
  // Check if FalkorDB is running by trying to connect
  try {
    // Simple TCP check - in production you'd use a proper Redis client
    const net = await import('net');
    
    return new Promise((resolve) => {
      const socket = new net.Socket();
      
      socket.setTimeout(1000);
      
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      
      socket.on('error', () => {
        resolve(false);
      });
      
      socket.connect(CONFIG.falkorPort, CONFIG.falkorHost);
    });
  } catch {
    return false;
  }
}

// ============================================================================
// MAIN INDEXING FUNCTION
// ============================================================================

async function indexCodebase() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                     🧠 DeBra - Development Brain Indexer                      ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);
  
  // Ensure directories exist
  ensureDir(CONFIG.debraDir);
  ensureDir(CONFIG.vectorsDir);
  ensureDir(CONFIG.graphDir);
  ensureDir(path.join(CONFIG.debraDir, 'memory'));
  ensureDir(path.join(CONFIG.debraDir, 'logs'));
  
  // Check tool availability
  console.log('🔍 Checking tools...\n');
  
  const ollamaReady = await checkOllama();
  if (ollamaReady) {
    log('Ollama is running with ' + CONFIG.embedModel, 'success');
  } else {
    log('Ollama not available. Run: ollama serve && ollama pull ' + CONFIG.embedModel, 'warn');
  }
  
  const falkorReady = await checkFalkor();
  if (falkorReady) {
    log('FalkorDB is running', 'success');
  } else {
    log('FalkorDB not available. Run: docker run -d -p 6379:6379 -p 3000:3000 falkordb/falkordb:latest', 'warn');
  }
  
  console.log();
  
  // Get all files
  log(`Scanning ${CONFIG.srcDir}...`);
  const files = getAllFiles(CONFIG.srcDir);
  log(`Found ${files.length} files`, 'success');
  
  // Load existing vectors for incremental updates
  let existingHashes: Record<string, string> = {};
  let existingVectorMap: Map<string, CodeChunk> = new Map();
  const cacheFile = path.join(CONFIG.vectorsDir, 'cache.json');
  const vectorsPath = path.join(CONFIG.vectorsDir, 'vectors.json');

  if (fs.existsSync(cacheFile)) {
    existingHashes = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    log(`Loaded ${Object.keys(existingHashes).length} cached hashes`);
  }

  // Load existing vectors to reuse cached embeddings
  if (fs.existsSync(vectorsPath)) {
    try {
      const existingVectors: CodeChunk[] = JSON.parse(fs.readFileSync(vectorsPath, 'utf-8'));
      for (const v of existingVectors) {
        existingVectorMap.set(v.id, v);
      }
      log(`Loaded ${existingVectorMap.size} existing vectors`);
    } catch {
      log('Could not load existing vectors, will regenerate all', 'warn');
    }
  }
  
  // Process files
  console.log('\n🔄 Processing files...\n');
  
  const allChunks: CodeChunk[] = [];
  let processed = 0;
  let skipped = 0;
  let newChunks = 0;
  
  for (const file of files) {
    const chunks = chunkFile(file);
    
    for (const chunk of chunks) {
      // Check if chunk has changed
      if (existingHashes[chunk.id] === chunk.hash && existingVectorMap.has(chunk.id)) {
        // Reuse existing vector with cached embedding
        const cachedChunk = existingVectorMap.get(chunk.id)!;
        allChunks.push(cachedChunk);
        skipped++;
        continue;
      }

      // Get new embedding
      if (ollamaReady) {
        const embedding = await getEmbedding(chunk.content);
        allChunks.push({ ...chunk, embedding });
        newChunks++;
      } else {
        allChunks.push({ ...chunk, embedding: [] });
        newChunks++;
      }

      // Update cache
      existingHashes[chunk.id] = chunk.hash;
    }
    
    processed++;
    process.stdout.write(`\r   Files: ${processed}/${files.length} | Chunks: ${allChunks.length} | New: ${newChunks} | Cached: ${skipped}`);
  }

  console.log('\n');

  // Process lessons from memory
  console.log('📚 Processing lessons...\n');
  const lessonChunks = parseLessons();
  let lessonsNew = 0;
  let lessonsCached = 0;

  for (const lesson of lessonChunks) {
    // Check if lesson has changed
    if (existingHashes[lesson.id] === lesson.hash && existingVectorMap.has(lesson.id)) {
      const cachedLesson = existingVectorMap.get(lesson.id)!;
      allChunks.push(cachedLesson);
      lessonsCached++;
      continue;
    }

    // Get new embedding for lesson
    if (ollamaReady) {
      const embedding = await getEmbedding(lesson.content);
      allChunks.push({ ...lesson, embedding });
      lessonsNew++;
    } else {
      allChunks.push({ ...lesson, embedding: [] });
      lessonsNew++;
    }

    // Update cache
    existingHashes[lesson.id] = lesson.hash;
  }

  log(`Lessons: ${lessonChunks.length} total | ${lessonsNew} new | ${lessonsCached} cached`, 'success');
  console.log();

  // Initialize TypeScript Compiler for AST-based graph building
  log('Initializing TypeScript compiler...');
  const tsContext = initTypeScriptCompiler();

  // Build knowledge graph
  log('Building knowledge graph...');
  let graph: { nodes: GraphNode[], edges: GraphEdge[] };

  if (tsContext) {
    // Use AST-based graph building for accurate import/call tracking
    log('Using TypeScript Compiler API for graph building', 'success');
    graph = buildGraphFromAST(tsContext, files);
  } else {
    // Fallback to regex-based (legacy)
    log('Falling back to regex-based graph building', 'warn');
    graph = buildGraph(allChunks);
  }

  log(`Graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges`, 'success');
  
  // Save vectors
  fs.writeFileSync(vectorsPath, JSON.stringify(allChunks, null, 2));
  log(`Saved vectors to ${vectorsPath}`, 'success');
  
  // Save cache
  fs.writeFileSync(cacheFile, JSON.stringify(existingHashes, null, 2));
  
  // Save graph
  const nodesPath = path.join(CONFIG.graphDir, 'nodes.json');
  const edgesPath = path.join(CONFIG.graphDir, 'edges.json');
  fs.writeFileSync(nodesPath, JSON.stringify(graph.nodes, null, 2));
  fs.writeFileSync(edgesPath, JSON.stringify(graph.edges, null, 2));
  log(`Saved graph to ${CONFIG.graphDir}`, 'success');
  
  // Generate metadata
  const domainCounts: Record<string, number> = {};
  const typeCounts: Record<string, number> = {};
  
  for (const chunk of allChunks) {
    domainCounts[chunk.domain] = (domainCounts[chunk.domain] || 0) + 1;
    typeCounts[chunk.type] = (typeCounts[chunk.type] || 0) + 1;
  }
  
  const lessonCount = lessonChunks.length;
  const metadata = {
    indexedAt: new Date().toISOString(),
    totalFiles: files.length,
    totalChunks: allChunks.length,
    totalLessons: lessonCount,
    domains: domainCounts,
    types: typeCounts,
    graphNodes: graph.nodes.length,
    graphEdges: graph.edges.length,
    ollamaEnabled: ollamaReady,
    falkorEnabled: falkorReady,
    tsCompilerEnabled: tsContext !== null,
    graphMode: tsContext ? 'ast' : 'regex',
  };

  const metadataPath = path.join(CONFIG.vectorsDir, 'metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  // Summary
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                              📊 INDEX SUMMARY                                 ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║   Files:     ${String(files.length).padEnd(6)} │ Chunks:  ${String(allChunks.length).padEnd(6)} │ Lessons: ${String(lessonCount).padEnd(6)}    ║
║   Nodes:     ${String(graph.nodes.length).padEnd(6)} │ Edges:   ${String(graph.edges.length).padEnd(6)} (${tsContext ? 'AST' : 'regex'})                    ║
║                                                                               ║
║   Domains:   ${Object.entries(domainCounts).slice(0, 5).map(([k, v]) => `${k}(${v})`).join(', ').padEnd(50)}║
║   Types:     ${Object.entries(typeCounts).slice(0, 5).map(([k, v]) => `${k}(${v})`).join(', ').padEnd(50)}║
║                                                                               ║
║   Ollama:    ${(ollamaReady ? '✅ Enabled' : '⬜ Disabled').padEnd(14)} │ TS Compiler: ${(tsContext ? '✅ AST' : '⬜ Regex').padEnd(11)}  ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);
  
  log('Indexing complete!', 'success');
}

// Run
indexCodebase().catch(console.error);
