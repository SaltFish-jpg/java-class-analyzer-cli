import { analyzeClass, formatSignatures } from '../core/analyzer.js';
import { resolveClass } from '../core/class-lookup.js';
import { decompileClass } from '../core/decompiler.js';
import { writeJson, writeLine, writeWarning } from '../core/output.js';
import { loadIndexForCommand, type AutoScanOption } from './shared.js';

export interface GetClassCommandOptions extends AutoScanOption {
  type?: 'source' | 'signatures';
  cfrPath?: string;
  noCache?: boolean;
  json?: boolean;
}

export async function runGetClassCommand(className: string, options: GetClassCommandOptions): Promise<void> {
  const index = await loadIndexForCommand(options);
  const resolution = resolveClass(index, className);

  if (resolution.conflicts.length && !options.json) {
    writeWarning(`${className} also exists in ${resolution.conflicts.length} lower-priority jar(s); using classpath order ${resolution.selected.order}.`);
  }

  if ((options.type ?? 'source') === 'signatures') {
    const analysis = await analyzeClass(index, resolution);
    const signatures = formatSignatures(analysis);

    if (options.json) {
      writeJson({ ...analysis, signatures });
      return;
    }

    writeLine(signatures.trimEnd());
    return;
  }

  const decompiled = await decompileClass({
    projectPath: index.projectPath,
    index,
    resolution,
    cfrPath: options.cfrPath,
    useCache: !options.noCache,
  });

  if (options.json) {
    writeJson({
      className,
      source: decompiled.source,
      jarPath: resolution.selected.jarPath,
      coordinate: resolution.selected.coordinate,
      order: resolution.selected.order,
      conflicts: resolution.conflicts,
      cachePath: decompiled.cachePath,
      fromCache: decompiled.fromCache,
      cfrPath: decompiled.cfrPath,
      jarFingerprint: decompiled.jarFingerprint,
    });
    return;
  }

  writeLine(decompiled.source.trimEnd());
}
