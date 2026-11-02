# freshcheck

A dependency tree quietly ages. Some packages are a patch
behind and can be bumped without a thought, some are a
major version behind and need a planned upgrade, and some
have not released anything in years — or their repository
has been archived outright — and are a risk whatever
version they are on. freshcheck takes the tree you have —
each dependency's name, installed version, and latest
available version, with optional abandonment signals — and
sorts it into exactly those risk groups:

- **Behind level** — for every dependency, `current` and
  `latest` are compared component by component, numerically.
  The first component that differs decides: `major`,
  `minor`, or `patch`. When `latest` is not ahead of
  `current` — equal, or even behind it — the level is
  `none`. Versions must be strict `MAJOR.MINOR.PATCH`
  semver: three numeric components, no leading zeros, no
  prerelease or build suffix.
- **Abandoned** — a dependency counts as abandoned when
  its repository is archived, or when it has gone at least
  `abandoned_days` without a release (default 730, measured
  by the optional `days_since_last_release`). Abandonment
  outranks the version gap: an archived package two majors
  behind is grouped `abandoned`, with its behind level
  still reported alongside so the size of the gap is not
  lost.
- **Groups and counts** — every dependency lands in one
  group — `abandoned`, `major`, `minor`, `patch`, or
  `current` (behind level `none`, not abandoned) — and the
  result carries the names in each group plus the group
  sizes and the overall total.

Every list in the result is sorted ascending, so the same
tree always yields exactly the same assessment. Malformed
input — a missing or empty dependency list, a missing,
empty, or duplicate name, a version that is not strict
semver, a wrongly typed signal — is a validation error
naming the offending path (for example
`dependencies[1].latest must be a strict MAJOR.MINOR.PATCH
semver version`), and no partial assessment is produced.
The computation is pure and local: no network, no
registry lookups, no files read beyond the input you pass
in — freshcheck judges only the versions and signals you
supply.

## CLI

```bash
npx @reneturcios/freshcheck assess --input args.json
npx @reneturcios/freshcheck --version
```

`args.json` contains the full arguments object:

```json
{
  "dependencies": [
    { "name": "core", "current": "2.0.0", "latest": "2.0.0" },
    { "name": "lib", "current": "1.9.0", "latest": "1.10.2" },
    { "name": "old", "current": "0.8.1", "latest": "3.0.0", "archived": true }
  ]
}
```

`archived` defaults to `false` per dependency, and
`abandoned_days` defaults to `730` for the whole call.
The assessment is printed as JSON:

```json
{
  "dependencies": [
    { "name": "core", "current": "2.0.0", "latest": "2.0.0", "behind": "none", "group": "current" },
    { "name": "lib", "current": "1.9.0", "latest": "1.10.2", "behind": "minor", "group": "minor" },
    { "name": "old", "current": "0.8.1", "latest": "3.0.0", "behind": "major", "group": "abandoned" }
  ],
  "groups": {
    "abandoned": ["old"],
    "major": [],
    "minor": ["lib"],
    "patch": [],
    "current": ["core"]
  },
  "counts": { "abandoned": 1, "major": 0, "minor": 1, "patch": 0, "current": 1, "total": 3 }
}
```

Note `lib`: 1.10.2 is a minor step ahead of 1.9.0 because
components compare numerically, not lexicographically.

Exit codes: `0` on success, `1` on a runtime error
(including an unreadable or invalid input file, or invalid
input), `2` on a usage error.

## MCP server

```bash
npx -y @reneturcios/freshcheck mcp
```

MCP client config:

```json
{
  "mcpServers": {
    "freshcheck": {
      "command": "npx",
      "args": ["-y", "@reneturcios/freshcheck", "mcp"]
    }
  }
}
```

### Tools

- `assess_freshness` — Assess how stale a dependency tree
  is, grouped by risk.
  - `dependencies` (array, required, at least one) —
    dependencies as `{name, current, latest, archived?,
    days_since_last_release?}` objects; `name` is unique
    across the set, and `current` / `latest` are strict
    `MAJOR.MINOR.PATCH` semver versions
  - `abandoned_days` (integer, optional, default 730,
    at least 1) — days without a release at which a
    dependency counts as abandoned

  Returns `{dependencies, groups, counts}`.

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/freshcheck
docker run --rm -v "$PWD:/w" ghcr.io/cloudcorprecords/freshcheck assess --input /w/args.json
```

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # tsx --test test/*.test.ts (pure local, no network)
npm run dev     # run the CLI from source
```

## License

MIT — Copyright (c) 2026 Rene Turcios
