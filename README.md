# pi-clear-cmd

Hide selected plugin slash commands from `/` autocomplete suggestions in
[pi](https://github.com/earendil-works/pi/tree/main/packages/coding-agent).

Hiding only — a hidden command still runs when typed in full. Built-in pi
commands (`settings`, `model`, `reload`, …) are never filtered, even if you
list them.

## Install

```sh
pi install npm:pi-clear-cmd
```

or clone into your extensions directory.

## Config

Create `pi-clear-cmd.json` with a `hidden` array of command names (with or
without the leading `/`):

```json
{ "hidden": ["hc", "/other-cmd"] }
```

Two locations are read and merged (union), mirroring `pi-cwd-guard`:

| Scope   | Path                                            |
| ------- | ----------------------------------------------- |
| Global  | `<agentDir>/extensions/pi-clear-cmd.json`       |
| Project | `<cwd>/.pi/pi-clear-cmd.json`                |

Matching is exact and case-sensitive. Hiding `hc` also hides
conflict-renamed duplicates (`hc:1`, `hc:2`, …) that pi creates when two
plugins register the same command name.

Apply changes with `/reload` — no restart needed. A missing file means
"hide nothing"; a broken file logs an error to the console and hides
nothing (it never breaks your session).

## How it works

On `session_start` the extension loads the hidden list, then wraps the
current autocomplete provider via `ctx.ui.addAutocompleteProvider()`.
While the cursor is inside the first `/` token, suggestions matching the
hidden list are removed from the result (empty result → "no suggestions").
Everything else — file completions, `applyCompletion`,
`shouldTriggerFileCompletion`, execution of hidden commands — is untouched.

## Development

```sh
npm install
npm test        # node --test
npm run typecheck
```
