import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BUILTIN_SLASH_COMMANDS,
  commandNameFromValue,
  filterSuggestions,
  isSlashCommandInput,
  matchesHidden,
  normalizeHiddenEntries,
  parseHiddenConfig,
  type Suggestions,
} from "../src/filter.ts";

function suggestions(values: string[]): Suggestions {
  return {
    prefix: "/",
    items: values.map((value) => ({ value, label: value })),
  };
}

describe("normalizeHiddenEntries", () => {
  it("strips a leading slash and trims whitespace", () => {
    assert.deepEqual(
      normalizeHiddenEntries(["/hc", "  other  ", "/ spaced "]),
      ["hc", "other", "spaced"],
    );
  });

  it("drops empty entries, bare slashes and non-strings", () => {
    assert.deepEqual(
      normalizeHiddenEntries(["", "   ", "/", null, 42, {}, [], "ok"]),
      ["ok"],
    );
  });

  it("deduplicates after normalization and stays case-sensitive", () => {
    assert.deepEqual(normalizeHiddenEntries(["hc", "/hc", "HC", "hc "]), [
      "hc",
      "HC",
    ]);
  });

  it("returns [] for non-array input", () => {
    assert.deepEqual(normalizeHiddenEntries(undefined), []);
    assert.deepEqual(normalizeHiddenEntries("hc"), []);
    assert.deepEqual(normalizeHiddenEntries({ hidden: ["hc"] }), []);
  });
});

describe("parseHiddenConfig", () => {
  it("parses { hidden: [...] }", () => {
    assert.deepEqual(parseHiddenConfig('{ "hidden": ["hc", "/x"] }'), [
      "hc",
      "x",
    ]);
  });

  it("never throws: bad JSON, wrong shape, missing hidden", () => {
    assert.deepEqual(parseHiddenConfig("not json{"), []);
    assert.deepEqual(parseHiddenConfig("[1,2]"), []);
    assert.deepEqual(parseHiddenConfig("{}"), []);
    assert.deepEqual(parseHiddenConfig('{ "hidden": "hc" }'), []);
    assert.deepEqual(parseHiddenConfig(""), []);
  });
});

describe("commandNameFromValue", () => {
  it("accepts plain command names", () => {
    assert.equal(commandNameFromValue("hc"), "hc");
    assert.equal(commandNameFromValue("hc:1"), "hc:1");
  });

  it("rejects file paths, whitespace tokens and empties", () => {
    assert.equal(commandNameFromValue("src/hc"), null);
    assert.equal(commandNameFromValue("/hc"), null);
    assert.equal(commandNameFromValue("my cmd"), null);
    assert.equal(commandNameFromValue(""), null);
  });
});

describe("matchesHidden", () => {
  const hidden = new Set(["hc"]);

  it("matches exact names only", () => {
    assert.equal(matchesHidden("hc", hidden), true);
    assert.equal(matchesHidden("hcl", hidden), false);
    assert.equal(matchesHidden("h", hidden), false);
  });

  it("covers conflict-renamed duplicates (name:N)", () => {
    assert.equal(matchesHidden("hc:1", hidden), true);
    assert.equal(matchesHidden("hc:12", hidden), true);
  });

  it("does not treat a literal colon name as a duplicate", () => {
    assert.equal(matchesHidden("hc:x", new Set(["hc"])), false);
    assert.equal(matchesHidden("hc:x", new Set(["hc:x"])), true);
  });

  it("never matches file paths or whitespace tokens", () => {
    assert.equal(matchesHidden("dir/hc", hidden), false);
    assert.equal(matchesHidden("my hc", hidden), false);
  });
});

describe("isSlashCommandInput", () => {
  it("is true while the cursor is in the first slash token", () => {
    assert.equal(isSlashCommandInput(["/hc"], 0, 3), true);
    assert.equal(isSlashCommandInput(["/"], 0, 1), true);
    assert.equal(isSlashCommandInput(["/hc", "body"], 0, 1), true);
  });

  it("is false after a space, on other lines, or without a slash", () => {
    assert.equal(isSlashCommandInput(["/hc run"], 0, 7), false);
    assert.equal(isSlashCommandInput(["/hc", "body"], 1, 2), false);
    assert.equal(isSlashCommandInput(["say /hc"], 0, 7), false);
    assert.equal(isSlashCommandInput([""], 0, 0), false);
  });

  it("tolerates out-of-range cursor positions", () => {
    assert.equal(isSlashCommandInput(["/hc"], 0, 99), true);
    assert.equal(isSlashCommandInput(["/hc"], 5, 0), false);
    assert.equal(isSlashCommandInput([], 0, 0), false);
  });
});

describe("filterSuggestions", () => {
  it("removes hidden plugin commands and keeps the rest", () => {
    const out = filterSuggestions(
      suggestions(["hc", "help", "hc:1", "settings"]),
      new Set(["hc"]),
    );
    assert.deepEqual(
      out?.items.map((i) => i.value),
      ["help", "settings"],
    );
  });

  it("never filters built-in commands, even when listed", () => {
    for (const name of ["settings", "reload", "quit", "model"]) {
      assert.ok(BUILTIN_SLASH_COMMANDS.has(name), `expected builtin: ${name}`);
      const out = filterSuggestions(
        suggestions([name, "hc"]),
        new Set([name, "hc"]),
      );
      assert.deepEqual(
        out?.items.map((i) => i.value),
        [name],
      );
    }
  });

  it("keeps file-path items untouched", () => {
    const out = filterSuggestions(
      suggestions(["src/hc", "hc"]),
      new Set(["hc"]),
    );
    assert.deepEqual(
      out?.items.map((i) => i.value),
      ["src/hc"],
    );
  });

  it("returns null when everything is filtered", () => {
    assert.equal(filterSuggestions(suggestions(["hc"]), new Set(["hc"])), null);
  });

  it("passes the result through when there is nothing to hide", () => {
    const result = suggestions(["hc"]);
    assert.equal(filterSuggestions(result, new Set()), result);
  });

  it("preserves item fields and prefix on the filtered result", () => {
    const result: Suggestions = {
      prefix: "/h",
      items: [
        { value: "hc", label: "hc", description: "hidden" },
        { value: "help", label: "help", description: "kept" },
      ],
    };
    const out = filterSuggestions(result, new Set(["hc"]));
    assert.equal(out?.prefix, "/h");
    assert.deepEqual(out?.items, [
      { value: "help", label: "help", description: "kept" },
    ]);
  });
});
