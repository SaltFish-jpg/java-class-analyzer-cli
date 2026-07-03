import { assertProjectPath } from '../core/config.js';
import { indexExists, loadProjectIndex, scanProject, type ProjectClassIndex } from '../core/project-index.js';

export interface ProjectOption {
  project: string;
}

export interface MavenOption extends ProjectOption {
  mavenArgs?: string[];
  settings?: string;
  scope?: string;
}

export interface AutoScanOption extends MavenOption {
  autoScan?: boolean;
}

export async function loadIndexForCommand(options: AutoScanOption): Promise<ProjectClassIndex> {
  const projectPath = await assertProjectPath(options.project);

  if (!(await indexExists(projectPath))) {
    if (!options.autoScan) {
      throw new Error(`Class index not found. Run: java-class-analyzer-cli scan --project ${projectPath}`);
    }

    await scanProject({
      projectPath,
      mavenArgs: normalizeMavenArgs(options.mavenArgs),
      settings: options.settings,
      scope: options.scope,
    });
  }

  return loadProjectIndex(projectPath);
}

export function normalizeMavenArgs(value?: string[]): string[] | undefined {
  if (!value?.length) {
    return undefined;
  }

  return value.flatMap((item) => item.split(/\s+/).map((part) => part.trim()).filter(Boolean));
}

export function parseLimit(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid limit: ${value}`);
  }

  return parsed;
}
