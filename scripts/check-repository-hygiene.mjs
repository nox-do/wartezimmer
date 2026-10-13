#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const findings = [];
for (const file of files) {
  const parts = file.split('/');
  const name = parts.at(-1);
  if (
    parts.some((part) =>
      [
        'node_modules',
        'dist',
        'out',
        'build-resources',
        '.tmp',
        'backups',
        'dumps',
        'state',
      ].includes(part),
    ) ||
    /\.(?:map|tsbuildinfo|pfinstall|pfupdate|sqlite|key|p12|pfx)$/i.test(name) ||
    name === '.DS_Store' ||
    name.startsWith('._') ||
    (/^\.env(?:\.|$)/.test(name) && name !== '.env.example')
  )
    findings.push(file);
  const full = path.join(root, file);
  if (fs.existsSync(full) && fs.statSync(full).isFile() && /\.(?:pem|key)$/.test(name)) {
    const text = fs.readFileSync(full, 'utf8');
    if (/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/.test(text))
      findings.push(file);
  }
}
if (findings.length)
  throw new Error(
    `Local/generated/private files tracked in Git:\n${[...new Set(findings)].join('\n')}`,
  );
console.log(`Repository hygiene OK (${files.length} tracked paths; local runtime data excluded).`);
