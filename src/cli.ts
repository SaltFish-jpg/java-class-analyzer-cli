#!/usr/bin/env node
import { Command, Option } from 'commander';
import { runAnalyzeClassCommand } from './commands/analyze-class.js';
import { runGetClassCommand } from './commands/get-class.js';
import { runScanCommand } from './commands/scan.js';
import { runSearchClassesCommand } from './commands/search-classes.js';
import { writeError } from './core/output.js';

const program = new Command();

program
  .name('java-class-analyzer-cli')
  .description('Project-scoped Java classpath analyzer and decompiler')
  .version('1.0.0');

function addProjectOption(command: Command): Command {
  return command.requiredOption('-p, --project <path>', 'Maven project root path');
}

function addMavenOptions(command: Command): Command {
  return command
    .option('--settings <path>', 'Maven settings.xml path')
    .option('--scope <scope>', 'Maven dependency scope for dependency:build-classpath')
    .addOption(new Option('--maven-args <args...>', 'Extra Maven arguments passed to dependency:build-classpath'));
}

function addAutoScanOption(command: Command): Command {
  return command.option('--auto-scan', 'Run scan automatically when the project index is missing', false);
}

addMavenOptions(addProjectOption(program.command('scan')))
  .description('Resolve the Maven project classpath and build a project-scoped class index')
  .option('--json', 'Print JSON output', false)
  .action(async (options) => runWithErrors(() => runScanCommand(options)));

addAutoScanOption(addMavenOptions(addProjectOption(program.command('search-classes'))))
  .description('Search classes in the project classpath index')
  .argument('<query>', 'Simple name, FQN, or fuzzy query')
  .option('--json', 'Print JSON output', false)
  .option('--limit <number>', 'Maximum number of results', '50')
  .action(async (query, options) => runWithErrors(() => runSearchClassesCommand(query, options)));

addAutoScanOption(addMavenOptions(addProjectOption(program.command('get-class'))))
  .description('Get decompiled source or signatures for a class from the project classpath')
  .argument('<className>', 'Fully-qualified class name')
  .addOption(new Option('--type <type>', 'Output type').choices(['source', 'signatures']).default('source'))
  .option('--cfr-path <path>', 'CFR jar path. Defaults to CFR_PATH or bundled lib/cfr-0.152.jar')
  .option('--no-cache', 'Do not read from decompile cache before running CFR')
  .option('--json', 'Print JSON output', false)
  .action(async (className, options) => runWithErrors(() => runGetClassCommand(className, options)));

addAutoScanOption(addMavenOptions(addProjectOption(program.command('analyze-class'))))
  .description('Analyze fields, methods, superclass, and interfaces with javap')
  .argument('<className>', 'Fully-qualified class name')
  .option('--json', 'Print JSON output', false)
  .action(async (className, options) => runWithErrors(() => runAnalyzeClassCommand(className, options)));

program.parseAsync(process.argv).catch((error: unknown) => {
  writeError(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function runWithErrors(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
