#!/usr/bin/env node
import { Command } from 'commander';
import { pullPublishedPage } from './pull-command.js';

export function createProgram(): Command {
  const program = new Command();
  program.name('pulseflow').description('Manage published PulseFlow pages');
  program.command('pull')
    .argument('<pageId>')
    .option('--base-url <url>', 'PulseFlow API base URL', process.env.PULSEFLOW_URL ?? 'http://localhost:3000')
    .action(async (pageId: string, options: { baseUrl: string }) => {
      const result = await pullPublishedPage({ pageId, baseUrl: options.baseUrl, token: process.env.PULSEFLOW_TOKEN ?? '', cwd: process.cwd() });
      if (result.ok) process.stdout.write(`${result.message}\n`);
      else {
        process.stderr.write(`${result.message}\n`);
        if (result.diff) process.stderr.write(`${result.diff}\n`);
        process.exitCode = 1;
      }
    });
  return program;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  void createProgram().parseAsync(process.argv);
}
