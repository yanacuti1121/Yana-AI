#!/bin/sh
# Vercel "Ignored Build Step" for the yana-ai-docs project (see vercel.json).
# Exit 0 = skip this build, exit 1 = build. Run from the repository root.
#
# A commit only needs a deployment when it changes the website (docs/) or this
# configuration. Any git failure falls through to exit 1, so the worst case is an
# unneeded build, never a missed one.

echo "vercel-ignore: shallow=$(git rev-parse --is-shallow-repository) head=$(git rev-parse --short HEAD) parent=$(git rev-parse --short HEAD^ 2>&1)"
git log --oneline -3
git diff --name-status HEAD^ HEAD | head -5

git diff --quiet HEAD^ HEAD -- docs vercel.json scripts/vercel-ignore.sh || exit 1
