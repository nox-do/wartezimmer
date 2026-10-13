#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const workspace = process.cwd();
const require = createRequire(path.join(workspace, 'package.json'));
const ts = require('typescript');
const configPath = path.resolve(workspace, process.argv[2] ?? 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
if (parsed.errors.length) {
  throw new Error(
    parsed.errors
      .map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n'))
      .join('\n'),
  );
}
// Never clean a source directory or a path outside this workspace.
const output = parsed.options.outDir && path.resolve(parsed.options.outDir);
if (output !== path.join(workspace, 'dist') || parsed.options.noEmit) {
  throw new Error('build-typescript: expected an emitting config with workspace-local dist output');
}
fs.rmSync(output, { recursive: true, force: true });
const result = spawnSync(
  process.execPath,
  [require.resolve('typescript/bin/tsc'), '-p', configPath],
  { stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
