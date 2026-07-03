import path from 'node:path';
import fs from 'fs-extra';
import * as yauzl from 'yauzl';

export interface ScannedJarClass {
  className: string;
  jarPath: string;
}

export interface JarMetadata {
  jarPath: string;
  coordinate?: string;
  jarMtimeMs: number;
  jarSize: number;
}

export async function scanJarClasses(jarPath: string): Promise<ScannedJarClass[]> {
  return new Promise((resolve, reject) => {
    const classes: ScannedJarClass[] = [];

    yauzl.open(jarPath, { lazyEntries: true }, (openError, zipfile) => {
      if (openError) {
        reject(openError);
        return;
      }

      if (!zipfile) {
        reject(new Error(`Unable to open jar: ${jarPath}`));
        return;
      }

      zipfile.readEntry();

      zipfile.on('entry', (entry) => {
        if (entry.fileName.endsWith('.class') && !entry.fileName.includes('$') && !entry.fileName.startsWith('META-INF/')) {
          const className = entry.fileName.replace(/\.class$/, '').replace(/\//g, '.');
          classes.push({ className, jarPath });
        }

        zipfile.readEntry();
      });

      zipfile.on('end', () => {
        resolve(classes);
      });

      zipfile.on('error', (zipError) => {
        reject(zipError);
      });
    });
  });
}

export async function getJarMetadata(jarPath: string): Promise<JarMetadata> {
  const stat = await fs.stat(jarPath);
  return {
    jarPath,
    coordinate: await inferMavenCoordinate(jarPath),
    jarMtimeMs: stat.mtimeMs,
    jarSize: stat.size,
  };
}

export async function inferMavenCoordinate(jarPath: string): Promise<string | undefined> {
  const fromPom = await inferCoordinateFromSiblingPom(jarPath);
  if (fromPom) {
    return fromPom;
  }

  return inferCoordinateFromPath(jarPath);
}

async function inferCoordinateFromSiblingPom(jarPath: string): Promise<string | undefined> {
  const dir = path.dirname(jarPath);
  const jarBase = path.basename(jarPath, '.jar');
  const pomPath = path.join(dir, `${jarBase}.pom`);

  if (!(await fs.pathExists(pomPath))) {
    return undefined;
  }

  const pom = await fs.readFile(pomPath, 'utf8').catch(() => undefined);
  if (!pom) {
    return undefined;
  }

  const projectPom = pom.replace(/<parent>[\s\S]*?<\/parent>/, '');
  const groupId = extractFirstXmlValue(projectPom, 'groupId') ?? extractParentXmlValue(pom, 'groupId');
  const artifactId = extractFirstXmlValue(projectPom, 'artifactId');
  const version = extractFirstXmlValue(projectPom, 'version') ?? extractParentXmlValue(pom, 'version');

  if (!groupId || !artifactId || !version) {
    return undefined;
  }

  return `${groupId}:${artifactId}:${version}`;
}

function inferCoordinateFromPath(jarPath: string): string | undefined {
  const normalized = path.normalize(jarPath);
  const dir = path.dirname(normalized);
  const version = path.basename(dir);
  const artifactDir = path.dirname(dir);
  const artifactId = path.basename(artifactDir);
  const fileName = path.basename(normalized, '.jar');

  if (!artifactId || !version || !fileName.startsWith(`${artifactId}-${version}`)) {
    return undefined;
  }

  const segments = normalized.split(path.sep);
  const artifactIndex = segments.lastIndexOf(artifactId);
  if (artifactIndex <= 0) {
    return undefined;
  }

  const repositoryIndex = findRepositoryRootIndex(segments, artifactIndex);
  if (repositoryIndex < 0 || repositoryIndex + 1 >= artifactIndex) {
    return `${artifactId}:${artifactId}:${version}`;
  }

  const groupId = segments.slice(repositoryIndex + 1, artifactIndex).join('.');
  return groupId ? `${groupId}:${artifactId}:${version}` : undefined;
}

function findRepositoryRootIndex(segments: string[], artifactIndex: number): number {
  const envRepo = process.env.MAVEN_REPO;
  if (envRepo) {
    const repoSegments = path.normalize(envRepo).split(path.sep).filter(Boolean);
    const start = findSubsequence(segments.map(lower), repoSegments.map(lower));
    if (start >= 0) {
      return start + repoSegments.length - 1;
    }
  }

  for (let index = artifactIndex - 1; index >= 0; index--) {
    if (lower(segments[index]) === 'repository') {
      return index;
    }
  }

  return -1;
}

function findSubsequence(values: string[], needle: string[]): number {
  if (needle.length === 0 || needle.length > values.length) {
    return -1;
  }

  for (let start = 0; start <= values.length - needle.length; start++) {
    if (needle.every((value, offset) => values[start + offset] === value)) {
      return start;
    }
  }

  return -1;
}

function lower(value: string): string {
  return value.toLowerCase();
}

function extractFirstXmlValue(xml: string, tagName: string): string | undefined {
  const match = xml.match(new RegExp(`<${tagName}>\\s*([^<]+?)\\s*</${tagName}>`));
  return match?.[1]?.trim();
}

function extractParentXmlValue(xml: string, tagName: string): string | undefined {
  const parentMatch = xml.match(/<parent>[\s\S]*?<\/parent>/);
  if (!parentMatch) {
    return undefined;
  }

  return extractFirstXmlValue(parentMatch[0], tagName);
}
