/**
 * pi-clear-cmd — hide selected plugin slash commands from `/` autocomplete.
 *
 * Hiding only: execution is untouched, so a hidden command still runs when
 * typed in full. Built-in pi commands are never filtered.
 *
 * Config (`{ "hidden": ["hc", "/other-cmd"] }`) is read from, in order:
 *   1. `<agentDir>/extensions/pi-clear-cmd.json` (global)
 *   2. `<cwd>/.pi/pi-clear-cmd.json` (project)
 * Both lists merge (union). Managed with plain file edits + `/reload`.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  CONFIG_DIR_NAME,
  getAgentDir,
  type AutocompleteProviderFactory,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import {
  filterSuggestions,
  isSlashCommandInput,
  parseHiddenConfig,
} from "./filter.ts";

const CONFIG_FILE = "pi-clear-cmd.json";

function getConfigPaths(cwd: string): string[] {
  return [
    path.join(getAgentDir(), "extensions", CONFIG_FILE),
    path.join(cwd, CONFIG_DIR_NAME, CONFIG_FILE),
  ];
}

/** Load + merge hidden names from every config path. Never throws. */
function loadHiddenNames(cwd: string): Set<string> {
  const hidden = new Set<string>();
  for (const file of getConfigPaths(cwd)) {
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue; // missing/unreadable → treated as empty
    }
    if (!text.trim()) continue;
    try {
      for (const name of parseHiddenConfig(text)) hidden.add(name);
    } catch (err) {
      console.error(`[pi-clear-cmd] Failed to parse ${file}:`, err);
    }
  }
  return hidden;
}

export default function (pi: ExtensionAPI) {
  // Mutable binding refreshed on every session_start; the registered
  // provider reads it via getter so `/reload` picks up config changes.
  let hidden = new Set<string>();
  const getHidden = () => hidden;

  // Guard against stacking wrappers when the extension module is evaluated
  // more than once in the same process (each load re-subscribes the hook).
  let providerRegistered = false;

  pi.on("session_start", (_event, ctx) => {
    hidden = loadHiddenNames(ctx.cwd);
    if (providerRegistered) return;
    providerRegistered = true;

    const factory: AutocompleteProviderFactory = (current) => ({
      // Optional members are only forwarded when defined (the provider
      // interface marks them optional). Methods are bound so `this` still
      // points at the wrapped provider (class methods live on its
      // prototype); plain data can be shared by reference.
      ...(current.triggerCharacters === undefined
        ? {}
        : { triggerCharacters: current.triggerCharacters }),
      ...(current.shouldTriggerFileCompletion === undefined
        ? {}
        : {
            shouldTriggerFileCompletion:
              current.shouldTriggerFileCompletion.bind(current),
          }),
      applyCompletion: current.applyCompletion.bind(current),
      getSuggestions: async (lines, cursorLine, cursorCol, options) => {
        const result = await current.getSuggestions(
          lines,
          cursorLine,
          cursorCol,
          options,
        );
        if (!result) return result;
        const names = getHidden();
        if (names.size === 0) return result;
        if (!isSlashCommandInput(lines, cursorLine, cursorCol)) return result;
        return filterSuggestions(result, names);
      },
    });
    ctx.ui.addAutocompleteProvider(factory);
  });
}
