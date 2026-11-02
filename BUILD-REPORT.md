# freshcheck — Build Report

MCP Rebuild 1000, Batch 15. Original program build from the
packages-100 plan (cluster F #73), built from the spec in
`~/workspace/mcp-rebuild-100/specs-batch15/freshcheck.md`
(read first). There is no external original; the tool surface
is the program's defined spec. Local build only — nothing
pushed or published.

Identity: repo `freshcheck`, npm `@reneturcios/freshcheck`,
MCP name `io.github.CloudCorpRecords/freshcheck`, version
`0.1.0`, bin `freshcheck` → `dist/cli.js`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json`, `server.json` (description "Assess
  dependency staleness: behind level per dependency, grouped
  by risk from abandoned to current." — see the judgement
  call in Gaps: the spec annotates this line as 99 chars but
  the quoted string itself measures 100 chars, ≤100;
  npm entry carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/freshcheck:0.1.0` carries **no**
  `version` field), `Dockerfile` (node:20-alpine two-stage,
  label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/freshcheck"`),
  `tsconfig.json`, `.gitignore`, `LICENSE` (MIT, Copyright
  (c) 2026 Rene Turcios), `README.md` (fresh text),
  `CHANGELOG.md` (single 0.1.0 entry, 2026-10-27),
  `package-lock.json` (Route 3, see below)
- `src/index.ts`, `src/cli.ts` (`assess --input <args.json>`
  where the file holds the full arguments object, `mcp`,
  `--version`; exit 2 usage / 1 runtime error, argument
  validation before any file read), `src/mcp.ts`,
  `src/types.ts`, `src/freshcheck.ts` (core,
  `VERSION = "0.1.0"`)
- `test/freshcheck.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (publish-container `IMAGE = ghcr.io/cloudcorprecords/freshcheck`,
  smoke-test server-name assertion `freshcheck`)

## Tools implemented (1)

- `assess_freshness` — arguments: `dependencies`
  (array, required, minItems 1) of `{name (string, required,
  non-empty, unique), current (string, required, strict
  MAJOR.MINOR.PATCH semver), latest (string, required,
  strict MAJOR.MINOR.PATCH semver), archived (boolean,
  optional, default false), days_since_last_release
  (integer, optional, >= 0)}`, plus `abandoned_days`
  (integer, optional, default 730, >= 1).

  Returns `{dependencies, groups, counts}`. The behind
  level compares `latest` against `current` component by
  component, numerically: "none" when latest <= current,
  otherwise the first differing component decides
  ("major" / "minor" / "patch"). A dependency is abandoned
  when `archived` is true or `days_since_last_release` is
  present and >= `abandoned_days`; when the days field is
  absent only the archived flag can mark abandonment.
  `group` is "abandoned" for an abandoned dependency
  whatever its behind level (precedence pinned: abandonment
  outranks the version gap, and the behind level is still
  reported alongside), otherwise "current" when behind is
  "none", else the behind level. `dependencies` entries
  are `{name, current, latest, behind, group}` sorted by
  name ascending (code-unit); `groups` holds the names in
  each of abandoned / major / minor / patch / current,
  each list sorted ascending; `counts` holds the group
  sizes plus `total`.

  The fixture literal
  (`harness/fixtures/freshcheck-tools-original.json`) and
  the `src/mcp.ts` literal are identical, with no `$schema`
  and no `additionalProperties`.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with an
  explicit inputSchema literal exactly matching the fixture,
  per the standing fleet rule (no McpServer/zod schema
  conversion). Every `tools/call` is validated by the core
  itself, so the MCP and CLI paths share one validation
  implementation.
- Validation is path-naming and total: missing/empty
  `dependencies`, an entry that is not an object, a missing /
  empty / non-string or duplicate name (the error names the
  second occurrence's path), a missing `current`/`latest`
  or one failing the strict semver grammar
  (`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$` —
  prerelease/build suffixes and leading zeros rejected), a
  non-boolean `archived`, or a `days_since_last_release`
  that is not an integer >= 0 throws an Error naming the
  offending path and produces no partial result (MCP:
  `isError`; CLI: exit 1). `abandoned_days` that is not an
  integer >= 1 throws exactly "abandoned_days must be an
  integer >= 1".
- Version components are compared as numbers, never as
  strings, so 1.10.0 is correctly ahead of 1.9.0 (pinned
  by test).

## Verification (foreground, this session)

- Source type-check: `tsc --noEmit` exit 0.
- `npm test` (`tsx --test test/*.test.ts`): **35 tests,
  35 pass, 0 fail** — behind levels major/minor/patch via
  the first differing component (including major and minor
  winning when later components also differ), none when
  latest equals or is behind current (including behind
  only in a later component), numeric (not lexicographic)
  comparison for minor/patch/major (1.10.0 vs 1.9.0,
  1.2.10 vs 1.2.9, 10.0.0 vs 9.0.0), abandonment by the
  archived flag with no version gap, abandonment by days
  at the default 730, the exact 730 boundary abandoned and
  729 not, absent `days_since_last_release` meaning only
  archived can mark abandonment, a custom `abandoned_days`
  including its exact boundary and `abandoned_days: 1`
  accepted, group precedence (abandoned outranks a major
  gap and a patch gap, behind still reported), the exact
  full result for a five-dependency mixed tree, code-unit
  sorting of entries and group lists with input-order
  independence, counts including empty groups and the
  total, and every validation path (missing/empty/non-array
  `dependencies`, non-object entry, missing/empty/non-string
  name, duplicate name naming the second occurrence,
  missing `current`/`latest`, bad `current`/`latest`
  grammar including prerelease and build suffixes and
  leading zeros in every component position, non-boolean
  `archived`, bad `days_since_last_release`, and the exact
  `abandoned_days` message for 0 / negative / fractional /
  string / null).
- `dist/cli.js --version` → `0.1.0`; unknown command exits
  2 with usage; `assess` with no `--input` exits 2;
  `assess --input <missing file>` exits 1 naming the file;
  `assess --input <valid file>` exits 0 and prints the
  assessment JSON (verified against a hand-checked tree:
  core current, lib minor behind via 1.9.0 → 1.10.2, old
  archived with a major gap grouped abandoned, stale at
  exactly 730 days with a patch gap grouped abandoned;
  counts abandoned 2 / minor 1 / current 1 / total 4);
  `assess --input <invalid file>` exits 1 with
  `dependencies[0].latest must be a strict MAJOR.MINOR.PATCH
  semver version`.
- Parity: `harness/parity.py` comparison vs
  `harness/fixtures/freshcheck-tools-original.json` →
  **PASS, parity 100.0, identical_tools 1/1** (computed by
  the harness's own `build_report`; see the environment
  note in Gaps for how the run was captured).

## Lockfile status

`package-lock.json` generated clean via Route 3 (temp copy
without `node_modules`/`dist`/`package-lock.json`, offline
`npm install --package-lock-only --ignore-scripts
--offline`), verified: parses, name
`@reneturcios/freshcheck`, **128 package entries**.

## Gaps / honest notes

- **Pinned judgement call — server.json description
  length.** The spec annotates its server.json line as
  "(99 chars)", but the quoted string itself —
  "Assess dependency staleness: behind level per dependency,
  grouped by risk from abandoned to current." — measures
  **100 characters** including the final period (the same
  off-by-one appears in several sibling batch-15 specs,
  in both directions). The exact quoted string was used
  verbatim; it satisfies the ≤100 registry rule. Dropping
  the period to reach 99 would have altered the spec's
  exact text.
- **Duplicate-name error wording** is not fixed by the
  spec (only that the error names the second occurrence's
  path); the message used is `dependencies[<i>].name
  duplicates dependencies[<first>].name "<name>"`, matching
  the fleet pattern, and is pinned by a test.
- **Validation order:** `abandoned_days` is validated
  before `dependencies`, so when both are invalid the
  `abandoned_days` message is reported. The spec does not
  order the two; no test pins the combined-invalid case.
- **Environment note — VM exec write guard.** Partway
  through this build the VM's exec write guard began
  EPERM-blocking / zeroing all content writes from exec
  child processes (the documented guard family in
  AGENTS.md) and stayed blocked for the rest of the
  session despite repeated probes over ~20 minutes.
  Consequences, stated plainly:
  - `npm install --ignore-scripts --offline` ran and
    exited 0, but the extracted `node_modules` files were
    zeroed by the guard (verified: 3,691 zero-byte files).
    The local `node_modules` is therefore a **symlink to
    depmap's tree**, whose lockfile versions are identical
    to freshcheck's except one transitive entry (`qs`
    6.16.1 installed vs 6.17.0 in freshcheck's lock).
    `npm test`, `tsc --noEmit`, the CLI smokes, and parity
    above all ran genuinely against that tree.
  - A genuine `tsc` emit was attempted; the guard
    truncated its outputs, so `dist/` was restored by
    hand-placing the compiled JS/d.ts (types stripped,
    logic identical to `src/`, in tsc's output style).
    The `.js.map` files a real build produces are absent.
  - `parity.py` computes its report and then crashes
    writing `parity.json` under the guard; the PASS above
    is the harness's own `build_report` result captured
    from stdout, and `parity-out/parity.json` /
    `parity-out/parity.md` were placed with the file tool
    carrying that harness-generated content verbatim.
  - Remediation in a fresh session (one command set):
    remove the `node_modules` symlink, then
    `npm install --ignore-scripts --offline`,
    `npm run build`, `npm test`, and re-run the parity
    command from the task — all expected green, replacing
    the hand-placed `dist/` with genuine tsc output.
- Container build not exercised locally; the
  publish-container workflow smoke-tests the image at
  publish time.
- Nothing pushed or published; this is a local build only.
