import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';
import * as yauzl from 'yauzl';
import type { ClassResolution } from './class-lookup.js';
import type { ProjectClassIndex } from './project-index.js';
import { DEFAULT_CFR_JAR, decompileCacheDir, tempDir } from './config.js';

export interface DecompileOptions {
  projectPath: string;
  index: ProjectClassIndex;
  resolution: ClassResolution;
  cfrPath?: string;
  useCache?: boolean;
}

export interface DecompileResult {
  source: string;
  cachePath: string;
  cfrPath: string;
  jarFingerprint: string;
  fromCache: boolean;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function decompileClass(options: DecompileOptions): Promise<DecompileResult> {
  const cfrPath = await resolveCfrPath(options.cfrPath);
  const jarFingerprint = await fingerprintFile(options.resolution.selected.jarPath);
  const cachePath = getSourceCachePath(options.projectPath, jarFingerprint, options.resolution.className);
  const useCache = options.useCache ?? true;

  if (useCache && await fs.pathExists(cachePath)) {
    return {
      source: await fs.readFile(cachePath, 'utf8'),
      cachePath,
      cfrPath,
      jarFingerprint,
      fromCache: true,
    };
  }

  const classFile = await extractClassFile(options.projectPath, jarFingerprint, options.resolution.selected.jarPath, options.resolution.className);
  const source = await runCfr(cfrPath, classFile, options.index.classpath);

  await fs.outputFile(cachePath, source, 'utf8');

  return {
    source,
    cachePath,
    cfrPath,
    jarFingerprint,
    fromCache: false,
  };
}

export async function resolveCfrPath(explicitPath?: string): Promise<string> {
  const candidates = [
    explicitPath,
    process.env.CFR_PATH,
    path.resolve(process.cwd(), 'lib', DEFAULT_CFR_JAR),
    path.resolve(__dirname, '..', '..', 'lib', DEFAULT_CFR_JAR),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (await fs.pathExists(candidate)) {
      return path.resolve(candidate);
    }
  }

  throw new Error(`CFR jar not found. Put ${DEFAULT_CFR_JAR} in lib/ or set CFR_PATH.`);
}

function getSourceCachePath(projectPath: string, jarFingerprint: string, className: string): string {
  const packagePath = className.split('.').slice(0, -1);
  const simpleName = className.split('.').at(-1) ?? className;
  return path.join(decompileCacheDir(projectPath), jarFingerprint, ...packagePath, `${simpleName}.java`);
}

async function fingerprintFile(filePath: string): Promise<string> {
  const stat = await fs.stat(filePath);
  const hash = createHash('sha256');
  hash.update(path.resolve(filePath));
  hash.update(String(stat.mtimeMs));
  hash.update(String(stat.size));

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });

  return hash.digest('hex').slice(0, 16);
}

async function extractClassFile(projectPath: string, jarFingerprint: string, jarPath: string, className: string): Promise<string> {
  const classEntryName = `${className.replace(/\./g, '/')}.class`;
  const outputPath = path.join(tempDir(projectPath), jarFingerprint, ...className.split('.').slice(0, -1), `${className.split('.').at(-1)}.class`);

  if (await fs.pathExists(outputPath)) {
    return outputPath;
  }

  await fs.ensureDir(path.dirname(outputPath));

  return new Promise((resolve, reject) => {
    yauzl.open(jarPath, { lazyEntries: true }, (openError, zipfile) => {
      if (openError) {
        reject(new Error(`Unable to open jar ${jarPath}: ${openError.message}`));
        return;
      }

      if (!zipfile) {
        reject(new Error(`Unable to open jar: ${jarPath}`));
        return;
      }

      let found = false;
      zipfile.readEntry();

      zipfile.on('entry', (entry) => {
        if (entry.fileName !== classEntryName) {
          zipfile.readEntry();
          return;
        }

        found = true;
        zipfile.openReadStream(entry, (readError, readStream) => {
          if (readError || !readStream) {
            reject(new Error(`Unable to read ${classEntryName} from ${jarPath}: ${readError?.message ?? 'empty stream'}`));
            return;
          }

          const writeStream = createWriteStream(outputPath);
          readStream.pipe(writeStream);

          writeStream.on('close', () => {
            resolve(outputPath);
          });

          writeStream.on('error', reject);
        });
      });

      zipfile.on('end', () => {
        if (!found) {
          reject(new Error(`Class file ${classEntryName} not found in ${jarPath}`));
        }
      });

      zipfile.on('error', reject);
    });
  });
}

function runCfr(cfrPath: string, classFilePath: string, classpath: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(getJavaCommand(), [
      '-jar',
      cfrPath,
      classFilePath,
      '--silent',
      'true',
      '--extraclasspath',
      classpath.join(path.delimiter),
    ], {
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
      reject(new Error(`Failed to start Java for CFR: ${error.message}`));
    });

    child.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        resolve(stdout);
        return;
      }

      reject(new Error(`CFR failed with exit code ${code}${stderr.trim() ? `\n${stderr.trim()}` : ''}`));
    });
  });
}

function getJavaCommand(): string {
  const javaHome = process.env.JAVA_HOME;
  if (javaHome) {
    return path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  }

  return process.platform === 'win32' ? 'java.exe' : 'java';
}
