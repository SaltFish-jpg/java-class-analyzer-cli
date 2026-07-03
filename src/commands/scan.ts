import { scanProject, countUniqueClasses } from '../core/project-index.js';
import { formatCount, writeJson, writeLine } from '../core/output.js';
import { normalizeMavenArgs, type MavenOption } from './shared.js';

export interface ScanCommandOptions extends MavenOption {
  json?: boolean;
}

export async function runScanCommand(options: ScanCommandOptions): Promise<void> {
  const result = await scanProject({
    projectPath: options.project,
    mavenArgs: normalizeMavenArgs(options.mavenArgs),
    settings: options.settings,
    scope: options.scope,
  });

  if (options.json) {
    writeJson({
      projectPath: result.index.projectPath,
      indexPath: result.indexPath,
      classpathFile: result.classpathFile,
      jarCount: result.jarCount,
      classEntryCount: result.classCount,
      uniqueClassCount: countUniqueClasses(result.index),
      conflictCount: result.conflictCount,
      skippedJars: result.skippedJars,
    });
    return;
  }

  writeLine('Scan complete');
  writeLine(formatCount('Jars indexed', result.jarCount));
  writeLine(formatCount('Class entries', result.classCount));
  writeLine(formatCount('Unique classes', countUniqueClasses(result.index)));
  writeLine(formatCount('Class conflicts', result.conflictCount));
  writeLine(`Index: ${result.indexPath}`);
  writeLine(`Classpath: ${result.classpathFile}`);

  if (result.skippedJars.length) {
    writeLine('');
    writeLine(`Skipped jars (${result.skippedJars.length})`);
    for (const skipped of result.skippedJars.slice(0, 10)) {
      writeLine(`  ${skipped.jarPath}: ${skipped.reason}`);
    }
  }
}
