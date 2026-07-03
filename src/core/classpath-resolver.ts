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

  const args = buildMavenArgs(outputFile, options);
  await runMaven(projectPath, args);

  if (!(await fs.pathExists(outputFile))) {
    throw new Error(`Maven did not create classpath file: ${outputFile}`);
  }

  const classpathText = await fs.readFile(outputFile, 'utf8');
  const classpath = parseClasspath(classpathText)
    .map((entry) => path.resolve(projectPath, entry))
    .filter((entry) => entry.toLowerCase().endsWith('.jar'));

  if (classpath.length === 0) {
    throw new Error(`Resolved classpath is empty. Check Maven dependency resolution for ${projectPath}`);
  }

  return {
    projectPath,
    classpathFile: outputFile,
    classpath,
  };
}

function buildMavenArgs(outputFile: string, options: ClasspathResolveOptions): string[] {
  const args = ['-q', 'dependency:build-classpath', '-D', `mdep.outputFile=${outputFile}`];

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
