/**
 * Pure, dependency-free helpers for pi-clear-cmd.
 *
 * Slash suggestions produced by pi core use `value` WITHOUT the leading `/`
 * (the command name, e.g. `hc`), while `prefix` holds the raw text before
 * the cursor (e.g. `/h`). File-path suggestions contain `/` in `value`.
 */

/** Minimal structural view of a suggestion item returned by a provider. */
export interface SuggestionItem {
 value: string;
 label: string;
 description?: string;
}

/** Minimal structural view of a provider result. */
export interface Suggestions {
 items: SuggestionItem[];
 prefix: string;
}

/**
 * Built-in pi slash commands (verified against pi 0.84.4
 * `dist/core/slash-commands.js`). These are never filtered, even if listed
 * in the hidden config: pi-clear-cmd only hides plugin commands.
 */
export const BUILTIN_SLASH_COMMANDS: ReadonlySet<string> = new Set([
 "settings",
 "model",
 "tree",
 "thinking",
 "scoped-models",
 "export",
 "import",
 "share",
 "copy",
 "name",
 "session",
 "changelog",
 "hotkeys",
 "fork",
 "clone",
 "trust",
 "login",
 "logout",
 "new",
 "compact",
 "resume",
 "reload",
 "quit",
]);

/**
 * Normalize raw `hidden` entries into a deduplicated list of command names.
 * Trims whitespace, strips one leading `/`, drops empty/non-string entries.
 * Matching stays case-sensitive (command names are case-sensitive in pi).
 */
export function normalizeHiddenEntries(entries: unknown): string[] {
 if (!Array.isArray(entries)) return [];
 const out: string[] = [];
 const seen = new Set<string>();
 for (const entry of entries) {
  if (typeof entry !== "string") continue;
  let name = entry.trim();
  if (name.startsWith("/")) name = name.slice(1).trim();
  if (!name || seen.has(name)) continue;
  seen.add(name);
  out.push(name);
 }
 return out;
}

/**
 * Parse `pi-clear-cmd.json` text into a list of hidden command names.
 * Never throws: invalid JSON or a wrong shape yields an empty list.
 */
export function parseHiddenConfig(text: string): string[] {
 let data: unknown;
 try {
  data = JSON.parse(text);
 } catch {
  return [];
 }
 if (typeof data !== "object" || data === null) return [];
 return normalizeHiddenEntries((data as { hidden?: unknown }).hidden);
}

/**
 * Extract the command name from a suggestion `value`, or `null` when the
 * value is not a plain command name (file paths, tokens with whitespace).
 */
export function commandNameFromValue(value: string): string | null {
 if (!value || value.includes("/") || /\s/.test(value)) return null;
 return value;
}

/**
 * Check whether a suggestion value refers to a hidden command.
 * Also covers conflict-renamed duplicates: hiding `hc` hides `hc:1`,
 * `hc:2`, … (pi renames duplicate command registrations that way),
 * but never matches a different command that merely shares a prefix.
 */
export function matchesHidden(
 value: string,
 hidden: ReadonlySet<string>,
): boolean {
 const name = commandNameFromValue(value);
 if (name === null) return false;
 if (hidden.has(name)) return true;
 const base = name.replace(/:\d+$/, "");
 if (base !== name && hidden.has(base)) return true;
 return false;
}

/**
 * Mirror of pi core's slash-branch condition: the user is typing a slash
 * command when the text before the cursor on the current line starts with
 * `/` and contains no space (i.e. the cursor is still in the first token).
 */
export function isSlashCommandInput(
 lines: string[],
 cursorLine: number,
 cursorCol: number,
): boolean {
 const line = lines[cursorLine];
 if (typeof line !== "string") return false;
 const before = line.slice(0, Math.max(0, cursorCol));
 return before.startsWith("/") && !before.includes(" ");
}

/**
 * Remove hidden plugin commands from a provider result.
 * Passes the result through untouched when there is nothing to hide;
 * returns `null` when every item was filtered (renders as "no suggestions").
 * Built-in commands and non-command items (file paths) always survive.
 */
export function filterSuggestions(
 result: Suggestions,
 hidden: ReadonlySet<string>,
): Suggestions | null {
 if (hidden.size === 0) return result;
 const items = result.items.filter((item) => {
  if (item.value.includes("/")) return true;
  if (BUILTIN_SLASH_COMMANDS.has(item.value)) return true;
  return !matchesHidden(item.value, hidden);
 });
 if (items.length === 0) return null;
 return { ...result, items };
}
