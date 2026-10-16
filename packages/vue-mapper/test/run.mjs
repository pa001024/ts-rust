import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.dirname(root);
const fixture = path.join(root, 'fixture');
const tsc = process.env.TSC_RS_BIN || 'tsc-rs';

function fail(message) {
	console.error(`FAIL: ${message}`);
	process.exit(1);
}

function npmInstall(cwd, label) {
	console.log(`installing ${label} dependencies...`);
	const r = spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
	if (r.status !== 0) {
		fail(`${label} npm install failed`);
	}
}

// The mapper resolves its own dependencies (typescript, @vue/language-core)
// from its package directory: with a symlinked `file:` install the fixture
// does not provide them.
if (!existsSync(path.join(pkgDir, 'node_modules', 'typescript', 'package.json'))) {
	npmInstall(pkgDir, 'mapper');
}

if (!existsSync(path.join(fixture, 'node_modules', 'tsc-rs-vue-mapper', 'package.json'))) {
	npmInstall(fixture, 'fixture');
}

console.log(`running: ${tsc} --runExternalCode -p tsconfig.json`);
const run = spawnSync(tsc, ['--runExternalCode', '-p', 'tsconfig.json'], {
	cwd: fixture,
	encoding: 'utf8',
	maxBuffer: 64 * 1024 * 1024,
	shell: process.platform === 'win32',
});
if (run.error) {
	fail(`could not start compiler: ${run.error.message} (set TSC_RS_BIN)`);
}
const output = (run.stdout || '') + (run.stderr || '');
console.log(output);

if (run.status === 0) {
	fail('expected a non-zero exit code for a fixture with type errors');
}

const errors = [];
for (const line of output.split('\n')) {
	const m = /^(\S+?)\((\d+),(\d+)\): error (TS\d+):/.exec(line.trim());
	if (m) {
		errors.push({ file: m[1].replace(/\\/g, '/'), line: Number(m[2]), col: Number(m[3]), code: m[4] });
	}
}

const expected = [
	{ file: 'src/App.vue', line: 6, col: 7, code: 'TS2322' },
	{ file: 'src/App.vue', line: 11, col: 10, code: 'TS2322' },
	{ file: 'src/App.vue', line: 12, col: 10, code: 'TS2339' },
];

if (errors.length !== expected.length) {
	fail(`expected ${expected.length} errors, got ${errors.length}: ${JSON.stringify(errors)}`);
}
for (let i = 0; i < expected.length; i++) {
	const a = errors[i];
	const b = expected[i];
	if (a.file !== b.file || a.line !== b.line || a.col !== b.col || a.code !== b.code) {
		fail(`error ${i}: expected ${b.file}(${b.line},${b.col}) ${b.code}, got ${a.file}(${a.line},${a.col}) ${a.code}`);
	}
}
for (const e of errors) {
	if (e.file !== 'src/App.vue') {
		fail(`unexpected error in clean file: ${JSON.stringify(e)}`);
	}
}

console.log('PASS: vue-mapper reports the same file/line/code triples as vue-tsc');
