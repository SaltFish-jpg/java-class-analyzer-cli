import fs from 'fs-extra';
import path from 'node:path';

export const CACHE_DIR_NAME = '.java-class-analyzer';
export const CLASSPATH_FILE_NAME = 'classpath.txt';
export const INDEX_FILE_NAME = 'class-index.json';
export const DECOMPILE_CACHE_DIR_NAME = 'decompile-cache';
export const TEMP_DIR_NAME = 'class-temp';
export const DEFAULT_CFR_JAR = 'cfr-0.152.jar';

export function resolveProjectPath(projectPath: string): string {
  return path.resolve(projectPath);
}

export function cacheDir(projectPath: string): string {
  return path.join(resolveProjectPath(projectPath), CACHE_DIR_NAME);
}

export function classpathFilePath(projectPath: string): string {
  return path.join(cacheDir(projectPath), CLASSPATH_FILE_NAME);
}

export function indexFilePath(projectPath: string): string {
  return path.join(cacheDir(projectPath), INDEX_FILE_NAME);
}

export function decompileCacheDir(projectPath: string): string {
  return path.join(cacheDir(projectPath), DECOMPILE_CACHE_DIR_NAME);
}

export function tempDir(projectPath: string): string {
  return path.join(cacheDir(projectPath), TEMP_DIR_NAME);
}

export async function assertProjectPath(projectPath: string): Promise<string> {
  const resolved = resolveProjectPath(projectPath);
  const stat = await fs.stat(resolved).catch(() => undefined);

  if (!stat?.isDirectory()) {
    throw new Error(`Project path does not exist or is not a directory: ${resolved}`);
  }

  return resolved;
}

export async function ensureCacheDir(projectPath: string): Promise<string> {
  const dir = cacheDir(projectPath);
  await fs.ensureDir(dir);
  return dir;
}

export function normalizePathForDisplay(filePath: string): string {
  return path.normalize(filePath);
}
