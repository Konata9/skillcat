#!/usr/bin/env bash
#
# Release gating for CI.
#
# Decides whether this push should publish a release: the project version
# (root package.json) must have changed since the base of the push, and no tag
# for that version may exist yet. BASE_REF should be the commit before the push
# (github.event.before); it falls back to HEAD^ when unset (workflow_dispatch).
# Set FORCE=true to release the current version regardless of the diff.
#
# Writes `changed`, `version` and `previous` to GITHUB_OUTPUT.
set -euo pipefail

PKG="package.json"
GITHUB_OUTPUT="${GITHUB_OUTPUT:-/dev/stdout}"
ZERO_SHA="0000000000000000000000000000000000000000"

read_version() {
  node -e "const fs=require('fs');try{process.stdout.write(String(JSON.parse(fs.readFileSync(process.argv[1],'utf8')).version||''))}catch(e){}" "$1"
}

read_stdin_version() {
  node -e "let s='';process.stdin.on('data',(d)=>{s+=d}).on('end',()=>{try{process.stdout.write(String(JSON.parse(s).version||''))}catch(e){}})"
}

if [ ! -f "$PKG" ]; then
  echo "Missing $PKG" >&2
  exit 1
fi

current="$(read_version "$PKG")"
if [ -z "$current" ]; then
  echo "Could not read 'version' from $PKG" >&2
  exit 1
fi

# Prefer the push base so a version bump anywhere in a multi-commit push counts.
base="${BASE_REF:-}"
previous=""
if [ -n "$base" ] && [ "$base" != "$ZERO_SHA" ] && git cat-file -e "$base:$PKG" 2>/dev/null; then
  previous="$(git show "$base:$PKG" | read_stdin_version)"
elif git rev-parse --verify -q HEAD^ >/dev/null 2>&1; then
  previous="$(git show "HEAD^:$PKG" 2>/dev/null | read_stdin_version)"
fi

tag="v$current"
# Treat a version as already released when its tag exists — unless we can
# confirm through `gh` that no GitHub release was ever created for it.
released="false"
repo_flag=""
if [ -n "${GITHUB_REPOSITORY:-}" ]; then
  repo_flag="--repo=$GITHUB_REPOSITORY"
fi
if git rev-parse -q --verify "refs/tags/$tag" >/dev/null 2>&1; then
  released="true"
  if command -v gh >/dev/null 2>&1 && [ -n "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]; then
    if ! gh release view "$tag" $repo_flag >/dev/null 2>&1; then
      released="false"
    fi
  fi
fi

changed="false"
if [ "${FORCE:-false}" = "true" ] || [ "$previous" != "$current" ]; then
  changed="true"
fi

if [ "$released" = "true" ]; then
  echo "Release $tag already exists; skipping release."
  changed="false"
fi

echo "version=$current" >> "$GITHUB_OUTPUT"
echo "previous=$previous" >> "$GITHUB_OUTPUT"
echo "changed=$changed" >> "$GITHUB_OUTPUT"

echo "Version check: current=$current previous=${previous:-<none>} released=$released changed=$changed"
