import fs from 'fs-extra';
import path from 'node:path';
import { indexFilePath } from './config.js';
import { resolveProjectClasspath, type ClasspathResolveOptions } from './classpath-resolver.js';
import { getJarMetadata, scanJarClasses } from './jar-scanner.js';

export interface ClassIndexEntry {
  jarPath: string;
  coordinate?: string;
  order: number;
  jarMtimeMs: number;
  jarSize: number;
}

export interface ProjectClassIndex {
  schemaVersion: 1;
  projectPath: string;
  generatedAt: string;
  classpath: string[];
  classes: Record<string, ClassIndexEntry[]>;
}

export interface ScanProjectOptions extends ClasspathResolveOptions {
  json?: boolean;
}

export interface ScanProjectResult {
  index: ProjectClassIndex;
  indexPath: string;
  classpathFile: string;
  jarCount: number;
  classCount: number;
  conflictCount: number;
  skippedJars: Array<{ jarPath: string; reason: string }>;
}

export async function scanProject(options: ScanProjectOptions): Promise<ScanProjectResult> {
  const resolved = await resolveProjectClasspath(options);
  const classes: Record<string, ClassIndexEntry[]> = {};
  const skippedJars: Array<{ jarPath: string; reason: string }> = [];
  let classCount = 0;

  for (const [order, jarPath] of resolved.classpath.entries()) {
    if (!(await fs.pathExists(jarPath))) {
      skippedJars.push({ jarPath, reason: 'Jar file does not exist' });
      continue;
    }

    try {
      const metadata = await getJarMetadata(jarPath);
      const jarClasses = await scanJarClasses(jarPath);

      for (const jarClass of jarClasses) {
        const entries = classes[jarClass.className] ?? [];
        entries.push({
          jarPath,
          coordinate: metadata.coordinate,
          order,
          jarMtimeMs: metadata.jarMtimeMs,
          jarSize: metadata.jarSize,
        });
        classes[jarClass.className] = entries;
        classCount += 1;
      }
    } catch (error) {
      skippedJars.push({
        jarPath,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const entries of Object.values(classes)) {
    entries.sort((left, right) => left.order - right.order);
  }

  const index: ProjectClassIndex = {
    schemaVersion: 1,
    projectPath: resolved.projectPath,
    generatedAt: new Date().toISOString(),
    classpath: resolved.classpath,
    classes,
  };

  const outputPath = indexFilePath(resolved.projectPath);
  await fs.outputJson(outputPath, index, { spaces: 2 });

  return {
    index,
    indexPath: outputPath,
    classpathFile: resolved.classpathFile,
    jarCount: resolved.classpath.length - skippedJars.length,
    classCount,
    conflictCount: countConflicts(index),
    skippedJars,
  };
}

export async function loadProjectIndex(projectPath: string): Promise<ProjectClassIndex> {
  const outputPath = indexFilePath(projectPath);

  if (!(await fs.pathExists(outputPath))) {
    throw new Error(`Class index not found: ${outputPath}. Run: java-class-analyzer-cli scan --project ${quotePath(projectPath)}`);
  }

  const index = await fs.readJson(outputPath) as ProjectClassIndex;
  validateIndex(index, outputPath);
  return index;
}

export async function indexExists(projectPath: string): Promise<boolean> {
  return fs.pathExists(indexFilePath(projectPath));
}

export function countConflicts(index: ProjectClassIndex): number {
  return Object.values(index.classes).filter((entries) => entries.length > 1).length;
}

export function countUniqueClasses(index: ProjectClassIndex): number {
  return Object.keys(index.classes).length;
}

function validateIndex(index: ProjectClassIndex, outputPath: string): void {
  if (index.schemaVersion !== 1 || !index.projectPath || !Array.isArray(index.classpath) || typeof index.classes !== 'object') {
    throw new Error(`Unsupported or invalid class index file: ${outputPath}`);
  }
}

function quotePath(value: string): string {
  return value.includes(' ') ? `"${path.normalize(value)}"` : path.normalize(value);
}
