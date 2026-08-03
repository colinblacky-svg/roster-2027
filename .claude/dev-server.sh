#!/bin/zsh
export PATH="/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")/.."
exec npm run dev
