#!/usr/bin/env bash
# Deterministic liveness check for one agent's worktree: how long since it
# last touched a file, whether it's committed anything, and whether its
# working tree is dirty (actively editing) or clean (reading/thinking, or
# idle). Prints facts, not a verdict -- the /agent-check skill adds judgment
# (how long is "too long" depends on model tier and task size).
#
# Usage: scripts/agent-liveness.sh <worktree-path> [base-branch]
# base-branch defaults to integration.
set -u
WT="${1:?usage: agent-liveness.sh <worktree-path> [base-branch]}"
BASE="${2:-integration}"

if [ ! -e "$WT/.git" ]; then
  echo "FAIL no .git at $WT (not a worktree, or already removed)"
  exit 1
fi

cd "$WT" || exit 1
NOW=$(date +%s)

# Last file touch, excluding node_modules/.git -- the most recent mtime
# across the whole tree is the best proxy for "is anything happening".
LAST=$(find . -newer .git -type f -not -path './node_modules/*' -not -path './.git/*' 2>/dev/null \
  | xargs -I{} stat -f '%m' {} 2>/dev/null | sort -rn | head -1)
if [ -n "${LAST:-}" ]; then
  AGE=$((NOW - LAST))
  printf 'TOUCH %ds ago\n' "$AGE"
else
  printf 'TOUCH none newer than .git (no activity since worktree creation)\n'
fi

# Commits since the base branch -- did it actually produce anything.
COMMITS=$(git log --oneline "${BASE}..HEAD" 2>/dev/null | wc -l | tr -d ' ')
printf 'COMMITS %s since %s\n' "$COMMITS" "$BASE"
if [ "$COMMITS" -gt 0 ]; then
  git log --oneline "${BASE}..HEAD" 2>/dev/null | head -5 | sed 's/^/  /'
fi

# Working-tree state: dirty means actively mid-edit; clean after commits
# means it finished a step; clean with zero commits this long in means it
# hasn't started writing anything yet (reading/thinking, or stuck).
DIRTY=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
if [ "$DIRTY" -gt 0 ]; then
  printf 'TREE dirty (%s paths changed, uncommitted)\n' "$DIRTY"
else
  printf 'TREE clean\n'
fi

# Scratch/probe files (tmp-*, *.bak, debug-*) are a sign of active
# investigation even when nothing is committed yet -- surface them so a
# clean tree + old touch isn't mistaken for "done nothing".
SCRATCH=$(find . -maxdepth 2 -newer .git \( -name 'tmp-*' -o -name '*.bak' -o -name 'debug-*' -o -name '*.scratch' \) -not -path './node_modules/*' 2>/dev/null | wc -l | tr -d ' ')
[ "$SCRATCH" -gt 0 ] && printf 'SCRATCH %s probe/debug file(s) found (exploratory work, even if uncommitted)\n' "$SCRATCH"

exit 0
