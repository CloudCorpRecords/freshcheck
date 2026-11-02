/**
 * freshcheck core: assess how stale a dependency tree is.
 *
 *   assessFreshness(dependencies, abandonedDays?) -> assessment
 *
 * Behaviour:
 * - Behind level compares `latest` against `current`
 *   component by component, numerically. When `latest` is
 *   less than or equal to `current`, behind is "none".
 *   Otherwise the first component that differs decides:
 *   major differs -> "major"; else minor differs ->
 *   "minor"; else patch differs -> "patch".
 * - A dependency is ABANDONED when `archived` is true, or
 *   when `days_since_last_release` is present and greater
 *   than or equal to `abandoned_days` (default 730). When
 *   `days_since_last_release` is absent, only the archived
 *   flag can mark abandonment.
 * - `group` is "abandoned" for an abandoned dependency,
 *   whatever its behind level (abandonment outranks the
 *   version gap, and the behind level is still reported);
 *   otherwise "current" when behind is "none", else the
 *   behind level.
 * - `dependencies` in the result carries every supplied
 *   dependency as {name, current, latest, behind, group},
 *   sorted by name ascending (code-unit). `groups` holds
 *   the dependency names in each of the abandoned / major /
 *   minor / patch / current groups, each list sorted
 *   ascending, and `counts` holds the group sizes plus the
 *   overall total.
 *
 * Versions must be strict MAJOR.MINOR.PATCH semver:
 * ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ —
 * no prerelease or build suffix, and no leading zeros.
 *
 * Validation is strict and path-naming: any malformed input
 * throws an Error naming the offending path (for example
 * "dependencies[1].latest must be a strict MAJOR.MINOR.PATCH
 * semver version") and no partial result is produced.
 * `abandoned_days`, when present, must be an integer >= 1,
 * reported with the exact message "abandoned_days must be
 * an integer >= 1".
 */
import type {
  BehindLevel,
  FreshcheckCounts,
  FreshcheckDependency,
  FreshcheckEntry,
  FreshcheckGroups,
  FreshcheckResult,
} from "./types.js";

export const VERSION = "0.1.0";

/** Default days without a release that mark abandonment. */
export const DEFAULT_ABANDONED_DAYS = 730;

const VERSION_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function parseVersion(value: string): [number, number, number] {
  const parts = value.split(".");
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
}

/**
 * Behind level of `current` relative to `latest`: "none"
 * when latest <= current, otherwise decided by the first
 * component that differs. Components are compared
 * numerically, so 1.10.0 is ahead of 1.9.0.
 */
function behindLevel(current: string, latest: string): BehindLevel {
  const c = parseVersion(current);
  const l = parseVersion(latest);
  for (let i = 0; i < 3; i++) {
    if (l[i] < c[i]) return "none";
    if (l[i] > c[i]) {
      return i === 0 ? "major" : i === 1 ? "minor" : "patch";
    }
  }
  return "none";
}

/** Validate `abandoned_days`, defaulting to 730 when absent. */
function validateAbandonedDays(abandonedDays: unknown): number {
  if (abandonedDays === undefined) return DEFAULT_ABANDONED_DAYS;
  if (
    typeof abandonedDays !== "number" ||
    !Number.isInteger(abandonedDays) ||
    abandonedDays < 1
  ) {
    throw new Error("abandoned_days must be an integer >= 1");
  }
  return abandonedDays;
}

/**
 * Validate the raw `dependencies` argument and return the
 * normalised dependency list (archived defaulted to false).
 */
function validateDependencies(dependencies: unknown): FreshcheckDependency[] {
  if (dependencies === undefined) throw new Error("dependencies is required");
  if (!Array.isArray(dependencies) || dependencies.length === 0) {
    throw new Error("dependencies must be a non-empty array");
  }

  const validated: FreshcheckDependency[] = [];
  const indexByName = new Map<string, number>();
  dependencies.forEach((raw, i) => {
    const path = `dependencies[${i}]`;
    if (!isRecord(raw)) throw new Error(`${path} must be an object`);
    if (raw.name === undefined) throw new Error(`${path}.name is required`);
    if (typeof raw.name !== "string" || raw.name.length === 0) {
      throw new Error(`${path}.name must be a non-empty string`);
    }
    const firstIndex = indexByName.get(raw.name);
    if (firstIndex !== undefined) {
      throw new Error(
        `${path}.name duplicates dependencies[${firstIndex}].name "${raw.name}"`,
      );
    }
    indexByName.set(raw.name, i);

    for (const field of ["current", "latest"] as const) {
      if (raw[field] === undefined) throw new Error(`${path}.${field} is required`);
      if (typeof raw[field] !== "string" || !VERSION_PATTERN.test(raw[field])) {
        throw new Error(
          `${path}.${field} must be a strict MAJOR.MINOR.PATCH semver version`,
        );
      }
    }

    let archived = false;
    if (raw.archived !== undefined) {
      if (typeof raw.archived !== "boolean") {
        throw new Error(`${path}.archived must be a boolean`);
      }
      archived = raw.archived;
    }

    let daysSinceLastRelease: number | undefined;
    if (raw.days_since_last_release !== undefined) {
      if (
        typeof raw.days_since_last_release !== "number" ||
        !Number.isInteger(raw.days_since_last_release) ||
        raw.days_since_last_release < 0
      ) {
        throw new Error(`${path}.days_since_last_release must be an integer >= 0`);
      }
      daysSinceLastRelease = raw.days_since_last_release;
    }

    validated.push({
      name: raw.name,
      current: raw.current as string,
      latest: raw.latest as string,
      archived,
      ...(daysSinceLastRelease !== undefined
        ? { days_since_last_release: daysSinceLastRelease }
        : {}),
    });
  });

  return validated;
}

/** Assess how stale the supplied dependency tree is. */
export function assessFreshness(
  dependencies: unknown,
  abandonedDays?: unknown,
): FreshcheckResult {
  const threshold = validateAbandonedDays(abandonedDays);
  const valid = validateDependencies(dependencies);

  const groups: FreshcheckGroups = {
    abandoned: [],
    major: [],
    minor: [],
    patch: [],
    current: [],
  };

  const entries: FreshcheckEntry[] = [...valid]
    .sort((a, b) => byCodeUnit(a.name, b.name))
    .map((dep) => {
      const behind = behindLevel(dep.current, dep.latest);
      const abandoned =
        dep.archived ||
        (dep.days_since_last_release !== undefined &&
          dep.days_since_last_release >= threshold);
      const group = abandoned
        ? "abandoned"
        : behind === "none"
          ? "current"
          : behind;
      groups[group].push(dep.name);
      return {
        name: dep.name,
        current: dep.current,
        latest: dep.latest,
        behind,
        group,
      };
    });

  // Entries were built in ascending name order, so each
  // group list is already sorted ascending.
  const counts: FreshcheckCounts = {
    abandoned: groups.abandoned.length,
    major: groups.major.length,
    minor: groups.minor.length,
    patch: groups.patch.length,
    current: groups.current.length,
    total: entries.length,
  };

  return { dependencies: entries, groups, counts };
}

/** Render a payload as the JSON text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
