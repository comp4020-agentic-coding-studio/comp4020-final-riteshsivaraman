#!/usr/bin/env bash
# Generate one image via the COMP4020 strproxy image API and download it
# immediately (URLs expire). Never prints the auth token.
#
# Usage: gen.sh <out-dir> <slug> <prompt> [model] [size]
set -euo pipefail

out_dir="$1"; slug="$2"; prompt="$3"
model="${4:-flux-1.1-pro}"
size="${5:-1792x1024}"

# The image key is read from IMAGE_GEN_TOKEN, or from ~/.config/gen-image.env
# (chmod 600, one line: IMAGE_GEN_TOKEN=...), so it can be a different key from
# the one Claude Code itself runs on. Falls back to ANTHROPIC_AUTH_TOKEN.
[ -f "$HOME/.config/gen-image.env" ] && . "$HOME/.config/gen-image.env"
TOKEN="${IMAGE_GEN_TOKEN:-${ANTHROPIC_AUTH_TOKEN:-}}"
if [ -z "$TOKEN" ]; then
  echo "No image key: set IMAGE_GEN_TOKEN (or put it in ~/.config/gen-image.env)" >&2
  exit 1
fi

mkdir -p "$out_dir"
tmp_json="$(mktemp)"
trap 'rm -f "$tmp_json"' EXIT

curl -s -X POST https://strproxy.comp.anu.edu.au/api/images/generations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg p "$prompt" --arg m "$model" --arg s "$size" \
        '{model:$m, prompt:$p, size:$s, n:1}')" \
  -o "$tmp_json"

url=$(jq -r '.data[0].url // empty' "$tmp_json")
if [ -z "$url" ]; then
  echo "Generation failed, response:" >&2
  cat "$tmp_json" >&2
  exit 1
fi

ext="${url##*.}"
case "$ext" in
  webp|png|jpg|jpeg) ;;
  *) ext="png" ;;
esac

dest="$out_dir/$slug.$ext"
curl -s -o "$dest" "$url"
echo "$dest"
