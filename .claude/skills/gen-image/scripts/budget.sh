#!/usr/bin/env bash
# Report the course image-generation budget and available models/pricing,
# read live from strproxy (never hardcoded - prices can change).
set -euo pipefail

# The image key is read from IMAGE_GEN_TOKEN, or from ~/.config/gen-image.env
# (chmod 600, one line: IMAGE_GEN_TOKEN=...), so it can be a different key from
# the one Claude Code itself runs on. Falls back to ANTHROPIC_AUTH_TOKEN.
[ -f "$HOME/.config/gen-image.env" ] && . "$HOME/.config/gen-image.env"
TOKEN="${IMAGE_GEN_TOKEN:-${ANTHROPIC_AUTH_TOKEN:-}}"
if [ -z "$TOKEN" ]; then
  echo "No image key: set IMAGE_GEN_TOKEN (or put it in ~/.config/gen-image.env)" >&2
  exit 1
fi

curl -s -H "Authorization: Bearer $TOKEN" \
  https://strproxy.comp.anu.edu.au/api/images/models
