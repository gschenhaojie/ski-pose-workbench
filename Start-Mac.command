#!/bin/zsh -l
cd -- "$(dirname -- "$0")" || exit 1
if ! command -v node >/dev/null; then
  printf 'Node.js was not found. Ask Codex to install Node.js 22.12+ and start this project.\n'
  read -r '?Press Return to close. '
  exit 1
fi
node scripts/start.mjs
status_code=$?
if (( status_code != 0 )); then
  read -r '?Press Return to close. '
fi
exit "$status_code"
