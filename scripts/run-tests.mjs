import { spawn } from 'node:child_process';

// Node stops parsing runner options at file patterns. pnpm appends arguments,
// so place them before the patterns rather than silently ignoring concurrency.
const args = process.argv.slice(2), separator = args.indexOf('--');
const options = separator < 0 ? args : args.slice(0, separator);
const files = separator < 0 ? ['tests/*.test.cjs', 'tests/*.test.mjs'] : args.slice(separator + 1);
const child = spawn(process.execPath, ['--test', ...options, ...files], { stdio: 'inherit', windowsHide: true });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
