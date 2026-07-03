import { formatEntrySource, searchClasses } from '../core/class-lookup.js';
import { writeJson, writeLine } from '../core/output.js';
import { loadIndexForCommand, parseLimit, type AutoScanOption } from './shared.js';

export interface SearchClassesCommandOptions extends AutoScanOption {
  json?: boolean;
  limit?: string;
}

export async function runSearchClassesCommand(query: string, options: SearchClassesCommandOptions): Promise<void> {
  const index = await loadIndexForCommand(options);
  const limit = parseLimit(options.limit ?? '50');
  const results = searchClasses(index, query, limit);

  if (options.json) {
    writeJson(results.map((result) => ({
      className: result.className,
      jarPath: result.selected.jarPath,
      coordinate: result.selected.coordinate,
      order: result.selected.order,
      conflicts: result.conflicts,
    })));
    return;
  }

  if (results.length === 0) {
    writeLine(`No classes matched: ${query}`);
    return;
  }

  for (const result of results) {
    const conflictText = result.conflicts.length ? ` (${result.conflicts.length} conflict${result.conflicts.length === 1 ? '' : 's'})` : '';
    writeLine(`${result.className}${conflictText}`);
    writeLine(`  ${formatEntrySource(result.selected)}`);
  }
}
