import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assessFreshness } from "../src/freshcheck.js";

/**
 * All tests are pure local computation over inline
 * dependency sets: no filesystem, no network. Each behaviour
 * in the spec is pinned by its own case, including the
 * behind levels, numeric component comparison, abandonment
 * by flag and by days (with its exact boundary), group
 * precedence, sorting, counts, a custom abandoned_days, and
 * every validation path.
 */

const dep = (
  name: string,
  current: string,
  latest: string,
  extra?: Record<string, unknown>,
) => ({ name, current, latest, ...(extra ?? {}) });

describe("assessFreshness — behind levels", () => {
  it("reports major when the major component is the first that differs", () => {
    const out = assessFreshness([dep("a", "1.2.3", "2.0.0")]);
    assert.equal(out.dependencies[0].behind, "major");
    assert.equal(out.dependencies[0].group, "major");
  });

  it("reports major even when minor and patch also differ", () => {
    const out = assessFreshness([dep("a", "1.9.9", "2.0.1")]);
    assert.equal(out.dependencies[0].behind, "major");
  });

  it("reports minor when only the minor component onwards differs", () => {
    const out = assessFreshness([dep("a", "1.2.3", "1.3.0")]);
    assert.equal(out.dependencies[0].behind, "minor");
    assert.equal(out.dependencies[0].group, "minor");
  });

  it("reports minor even when the patch component also differs", () => {
    const out = assessFreshness([dep("a", "1.2.9", "1.3.1")]);
    assert.equal(out.dependencies[0].behind, "minor");
  });

  it("reports patch when only the patch component differs", () => {
    const out = assessFreshness([dep("a", "1.2.3", "1.2.4")]);
    assert.equal(out.dependencies[0].behind, "patch");
    assert.equal(out.dependencies[0].group, "patch");
  });

  it("reports none when latest equals current", () => {
    const out = assessFreshness([dep("a", "1.2.3", "1.2.3")]);
    assert.equal(out.dependencies[0].behind, "none");
    assert.equal(out.dependencies[0].group, "current");
  });

  it("reports none when latest is behind current", () => {
    const out = assessFreshness([dep("a", "2.0.0", "1.9.9")]);
    assert.equal(out.dependencies[0].behind, "none");
    assert.equal(out.dependencies[0].group, "current");
  });

  it("reports none when latest is behind current only in a later component", () => {
    const out = assessFreshness([dep("a", "1.10.0", "1.9.9")]);
    assert.equal(out.dependencies[0].behind, "none");
  });

  it("compares components numerically, not lexicographically: 1.10.0 is ahead of 1.9.0", () => {
    const out = assessFreshness([dep("a", "1.9.0", "1.10.0")]);
    assert.equal(out.dependencies[0].behind, "minor");
  });

  it("compares patch and major components numerically as well", () => {
    assert.equal(
      assessFreshness([dep("a", "1.2.9", "1.2.10")]).dependencies[0].behind,
      "patch",
    );
    assert.equal(
      assessFreshness([dep("a", "9.0.0", "10.0.0")]).dependencies[0].behind,
      "major",
    );
  });
});

describe("assessFreshness — abandonment", () => {
  it("marks a dependency abandoned when archived is true, even with no version gap", () => {
    const out = assessFreshness([dep("a", "1.0.0", "1.0.0", { archived: true })]);
    assert.equal(out.dependencies[0].behind, "none");
    assert.equal(out.dependencies[0].group, "abandoned");
    assert.deepEqual(out.groups.abandoned, ["a"]);
    assert.deepEqual(out.groups.current, []);
  });

  it("marks a dependency abandoned when days_since_last_release reaches the default 730", () => {
    const out = assessFreshness([
      dep("a", "1.0.0", "1.0.1", { days_since_last_release: 800 }),
    ]);
    assert.equal(out.dependencies[0].group, "abandoned");
  });

  it("treats exactly abandoned_days days as abandoned (the boundary is inclusive)", () => {
    const out = assessFreshness([
      dep("a", "1.0.0", "1.0.0", { days_since_last_release: 730 }),
    ]);
    assert.equal(out.dependencies[0].group, "abandoned");
  });

  it("does not mark a dependency abandoned one day below the boundary", () => {
    const out = assessFreshness([
      dep("a", "1.0.0", "1.0.0", { days_since_last_release: 729 }),
    ]);
    assert.equal(out.dependencies[0].group, "current");
  });

  it("cannot mark abandonment by days when days_since_last_release is absent", () => {
    // No days field and no archived flag: however old the
    // version gap looks, only the archived flag could mark
    // abandonment, and it is absent too.
    const out = assessFreshness([dep("a", "0.1.0", "0.1.0")]);
    assert.equal(out.dependencies[0].group, "current");
    const explicit = assessFreshness([
      dep("a", "0.1.0", "0.1.0", { archived: false }),
    ]);
    assert.equal(explicit.dependencies[0].group, "current");
  });

  it("honours a custom abandoned_days, including its exact boundary", () => {
    const at = assessFreshness(
      [dep("a", "1.0.0", "1.0.0", { days_since_last_release: 30 })],
      30,
    );
    assert.equal(at.dependencies[0].group, "abandoned");
    const below = assessFreshness(
      [dep("a", "1.0.0", "1.0.0", { days_since_last_release: 29 })],
      30,
    );
    assert.equal(below.dependencies[0].group, "current");
    // The same 100 days that are fine under the default 730
    // are abandoned under a custom threshold of 100.
    const custom = assessFreshness(
      [dep("a", "1.0.0", "1.0.0", { days_since_last_release: 100 })],
      100,
    );
    assert.equal(custom.dependencies[0].group, "abandoned");
    const underDefault = assessFreshness([
      dep("a", "1.0.0", "1.0.0", { days_since_last_release: 100 }),
    ]);
    assert.equal(underDefault.dependencies[0].group, "current");
  });

  it("accepts abandoned_days of 1, the smallest valid threshold", () => {
    const out = assessFreshness(
      [dep("a", "1.0.0", "1.0.0", { days_since_last_release: 1 })],
      1,
    );
    assert.equal(out.dependencies[0].group, "abandoned");
    const zero = assessFreshness(
      [dep("a", "1.0.0", "1.0.0", { days_since_last_release: 0 })],
      1,
    );
    assert.equal(zero.dependencies[0].group, "current");
  });
});

describe("assessFreshness — groups, sorting, counts", () => {
  it("gives abandoned precedence over a major gap while still reporting the behind level", () => {
    const out = assessFreshness([dep("a", "0.8.1", "3.0.0", { archived: true })]);
    assert.equal(out.dependencies[0].behind, "major");
    assert.equal(out.dependencies[0].group, "abandoned");
    assert.deepEqual(out.groups.major, []);
    assert.deepEqual(out.groups.abandoned, ["a"]);
    assert.equal(out.counts.major, 0);
    assert.equal(out.counts.abandoned, 1);
  });

  it("gives days-based abandonment precedence over a patch gap", () => {
    const out = assessFreshness([
      dep("a", "1.0.0", "1.0.1", { days_since_last_release: 900 }),
    ]);
    assert.equal(out.dependencies[0].behind, "patch");
    assert.equal(out.dependencies[0].group, "abandoned");
  });

  it("produces the exact full result for a mixed tree, sorted by name", () => {
    const out = assessFreshness([
      dep("zeta", "1.0.0", "1.0.1"),
      dep("alpha", "2.0.0", "2.0.0"),
      dep("mid", "1.0.0", "2.0.0", { archived: true }),
      dep("beta", "1.1.0", "1.3.0"),
      dep("gamma", "3.0.0", "4.0.0"),
    ]);
    assert.deepEqual(out, {
      dependencies: [
        { name: "alpha", current: "2.0.0", latest: "2.0.0", behind: "none", group: "current" },
        { name: "beta", current: "1.1.0", latest: "1.3.0", behind: "minor", group: "minor" },
        { name: "gamma", current: "3.0.0", latest: "4.0.0", behind: "major", group: "major" },
        { name: "mid", current: "1.0.0", latest: "2.0.0", behind: "major", group: "abandoned" },
        { name: "zeta", current: "1.0.0", latest: "1.0.1", behind: "patch", group: "patch" },
      ],
      groups: {
        abandoned: ["mid"],
        major: ["gamma"],
        minor: ["beta"],
        patch: ["zeta"],
        current: ["alpha"],
      },
      counts: { abandoned: 1, major: 1, minor: 1, patch: 1, current: 1, total: 5 },
    });
  });

  it("sorts entries and group lists in code-unit order, independent of input order", () => {
    const input = [
      dep("zebra", "1.0.0", "1.0.1"),
      dep("Alpha", "1.0.0", "1.0.1"),
      dep("mid", "1.0.0", "1.0.1"),
    ];
    const out = assessFreshness(input);
    assert.deepEqual(
      out.dependencies.map((d) => d.name),
      ["Alpha", "mid", "zebra"],
    );
    assert.deepEqual(out.groups.patch, ["Alpha", "mid", "zebra"]);
    assert.deepEqual(assessFreshness([...input].reverse()), out);
  });

  it("counts every group and the total, including empty groups", () => {
    const out = assessFreshness([
      dep("a", "1.0.0", "1.0.0"),
      dep("b", "1.0.0", "1.0.0"),
    ]);
    assert.deepEqual(out.counts, {
      abandoned: 0,
      major: 0,
      minor: 0,
      patch: 0,
      current: 2,
      total: 2,
    });
    assert.deepEqual(out.groups.current, ["a", "b"]);
  });
});

describe("assessFreshness — validation", () => {
  it("rejects missing, empty, or non-array dependencies", () => {
    assert.throws(() => assessFreshness(undefined), /dependencies is required/);
    assert.throws(
      () => assessFreshness([]),
      /dependencies must be a non-empty array/,
    );
    assert.throws(
      () => assessFreshness("nope"),
      /dependencies must be a non-empty array/,
    );
  });

  it("rejects an entry that is not an object, naming the path", () => {
    assert.throws(() => assessFreshness([42]), /dependencies\[0\] must be an object/);
    assert.throws(
      () => assessFreshness([dep("a", "1.0.0", "1.0.0"), null]),
      /dependencies\[1\] must be an object/,
    );
  });

  it("rejects a missing name, naming the path", () => {
    assert.throws(
      () => assessFreshness([{ current: "1.0.0", latest: "1.0.0" }]),
      /dependencies\[0\]\.name is required/,
    );
  });

  it("rejects an empty or non-string name, naming the path", () => {
    assert.throws(
      () => assessFreshness([dep("", "1.0.0", "1.0.0")]),
      /dependencies\[0\]\.name must be a non-empty string/,
    );
    assert.throws(
      () => assessFreshness([{ name: 42, current: "1.0.0", latest: "1.0.0" }]),
      /dependencies\[0\]\.name must be a non-empty string/,
    );
  });

  it("rejects a duplicate name, naming the second occurrence's path", () => {
    assert.throws(
      () =>
        assessFreshness([
          dep("a", "1.0.0", "1.0.0"),
          dep("b", "1.0.0", "1.0.0"),
          dep("a", "2.0.0", "2.0.0"),
        ]),
      /dependencies\[2\]\.name duplicates dependencies\[0\]\.name "a"/,
    );
  });

  it("rejects a missing current or latest, naming the path", () => {
    assert.throws(
      () => assessFreshness([{ name: "a", latest: "1.0.0" }]),
      /dependencies\[0\]\.current is required/,
    );
    assert.throws(
      () => assessFreshness([{ name: "a", current: "1.0.0" }]),
      /dependencies\[0\]\.latest is required/,
    );
  });

  it("rejects a current that is not strict semver, naming the path", () => {
    for (const bad of ["1.2", "v1.2.3", "1.2.3.4", "latest", ""]) {
      assert.throws(
        () => assessFreshness([dep("a", bad, "1.0.0")]),
        /dependencies\[0\]\.current must be a strict MAJOR\.MINOR\.PATCH semver version/,
      );
    }
    assert.throws(
      () => assessFreshness([{ name: "a", current: 123, latest: "1.0.0" }]),
      /dependencies\[0\]\.current must be a strict MAJOR\.MINOR\.PATCH semver version/,
    );
  });

  it("rejects a latest that is not strict semver, naming the path", () => {
    assert.throws(
      () => assessFreshness([dep("a", "1.0.0", "2.0")]),
      /dependencies\[0\]\.latest must be a strict MAJOR\.MINOR\.PATCH semver version/,
    );
    assert.throws(
      () =>
        assessFreshness([
          dep("a", "1.0.0", "1.0.0"),
          dep("b", "1.0.0", "x.y.z"),
        ]),
      /dependencies\[1\]\.latest must be a strict MAJOR\.MINOR\.PATCH semver version/,
    );
  });

  it("rejects prerelease and build suffixes in either version", () => {
    assert.throws(
      () => assessFreshness([dep("a", "1.0.0-alpha", "1.0.0")]),
      /dependencies\[0\]\.current must be a strict/,
    );
    assert.throws(
      () => assessFreshness([dep("a", "1.0.0", "1.0.0-rc.1")]),
      /dependencies\[0\]\.latest must be a strict/,
    );
    assert.throws(
      () => assessFreshness([dep("a", "1.0.0+build.5", "1.0.0")]),
      /dependencies\[0\]\.current must be a strict/,
    );
    assert.throws(
      () => assessFreshness([dep("a", "1.0.0", "1.0.0+build")]),
      /dependencies\[0\]\.latest must be a strict/,
    );
  });

  it("rejects leading zeros in any version component", () => {
    assert.throws(
      () => assessFreshness([dep("a", "01.0.0", "1.0.0")]),
      /dependencies\[0\]\.current must be a strict/,
    );
    assert.throws(
      () => assessFreshness([dep("a", "1.0.0", "1.02.0")]),
      /dependencies\[0\]\.latest must be a strict/,
    );
    assert.throws(
      () => assessFreshness([dep("a", "1.0.00", "1.0.0")]),
      /dependencies\[0\]\.current must be a strict/,
    );
    // A single zero component is valid, not a leading zero.
    assert.doesNotThrow(() => assessFreshness([dep("a", "0.0.0", "0.0.1")]));
  });

  it("rejects an archived flag that is not a boolean, naming the path", () => {
    assert.throws(
      () => assessFreshness([dep("a", "1.0.0", "1.0.0", { archived: "yes" })]),
      /dependencies\[0\]\.archived must be a boolean/,
    );
    assert.throws(
      () => assessFreshness([dep("a", "1.0.0", "1.0.0", { archived: 1 })]),
      /dependencies\[0\]\.archived must be a boolean/,
    );
  });

  it("rejects days_since_last_release that is not an integer >= 0, naming the path", () => {
    for (const bad of [-1, 1.5, "30"]) {
      assert.throws(
        () =>
          assessFreshness([
            dep("a", "1.0.0", "1.0.0", { days_since_last_release: bad }),
          ]),
        /dependencies\[0\]\.days_since_last_release must be an integer >= 0/,
      );
    }
    // Zero days is valid: a release today.
    assert.doesNotThrow(() =>
      assessFreshness([dep("a", "1.0.0", "1.0.0", { days_since_last_release: 0 })]),
    );
  });

  it("rejects abandoned_days that is not an integer >= 1, with the exact spec message", () => {
    for (const bad of [0, -5, 1.5, "730", null]) {
      assert.throws(
        () => assessFreshness([dep("a", "1.0.0", "1.0.0")], bad),
        (err: unknown) =>
          err instanceof Error && err.message === "abandoned_days must be an integer >= 1",
      );
    }
  });
});
