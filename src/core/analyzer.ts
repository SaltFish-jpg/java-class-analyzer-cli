import { spawn } from 'node:child_process';
import path from 'node:path';
import type { ClassResolution } from './class-lookup.js';
import type { ClassIndexEntry, ProjectClassIndex } from './project-index.js';

export interface ClassField {
  name: string;
  type: string;
  modifiers: string[];
  signature: string;
}

export interface ClassMethod {
  name: string;
  returnType?: string;
  parameters: string[];
  modifiers: string[];
  signature: string;
  constructor: boolean;
}

export interface ClassAnalysis {
  className: string;
  packageName: string;
  declaration?: string;
  modifiers: string[];
  kind?: 'class' | 'interface' | 'enum' | 'record' | '@interface';
  superClass?: string;
  interfaces: string[];
  fields: ClassField[];
  methods: ClassMethod[];
  constructors: ClassMethod[];
  jar: ClassIndexEntry;
  conflicts: ClassIndexEntry[];
  raw: string;
}

export async function analyzeClass(index: ProjectClassIndex, resolution: ClassResolution): Promise<ClassAnalysis> {
  const stdout = await runJavap(index.classpath, resolution.className);
  return parseJavapOutput(stdout, resolution);
}

export function formatAnalysisText(analysis: ClassAnalysis): string {
  const lines: string[] = [];
  lines.push(`Class: ${analysis.className}`);
  lines.push(`Package: ${analysis.packageName || '(default)'}`);
  lines.push(`Jar: ${analysis.jar.coordinate ?? path.normalize(analysis.jar.jarPath)}`);

  if (analysis.conflicts.length) {
    lines.push(`Conflicts: ${analysis.conflicts.length} lower-priority classpath entr${analysis.conflicts.length === 1 ? 'y' : 'ies'}`);
  }

  if (analysis.declaration) {
    lines.push('');
    lines.push(analysis.declaration);
  }

  if (analysis.fields.length) {
    lines.push('');
    lines.push(`Fields (${analysis.fields.length})`);
    for (const field of analysis.fields) {
      lines.push(`  ${field.signature}`);
    }
  }

  if (analysis.constructors.length) {
    lines.push('');
    lines.push(`Constructors (${analysis.constructors.length})`);
    for (const constructor of analysis.constructors) {
      lines.push(`  ${constructor.signature}`);
    }
  }

  if (analysis.methods.length) {
    lines.push('');
    lines.push(`Methods (${analysis.methods.length})`);
    for (const method of analysis.methods) {
      lines.push(`  ${method.signature}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

export function formatSignatures(analysis: ClassAnalysis): string {
  const lines: string[] = [];

  if (analysis.declaration) {
    lines.push(analysis.declaration);
  }

  for (const field of analysis.fields) {
    lines.push(field.signature);
  }

  for (const constructor of analysis.constructors) {
    lines.push(constructor.signature);
  }

  for (const method of analysis.methods) {
    lines.push(method.signature);
  }

  return `${lines.join('\n')}\n`;
}

function runJavap(classpath: string[], className: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const javap = getJavapCommand();
    const child = spawn(javap, ['-classpath', classpath.join(path.delimiter), '-p', className], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to start javap: ${error.message}`));
    });

    child.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        resolve(stdout);
        return;
      }

      reject(new Error(`javap failed with exit code ${code}${stderr.trim() ? `\n${stderr.trim()}` : ''}`));
    });
  });
}

function parseJavapOutput(output: string, resolution: ClassResolution): ClassAnalysis {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line !== '{' && line !== '}');

  const declaration = lines.find(isTypeDeclaration);
  const packageName = packageNameOf(resolution.className);
  const analysis: ClassAnalysis = {
    className: resolution.className,
    packageName,
    declaration,
    modifiers: declaration ? parseModifiers(declaration) : [],
    kind: declaration ? parseKind(declaration) : undefined,
    superClass: declaration ? parseSuperClass(declaration) : undefined,
    interfaces: declaration ? parseInterfaces(declaration) : [],
    fields: [],
    methods: [],
    constructors: [],
    jar: resolution.selected,
    conflicts: resolution.conflicts,
    raw: output,
  };

  for (const line of lines) {
    if (line.startsWith('Compiled from') || line === declaration || !line.endsWith(';')) {
      continue;
    }

    const signature = line.slice(0, -1);
    if (signature.includes('(') && signature.includes(')')) {
      const method = parseMethod(signature, resolution.className);
      if (method.constructor) {
        analysis.constructors.push(method);
      } else {
        analysis.methods.push(method);
      }
    } else {
      analysis.fields.push(parseField(signature));
    }
  }

  return analysis;
}

function isTypeDeclaration(line: string): boolean {
  return /\b(class|interface|enum|record|@interface)\b/.test(line) && !line.endsWith(';');
}

function parseModifiers(signature: string): string[] {
  return signature.match(/\b(public|private|protected|static|final|abstract|strictfp|sealed|non-sealed)\b/g) ?? [];
}

function parseKind(signature: string): ClassAnalysis['kind'] {
  if (signature.includes('@interface')) {
    return '@interface';
  }

  const match = signature.match(/\b(class|interface|enum|record)\b/);
  return match?.[1] as ClassAnalysis['kind'];
}

function parseSuperClass(signature: string): string | undefined {
  const match = signature.match(/\bextends\s+([^\s{]+(?:<[^>]+>)?)/);
  return match?.[1];
}

function parseInterfaces(signature: string): string[] {
  const match = signature.match(/\bimplements\s+(.+)$/);
  if (!match) {
    return [];
  }

  return splitTopLevel(match[1], ',').map((value) => value.trim()).filter(Boolean);
}

function parseField(signature: string): ClassField {
  const parts = signature.split(/\s+/);
  const name = parts.at(-1) ?? '';
  const type = parts.length >= 2 ? parts.at(-2) ?? '' : '';

  return {
    name,
    type,
    modifiers: parseModifiers(signature),
    signature,
  };
}

function parseMethod(signature: string, className: string): ClassMethod {
  const openParen = signature.indexOf('(');
  const closeParen = signature.lastIndexOf(')');
  const beforeParen = signature.slice(0, openParen).trim();
  const parametersText = signature.slice(openParen + 1, closeParen).trim();
  const beforeParts = beforeParen.split(/\s+/);
  const name = beforeParts.at(-1) ?? '';
  const simpleClassName = className.split('.').at(-1) ?? className;
  const constructor = name === className || name === simpleClassName;
  const returnType = constructor ? undefined : beforeParts.at(-2);

  return {
    name,
    returnType,
    parameters: parametersText ? splitTopLevel(parametersText, ',').map((value) => value.trim()) : [],
    modifiers: parseModifiers(signature),
    signature,
    constructor,
  };
}

function splitTopLevel(value: string, delimiter: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of value) {
    if (char === '<') {
      depth += 1;
    } else if (char === '>') {
      depth = Math.max(0, depth - 1);
    }

    if (char === delimiter && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

function packageNameOf(className: string): string {
  const index = className.lastIndexOf('.');
  return index >= 0 ? className.slice(0, index) : '';
}

function getJavapCommand(): string {
  const javaHome = process.env.JAVA_HOME;
  if (javaHome) {
    return path.join(javaHome, 'bin', process.platform === 'win32' ? 'javap.exe' : 'javap');
  }

  return process.platform === 'win32' ? 'javap.exe' : 'javap';
}
