# Changelog

## 0.1.0 (2026-10-27)

- Initial release: `assess_freshness` MCP tool and `assess`
  CLI command assessing how stale a dependency tree is.
- Behind level per dependency from a strict
  MAJOR.MINOR.PATCH version comparison: the first component
  that differs between `current` and `latest` decides
  (`major`, `minor`, or `patch`), and `none` when the latest
  version is not ahead of the installed one.
- Risk grouping with pinned precedence: a dependency counts
  as `abandoned` when its repository is archived or it has
  gone at least `abandoned_days` (default 730) without a
  release, and abandonment outranks the version gap while
  the behind level is still reported. Otherwise the group
  is the behind level, or `current` when there is none.
- Sorted per-dependency entries, per-group name lists, and
  group counts with a total, plus path-naming validation
  errors for malformed input.
