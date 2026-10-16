# tsc-rs-vue-mapper

Vue SFC (`.vue`) support for [tsc-rs](https://github.com/pingdotgg/ts-rust),
the Rust port of the TypeScript 7 compiler — i.e. **vue-tsc functionality on
the Rust engine**.

It is a
[content-mapper](https://github.com/microsoft/TypeScript/blob/main/tsc/doc/content-mappers.md)
plugin: the Rust compiler spawns `node mapper.cjs`, sends each `.vue` file's
content over JSON-RPC, and type-checks the returned virtual TypeScript.
Virtual positions map back to the `.vue` file through span maps, so errors
print against `App.vue(11,10)` exactly like `vue-tsc` reports them.

The SFC expansion reuses `@vue/language-core` — the same codegen `vue-tsc`
uses — so template prop/slot/event checks behave the same.

## Use

```sh
npm install -D tsc-rs-vue-mapper
```

`tsconfig.json`:

```json
{
	"compilerOptions": {
		"strict": true,
		"noEmit": true,
		"skipLibCheck": true
	},
	"include": ["src"],
	"contentMappers": [
		{
			"package": "tsc-rs-vue-mapper",
			"extensions": [".vue"]
		}
	]
}
```

Run with external code execution enabled (content mappers run a child
process, so the compiler requires an explicit opt-in):

```sh
tsc-rs --runExternalCode -p tsconfig.json
```

The same `tsconfig.json` keeps working with plain `vue-tsc`, which ignores
the unknown `contentMappers` field:

```sh
vue-tsc --noEmit -p tsconfig.json
```

## Options

`vueCompilerOptions` are read from the project `tsconfig.json` (with
`extends` resolved), exactly like `vue-tsc`. The mapper entry's `options`
override them:

```json
{
	"contentMappers": [
		{
			"package": "tsc-rs-vue-mapper",
			"extensions": [".vue"],
			"options": { "strictTemplates": true }
		}
	]
}
```

## How it works

The mapper uses its bundled `@vue/language-core` for SFC codegen, so the
virtual code and its helper types always form a consistent, tested pair.
Set `VUE_MAPPER_PROJECT_CORE=1` to prefer the checked project's own copy
instead (resolved from the tsconfig directory, like `vue-tsc` does); on the
TypeScript 7 engine an older project copy can report substantially more
errors than the bundled one, so the bundled default is recommended.

1. `tsc-rs` matches `*.vue` files from `include` and resolves `./X.vue`
   imports to them (registered through the mapper's `extensions`).
2. For each `.vue` file it sends
   `transform({ fileName, content, projectHandle })` to `mapper.cjs`.
3. The mapper builds the file's virtual code with
   `createVueLanguagePlugin(...).createVirtualCode(...)` and returns the
   service script (`script_ts` / `script_tsx` / `script_js`) text, its
   extension, and the virtual-to-original span map.
4. The compiler parses the virtual text, checks it with all cores, and maps
   diagnostics back to `.vue` coordinates for display.

Protocol details: JSON-RPC 2.0 with LSP `Content-Length` framing over the
mapper process's stdio; `initialize` negotiates `utf-16` positions;
`openProject` receives the effective compiler options. See
`mapper.cjs` / `transform.cjs`.

## Expected differences from vue-tsc

The engine is TypeScript 7.1, while most `vue-tsc` installs check with
TypeScript 5.9, so diagnostics are not identical where the languages
differ — the same is true for plain `.ts` projects. On top of language
differences, the bundled codegen is newer than what many projects pin, and
newer codegen checks templates more thoroughly: on one 400-file project it
surfaced 11 genuine template bugs (`.value` on non-refs) that the project's
pinned codegen misses, plus TypeScript 7 strictness findings. Diagnostics
located entirely in synthesized virtual code are reported with the note
"has no corresponding location in the original file" instead of being
silently dropped.

## Limitations

- One-shot checking only (`--noEmit`). `--watch` and `tsc -b` with content
  mappers follow the upstream behavior; mixed JS/SFC projects work, but
  `<script lang="js">` blocks are checked only when the project enables
  `allowJs`/`checkJs`, same as `vue-tsc`.
- Template `expect-error` style comments (`@vue-expect-error`,
  `@vue-ignore`) work because the virtual text already carries the
  equivalent `// @ts-expect-error`; no mapper directives are emitted.
- The mapper runs in-process SFC codegen per `.vue` file in one Node
  process; on very large projects this phase is single-threaded while the
  Rust check itself uses all cores.

## Test

```sh
npm test            # runs test/run.mjs: protocol + fixture check
TSC_RS_BIN=/path/to/tsc-rs npm test
```

`test/run.mjs` installs the fixture's dependencies, runs the compiler on
`test/fixture` (which intentionally contains three type errors), and asserts
the reported file/line/code triples. `TSC_RS_BIN` selects the compiler
binary (default: `tsc-rs` from `PATH`).
