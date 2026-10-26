#!/bin/bash
# One-time setup: write deploy key for fainshteinbar/bar-studio-media + the MEDIA_DEPLOY_KEY secret on bar-studio.
# The private key is generated in a temp dir, sent straight to the secret, and deleted. It is never printed.
set -euo pipefail
d=$(mktemp -d); trap 'rm -rf "$d"' EXIT
ssh-keygen -t ed25519 -N "" -C "bar-studio sync -> bar-studio-media" -f "$d/k" -q
gh repo deploy-key add "$d/k.pub" --repo fainshteinbar/bar-studio-media --title "bar-studio sync (write)" --allow-write
gh secret set MEDIA_DEPLOY_KEY --repo fainshteinbar/bar-studio < "$d/k"
gh variable set MEDIA_REPO --repo fainshteinbar/bar-studio --body "fainshteinbar/bar-studio-media"
gh variable set MEDIA_BASE_URL --repo fainshteinbar/bar-studio --body "https://fainshteinbar.github.io/bar-studio-media"
echo "Done: deploy key, MEDIA_DEPLOY_KEY secret and MEDIA_* variables are set."
