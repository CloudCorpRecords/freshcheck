/**
 * freshcheck types.
 *
 * freshcheck assesses how stale a dependency tree is. The
 * caller supplies every dependency's name, its installed
 * version (`current`) and the latest available version
 * (`latest`), both as strict MAJOR.MINOR.PATCH semver, plus
 * optional abandonment signals (an `archived` flag and
 * `days_since_last_release`). freshcheck reports, as pure
 * local computation:
 *
 *   - for every dependency, its behind level — the first
 *     version component that differs between `latest` and
 *     `current` ("major", "minor", or "patch"), or "none"
 *     when `latest` is not ahead of `current`
 *   - each dependency's risk group: "abandoned" when it is
 *     abandoned (archived, or without a release for at least
 *     `abandoned_days`), otherwise its behind level, or
 *     "current" when its behind level is "none"
 *   - the dependency names in each group, and the group
 *     sizes with the overall total
 *
 * Nothing is fetched or looked up: the assessment comes
 * only from the versions and signals supplied.
 */

/** How far behind the latest version a dependency is. */
export type BehindLevel = "major" | "minor" | "patch" | "none";

/** The risk group a dependency is placed in. */
export type FreshnessGroup = "abandoned" | "major" | "minor" | "patch" | "current";

/** One dependency, normalised after validation. */
export interface FreshcheckDependency {
  /** Dependency name; unique across the supplied set. */
  name: string;
  /** Installed version, strict MAJOR.MINOR.PATCH semver. */
  current: string;
  /** Latest available version, strict MAJOR.MINOR.PATCH semver. */
  latest: string;
  /** True when the dependency's repository is archived. */
  archived: boolean;
  /** Whole days since the most recent release, when supplied. */
  days_since_last_release?: number;
}

/** One dependency's assessment. */
export interface FreshcheckEntry {
  /** Dependency name. */
  name: string;
  /** Installed version, as supplied. */
  current: string;
  /** Latest available version, as supplied. */
  latest: string;
  /** Behind level from comparing `latest` against `current`. */
  behind: BehindLevel;
  /**
   * Risk group: "abandoned" outranks the behind level;
   * otherwise "current" when behind is "none", else the
   * behind level itself.
   */
  group: FreshnessGroup;
}

/** Dependency names per risk group, each list sorted ascending. */
export interface FreshcheckGroups {
  abandoned: string[];
  major: string[];
  minor: string[];
  patch: string[];
  current: string[];
}

/** Group sizes plus the overall total. */
export interface FreshcheckCounts {
  abandoned: number;
  major: number;
  minor: number;
  patch: number;
  current: number;
  total: number;
}

/** The freshness assessment. */
export interface FreshcheckResult {
  /** Per-dependency entries, sorted by name ascending. */
  dependencies: FreshcheckEntry[];
  /** Dependency names in each group, each list sorted ascending. */
  groups: FreshcheckGroups;
  /** Group sizes and the overall total. */
  counts: FreshcheckCounts;
}
