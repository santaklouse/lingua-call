#!/usr/bin/env node
/**
 * Checks that the local toolchain satisfies the project requirements.
 * Usage: node scripts/check-prereq.mjs
 */
import { execFileSync } from 'node:child_process';

const REQUIRED = {
  node: { command: process.execPath, args: ['--version'], min: 22, label: 'Node.js' },
  pnpm: { command: 'pnpm', args: ['--version'], min: 11, label: 'pnpm' },
};

const OPTIONAL = {
  go: {
    command: 'go',
    args: ['version'],
    min: 1.25,
    label: 'Go (для сборки p2p-nc и тестов совместимости)',
  },
  git: { command: 'git', args: ['--version'], min: 2, label: 'git' },
};

const problems = [];

function parseVersion(text) {
  const match = text.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (match === null) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

function compare(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function check(entry, required) {
  try {
    const output = execFileSync(entry.command, entry.args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15_000,
    }).trim();
    const version = parseVersion(output);
    if (version === null) {
      problems.push(`${entry.label}: не удалось определить версию (${output})`);
      return;
    }
    const [minMajor, minMinor = 0] = String(entry.min)
      .split('.')
      .map((part) => Number(part));
    const minimum = [minMajor, minMinor, 0];
    if (compare(version, minimum) < 0) {
      const message = `${entry.label}: найдено ${version.join('.')}, нужно ≥ ${entry.min}`;
      if (required) problems.push(message);
      else console.warn(`⚠ ${message} (опционально)`);
    } else {
      console.info(`✓ ${entry.label}: ${version.join('.')}`);
    }
  } catch {
    const message = `${entry.label}: не найден в PATH`;
    if (required) problems.push(message);
    else console.warn(`⚠ ${message} (опционально)`);
  }
}

for (const entry of Object.values(REQUIRED)) check(entry, true);
for (const entry of Object.values(OPTIONAL)) check(entry, false);

if (problems.length > 0) {
  console.error('\nПроблемы:');
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}
console.info('\nОкружение готово.');
