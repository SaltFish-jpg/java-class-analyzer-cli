import { analyzeClass, formatAnalysisText } from '../core/analyzer.js';
import { resolveClass } from '../core/class-lookup.js';
import { writeJson, writeLine, writeWarning } from '../core/output.js';
import { loadIndexForCommand, type AutoScanOption } from './shared.js';

export interface AnalyzeClassCommandOptions extends AutoScanOption {
  json?: boolean;
}

export async function runAnalyzeClassCommand(className: string, options: AnalyzeClassCommandOptions): Promise<void> {
  const index = await loadIndexForCommand(options);
  const resolution = resolveClass(index, className);

  if (resolution.conflicts.length && !options.json) {
    writeWarning(`${className} also exists in ${resolution.conflicts.length} lower-priority jar(s); using classpath order ${resolution.selected.order}.`);
  }

  const analysis = await analyzeClass(index, resolution);

  if (options.json) {
    writeJson(analysis);
    return;
  }

  writeLine(formatAnalysisText(analysis).trimEnd());
}
