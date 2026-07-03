import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'fs-extra';
import { assertProjectPath, classpathFilePath, ensureCacheDir } from './config.js';

export interface ClasspathResolveOptions {
  projectPath: string;
  mavenArgs?: string[];
  settings?: string;
  scope?: string;
}

interface MavenProjectInfo {
  projectPath: string;
  packaging: string;
  modules: string[];
}

interface MavenModuleInfo extends MavenProjectInfo {
  relativePath: string;
}

export interface ClasspathResolveResult {
  projectPath: string;
  classpathFile: string;
  classpath: string[];
}

export async function resolveProjectClasspath(options: ClasspathResolveOptions): Promise<ClasspathResolveResult> {
  const projectPath = await assertProjectPath(options.projectPath);
  const pomPath = path.join(projectPath, 'pom.xml');

  if (!(await fs.pathExists(pomPath))) {
    throw new Error(`Only Maven projects are supported for now. Missing pom.xml at ${pomPath}`);
  }

  await ensureCacheDir(projectPath);
  const outputFile = classpathFilePath(projectPath);
  await fs.remove(outputFile);

  const projectInfo = await readMavenProjectInfo(projectPath);
  const reactorRoot = await findReactorRoot(projectPath);
  const classpath = projectInfo.modules.length
    ? await resolveAggregatorClasspath(projectPath, projectInfo, outputFile, options)
    : await resolveSingleProjectClasspath(projectPath, reactorRoot, outputFile, options);

  await fs.outputFile(outputFile, `${classpath.join(path.delimiter)}\n`, 'utf8');

  return {
    projectPath,
    classpathFile: outputFile,
    classpath,
  };
}

async function resolveAggregatorClasspath(
  projectPath: string,
  projectInfo: MavenProjectInfo,
  outputFile: string,
  options: ClasspathResolveOptions,
): Promise<string[]> {
  const modules = await collectClasspathModules(projectInfo);
  const classpath: string[] = [];

  if (modules.length === 0) {
    return resolveMavenClasspath(projectPath, outputFile, options);
  }

  for (const moduleInfo of modules) {
    const moduleOutputFile = moduleClasspathFilePath(projectPath, moduleInfo.relativePath);
    const moduleClasspath = await resolveMavenClasspath(projectPath, moduleOutputFile, options, {
      moduleSelector: moduleInfo.relativePath,
      reactorRoot: projectPath,
    });
    classpath.push(...moduleClasspath);
  }

  return uniquePaths(classpath);
}

async function resolveSingleProjectClasspath(
  projectPath: string,
  reactorRoot: string | undefined,
  outputFile: string,
  options: ClasspathResolveOptions,
): Promise<string[]> {
  if (!reactorRoot || path.resolve(reactorRoot) === path.resolve(projectPath)) {
    return resolveMavenClasspath(projectPath, outputFile, options);
  }

  const moduleSelector = toMavenModuleSelector(reactorRoot, projectPath);
  return resolveMavenClasspath(reactorRoot, outputFile, options, {
    moduleSelector,
    reactorRoot,
  });
}

interface MavenClasspathInvocation {
  moduleSelector?: string;
  reactorRoot?: string;
}

async function resolveMavenClasspath(
  mavenWorkingDir: string,
  outputFile: string,
  options: ClasspathResolveOptions,
  invocation: MavenClasspathInvocation = {},
): Promise<string[]> {
  await fs.remove(outputFile);

  const args = buildMavenArgs(outputFile, options, invocation);
  await runMaven(mavenWorkingDir, args);

  if (!(await fs.pathExists(outputFile))) {
    throw new Error(`Maven did not create classpath file: ${outputFile}`);
  }

  const classpathText = await fs.readFile(outputFile, 'utf8');
  return parseClasspath(classpathText)
    .map((entry) => path.resolve(mavenWorkingDir, entry))
    .filter((entry) => entry.toLowerCase().endsWith('.jar'))
    .filter((entry) => !invocation.reactorRoot || !isReactorBuildOutputJar(invocation.reactorRoot, entry));
}

function buildMavenArgs(outputFile: string, options: ClasspathResolveOptions, invocation: MavenClasspathInvocation): string[] {
  const args = ['-q'];

  if (invocation.moduleSelector) {
    args.push('-pl', invocation.moduleSelector, '-am', '-DskipTests', '-Dmaven.test.skip=true', 'package');
  }

  args.push('dependency:build-classpath', '-D', `mdep.outputFile=${outputFile}`);

  if (options.scope) {
    args.push('-D', `mdep.scope=${options.scope}`);
  }

  if (options.settings) {
    args.push('-s', path.resolve(options.settings));
  }

  if (options.mavenArgs?.length) {
    args.push(...options.mavenArgs);
  }

  return args;
}

async function findReactorRoot(projectPath: string): Promise<string | undefined> {
  let current = path.dirname(projectPath);

  while (current !== path.dirname(current)) {
    const pomPath = path.join(current, 'pom.xml');
    if (await fs.pathExists(pomPath)) {
      const info = await readMavenProjectInfo(current);
      if (info.modules.some((modulePath) => isSameOrChild(projectPath, path.resolve(current, modulePath)))) {
        return current;
      }
    }

    current = path.dirname(current);
  }

  return undefined;
}

async function collectClasspathModules(projectInfo: MavenProjectInfo, rootPath = projectInfo.projectPath): Promise<MavenModuleInfo[]> {
  const result: MavenModuleInfo[] = [];

  for (const modulePath of projectInfo.modules) {
    const absoluteModulePath = path.resolve(projectInfo.projectPath, modulePath);
    const info = await readMavenProjectInfo(absoluteModulePath);
    const relativePath = toMavenModuleSelector(rootPath, absoluteModulePath);

    if (info.modules.length > 0) {
      result.push(...await collectClasspathModules(info, rootPath));
      continue;
    }

    if (info.packaging !== 'pom') {
      result.push({ ...info, relativePath });
    }
  }

  return result;
}

async function readMavenProjectInfo(projectPath: string): Promise<MavenProjectInfo> {
  const pom = await fs.readFile(path.join(projectPath, 'pom.xml'), 'utf8');
  const pomWithoutComments = pom.replace(/<!--[\s\S]*?-->/g, '');
  const packaging = extractFirstXmlValue(pomWithoutComments, 'packaging') ?? 'jar';
  const modulesBlock = pomWithoutComments.match(/<modules>([\s\S]*?)<\/modules>/)?.[1] ?? '';
  const modules = [...modulesBlock.matchAll(/<module>\s*([^<]+?)\s*<\/module>/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);

  return {
    projectPath,
    packaging,
    modules,
  };
}

function extractFirstXmlValue(xml: string, tagName: string): string | undefined {
  const match = xml.match(new RegExp(`<${tagName}>\\s*([^<]+?)\\s*</${tagName}>`));
  return match?.[1]?.trim();
}

function moduleClasspathFilePath(projectPath: string, moduleSelector: string): string {
  const safeModuleName = moduleSelector.replace(/[\\/.:]+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(path.dirname(classpathFilePath(projectPath)), `classpath.${safeModuleName}.txt`);
}

function toMavenModuleSelector(rootPath: string, modulePath: string): string {
  return path.relative(rootPath, modulePath).replace(/\\/g, '/');
}

function isSameOrChild(childPath: string, parentPath: string): boolean {
  const relative = path.relative(parentPath, childPath);
  return relative === '' || Boolean(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function uniquePaths(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const key = process.platform === 'win32' ? value.toLowerCase() : value;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(value);
  }

  return result;
}

function isReactorBuildOutputJar(reactorRoot: string, jarPath: string): boolean {
  const relative = path.relative(reactorRoot, jarPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return false;
  }

  const segments = relative.split(path.sep).map((segment) => segment.toLowerCase());
  return segments.includes('target');
}

function parseClasspath(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const delimiter = process.platform === 'win32' ? ';' : ':';
  return trimmed
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function runMaven(projectPath: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const command = isWindows ? 'cmd.exe' : 'mvn';
    const commandArgs = isWindows ? ['/d', '/c', 'mvn.cmd', ...args] : args;
    const child = spawn(command, commandArgs, {
      cwd: projectPath,
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
      reject(new Error(`Failed to start Maven: ${error.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const details = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n');
      reject(new Error(`Maven dependency:build-classpath failed with exit code ${code}${details ? `\n${details}` : ''}`));
    });
  });
}
