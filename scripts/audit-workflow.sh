#!/usr/bin/env bash
# Deterministic self-audit of the parallel build workflow (docs/workflow.md).
# Prints PASS/WARN/FAIL lines. Always exits 0 so it can run in a loop; the
# /audit-workflow skill adds judgment and logs the result to .agents/audit.log.
set -u
cd "$(git rev-parse --show-toplevel)"
REPO="comp4020-agentic-coding-studio/$(basename "$(git rev-parse --show-toplevel)")"
# when run from an agent worktree, use the main repo name
REPO="${AUDIT_REPO:-$REPO}"
p(){ printf '%-5s %s\n' "$1" "$2"; }

# 1. uncommitted changes (worktrees branch from committed HEAD and will miss them)
n=$(git status --porcelain | grep -v '^?? \.claude/worktrees' | wc -l | tr -d ' ')
[ "$n" = 0 ] && p PASS "main checkout is clean" || p WARN "$n uncommitted paths: agent worktrees branch from the committed HEAD and will not see them"

# 2. integration branch
if git rev-parse --verify -q integration >/dev/null; then p PASS "local integration branch exists"; else p FAIL "no local integration branch (git branch integration main)"; fi
if git ls-remote --exit-code --heads origin integration >/dev/null 2>&1; then p PASS "origin/integration exists"; else p WARN "origin/integration not pushed yet (PRs cannot target it; pushing needs Ritesh's yes)"; fi

# 3. main only advances from integration (first-parent non-merge commits since the latest tag)
if git rev-parse --verify -q origin/main >/dev/null; then
  tag=$(git describe --tags --abbrev=0 2>/dev/null || true)
  rng=${tag:+$tag..}origin/main
  direct=$(git log --first-parent --no-merges --format='%h %s' "$rng" 2>/dev/null | wc -l | tr -d ' ')
  p INFO "$direct direct (non-merge) commits on main since ${tag:-start}: expected until the first promote, a FAIL after it"
fi

# 4-6. GitHub board checks (need gh)
if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  bad=$(gh pr list -R "$REPO" --state open --json number,baseRefName -q '[.[]|select(.baseRefName!="integration")]|length' 2>/dev/null || echo "?")
  [ "$bad" = 0 ] && p PASS "all open PRs target integration" || p FAIL "$bad open PR(s) do not target integration"
  nolink=$(gh pr list -R "$REPO" --state open --json number,body -q '[.[]|select((.body|test("(Fixes|Refs|Closes) #[0-9]+"))|not)]|length' 2>/dev/null || echo "?")
  [ "$nolink" = 0 ] && p PASS "every open PR links an issue" || p FAIL "$nolink open PR(s) have no Fixes/Refs #n"
  badstat=$(gh issue list -R "$REPO" --state open --limit 200 --json number,labels -q '[.[]|select(([.labels[].name|select(startswith("status:"))]|length)!=1)|.number]|join(",")' 2>/dev/null || echo "?")
  [ -z "$badstat" ] && p PASS "every open issue has exactly one status: label" || p WARN "issues without exactly one status: label: $badstat"
  inprog=$(gh issue list -R "$REPO" --label status:in-progress --json number -q '.[].number' 2>/dev/null)
  for i in $inprog; do git branch -a --list "*agent/$i-*" | grep -q . || p WARN "issue #$i is in-progress but has no agent/$i-* branch"; done
else
  p WARN "gh not available: board checks skipped"
fi

# 7. stale agent branches with no activity for a day
for b in $(git for-each-ref --format='%(refname:short)' refs/heads/agent 2>/dev/null); do
  age=$(( ( $(date +%s) - $(git log -1 --format=%ct "$b") ) / 3600 ))
  [ "$age" -gt 24 ] && p WARN "branch $b idle for ${age}h"
done

# 8. CLAUDE.md length
w=$(wc -w < CLAUDE.md | tr -d ' ')
[ "$w" -le 2300 ] && p PASS "CLAUDE.md is $w words" || p WARN "CLAUDE.md is $w words (target about 2100): prune"

# 9. WORKLOG freshness vs last commit
wl=$(git log -1 --format=%ct -- WORKLOG.md 2>/dev/null || echo 0); hd=$(git log -1 --format=%ct)
[ $(( hd - wl )) -lt 86400 ] && p PASS "WORKLOG.md touched within a day of the latest commit" || p WARN "WORKLOG.md is more than a day behind the latest commit: /worklog"

# 10. learnings inbox
c=$(grep -c '^status: candidate' docs/learnings-inbox.md 2>/dev/null); c=${c:-0}
[ "$c" -eq 0 ] && p PASS "no unreviewed learning candidates" || p WARN "$c learning candidate(s) waiting for /learn review"

# 10b. work orders waiting for the orchestrator
if ls .agents/inbox/*.md >/dev/null 2>&1; then
  o=$(find .agents/inbox -maxdepth 1 -name '*.md' -mmin +30 | wc -l | tr -d ' ')
  [ "$o" -eq 0 ] && p PASS "inbox has work orders, none older than 30 min" || p WARN "$o work order(s) unacknowledged for over 30 min: is the orchestrator session running?"
else p PASS "inbox is empty"; fi

# 11. budget log age
if [ -f .agents/budget.log ]; then
  m=$(( ( $(date +%s) - $(stat -f %m .agents/budget.log 2>/dev/null || stat -c %Y .agents/budget.log) ) / 60 ))
  [ "$m" -lt 180 ] && p PASS "budget checked ${m} min ago" || p WARN "budget last checked ${m} min ago: /budget"
else p WARN "no budget log yet: /budget"; fi
exit 0
