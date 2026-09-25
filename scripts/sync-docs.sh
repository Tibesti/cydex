#!/bin/bash
# Update docs that recent commits made inaccurate, using Claude Code.
#
# Runs in the background after every commit via .githooks/post-commit, and can
# be run by hand:
#   scripts/sync-docs.sh            update docs for commits since the last sync
#   scripts/sync-docs.sh --dry-run  show the proposed doc changes, apply nothing
#
# Claude works in a temporary worktree of HEAD, so uncommitted work is never
# touched. Only edits to README.md, .env.example and docs/ are copied back, as
# uncommitted changes to review and commit. State and logs: .git/docs-sync/
set -uo pipefail

# Git exports these to hooks; they would point every git command below at the
# main checkout instead of the temporary worktree.
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_PREFIX

DRY_RUN=false
[ "${1:-}" = "--dry-run" ] && DRY_RUN=true

REPO=$(git rev-parse --show-toplevel) || exit 1
GIT_COMMON=$(git -C "$REPO" rev-parse --absolute-git-dir)
STATE="$GIT_COMMON/docs-sync"
DOC_PATHS=(README.md .env.example docs)
mkdir -p "$STATE"
cd "$REPO" || exit 1

log() { echo "[$(date '+%H:%M:%S')] $*"; }
notify() {
  log "$1"
  osascript -e "display notification \"$1\" with title \"Docs sync\"" >/dev/null 2>&1 || true
}

# ---------- skip cases ----------
if [ -d "$GIT_COMMON/rebase-merge" ] || [ -d "$GIT_COMMON/rebase-apply" ] ||
   [ -f "$GIT_COMMON/MERGE_HEAD" ] || [ -f "$GIT_COMMON/CHERRY_PICK_HEAD" ]; then
  log "Rebase, merge or cherry-pick in progress; skipping."
  exit 0
fi

# One run at a time; a skipped run is picked up by the next one.
if ! mkdir "$STATE/lock" 2>/dev/null; then
  log "Another docs sync is running; skipping (the next run will include these commits)."
  exit 0
fi
WORKTREE=""
cleanup() {
  [ -n "$WORKTREE" ] && git -C "$REPO" worktree remove --force "$WORKTREE" >/dev/null 2>&1
  rmdir "$STATE/lock" 2>/dev/null
}
trap cleanup EXIT

# ---------- find Claude Code ----------
find_claude() {
  command -v claude && return
  local c
  for c in "$HOME/.local/bin/claude" "$HOME/.claude/local/claude"; do
    [ -x "$c" ] && echo "$c" && return
  done
  # Binary bundled with the VS Code / Cursor extension (newest install first)
  c=$(ls -dt "$HOME"/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude \
             "$HOME"/.cursor/extensions/anthropic.claude-code-*/resources/native-binary/claude 2>/dev/null | head -1)
  [ -n "$c" ] && [ -x "$c" ] && echo "$c"
}
CLAUDE=$(find_claude)
if [ -z "$CLAUDE" ]; then
  notify "Claude Code not found; docs not synced. Install it or open VS Code with the Claude Code extension."
  exit 1
fi

# ---------- which commits to cover ----------
HEAD_SHA=$(git rev-parse HEAD)
LAST=$(cat "$STATE/last-synced" 2>/dev/null || true)
if [ "$LAST" = "$HEAD_SHA" ]; then
  log "Docs already synced for $HEAD_SHA."
  exit 0
elif [ -n "$LAST" ] && git merge-base --is-ancestor "$LAST" HEAD 2>/dev/null; then
  BASE=$LAST
elif git rev-parse --verify --quiet HEAD~1 >/dev/null; then
  BASE=$(git rev-parse HEAD~1)
else
  log "First commit in the repo; nothing to compare against."
  exit 0
fi
RANGE="$BASE..$HEAD_SHA"

CODE_CHANGES=$(git diff --name-only "$RANGE" -- . \
  ':(exclude)docs' ':(exclude)*.md' ':(exclude).env.example' ':(exclude).github')
if [ -z "$CODE_CHANGES" ]; then
  log "Only docs changed in $RANGE; nothing to sync."
  $DRY_RUN || echo "$HEAD_SHA" > "$STATE/last-synced"
  exit 0
fi
log "Checking docs against $(git rev-list --count "$RANGE") commit(s): $RANGE"

# ---------- run Claude in a throwaway worktree ----------
WORKTREE=$(mktemp -d "${TMPDIR:-/tmp}/docs-sync.XXXXXX")
git worktree add --detach --quiet "$WORKTREE" "$HEAD_SHA" || exit 1

PROMPT="You keep this repository's documentation in sync with its code.

The commits in $RANGE were just committed. Run \`git log --oneline $RANGE\` and
\`git diff $RANGE\` to see what changed.

Update only docs that are now inaccurate because of those changes. In scope:
- README.md
- .env.example (must list every VITE_* variable the code reads)
- docs/*.md

Rules:
- Fix only what is now wrong or missing: file paths, function, table and column
  names, environment variables, behaviour and setup steps. Keep each doc's
  structure and tone. If you change a doc that has an \"as of <month year>\"
  line, update the date.
- Files named *_PLAN.md, *_GUIDE.md or *_SUMMARY.md are historical records:
  only fix references in them that are now broken. Exception:
  docs/PRICING_MODEL_IMPLEMENTATION_PLAN.md is the living pricing and order
  dispatch doc; keep it fully up to date.
- Never edit code, config or migrations. Only add a new doc (in docs/) if the
  commits add a major feature that no doc covers.
- If no doc needs changing, change nothing.

End with a short summary of what you changed and why."

(
  cd "$WORKTREE" &&
  "$CLAUDE" -p "$PROMPT" --model sonnet \
    --allowedTools "Read,Edit,Write,Glob,Grep,Bash(git diff:*),Bash(git log:*),Bash(git show:*)"
) &
CLAUDE_PID=$!
( sleep 900 && kill "$CLAUDE_PID" 2>/dev/null && log "Timed out after 15 minutes." ) 2>/dev/null &
WATCHDOG=$!
wait "$CLAUDE_PID"
CLAUDE_STATUS=$?
pkill -P "$WATCHDOG" 2>/dev/null; kill "$WATCHDOG" 2>/dev/null; wait "$WATCHDOG" 2>/dev/null

if [ "$CLAUDE_STATUS" -ne 0 ]; then
  notify "Docs sync failed (see .git/docs-sync/last-run.log). It will retry on the next commit."
  exit 1
fi

# ---------- bring back doc changes only ----------
PATCH="$STATE/last.patch"
git -C "$WORKTREE" add -A -- "${DOC_PATHS[@]}"
git -C "$WORKTREE" diff --cached -- "${DOC_PATHS[@]}" > "$PATCH"

if [ ! -s "$PATCH" ]; then
  log "Docs are up to date."
  $DRY_RUN || echo "$HEAD_SHA" > "$STATE/last-synced"
  exit 0
fi

FILES=$(git -C "$WORKTREE" diff --cached --name-only -- "${DOC_PATHS[@]}")
COUNT=$(echo "$FILES" | wc -l | tr -d ' ')

if $DRY_RUN; then
  log "Dry run: proposed changes to $COUNT file(s), saved to $PATCH"
  cat "$PATCH"
  exit 0
fi

if git apply "$PATCH"; then
  echo "$HEAD_SHA" > "$STATE/last-synced"
  log "Updated:"; echo "$FILES" | sed 's/^/  /'
  notify "Updated $COUNT doc file(s). Review with git diff, then commit."
else
  notify "Doc changes conflict with your uncommitted edits; saved to .git/docs-sync/last.patch"
  exit 1
fi
