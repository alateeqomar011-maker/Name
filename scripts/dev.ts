// Runs the API server (with file watching) and the Vite dev server together.
import { spawn, type ChildProcess } from 'node:child_process';

const procs: ChildProcess[] = [];
function run(name: string, cmd: string, args: string[]): void {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  const tag = (line: string) => `\x1b[2m[${name}]\x1b[0m ${line}`;
  p.stdout?.on('data', (d: Buffer) => d.toString().split('\n').filter(Boolean).forEach((l) => console.log(tag(l))));
  p.stderr?.on('data', (d: Buffer) => d.toString().split('\n').filter(Boolean).forEach((l) => console.error(tag(l))));
  p.on('exit', (code) => {
    console.log(tag(`exited with ${code}`));
    for (const other of procs) other.kill();
    process.exit(code ?? 0);
  });
  procs.push(p);
}

run('api', process.execPath, ['--watch-path=server', '--watch-path=shared', '--disable-warning=ExperimentalWarning', 'server/index.ts']);
run('web', process.execPath, ['node_modules/vite/bin/vite.js']);

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => procs.forEach((p) => p.kill(sig)));
