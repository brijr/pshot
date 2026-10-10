#!/usr/bin/env bash
# pshot installer: clone (or update) pshot, install its toolchain, link the `pshot` command,
# and install the Claude Code skill. Safe to re-run; it updates in place.
#
# Install:
#   curl -fsSL https://pshot.dev/install | bash
# Or straight from GitHub:
#   curl -fsSL https://raw.githubusercontent.com/brijr/pshot/main/install.sh | bash
# Or via your gh login:
#   gh api repos/brijr/pshot/contents/install.sh -H "Accept: application/vnd.github.raw" | bash
#
# Options (env vars):
#   PSHOT_DIR=~/Projects/pshot   where to install
#   PSHOT_SKIP_BEZELS=1          skip downloading Apple's device bezels (CSS frames are used instead)
#   PSHOT_SKIP_LINK=1            don't link the global `pshot` command or the skill
set -euo pipefail

REPO="brijr/pshot"
DIR="${PSHOT_DIR:-$HOME/Projects/pshot}"

say() { printf '\033[1m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || warn "pshot is built for macOS; web capture works elsewhere, but Mac/iOS capture won't."
command -v git >/dev/null || die "git is required (xcode-select --install)"

# Bun
if ! command -v bun >/dev/null; then
  say "Installing Bun"
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi

# ffmpeg (motion videos)
if ! command -v ffmpeg >/dev/null; then
  if command -v brew >/dev/null; then
    say "Installing ffmpeg"
    brew install ffmpeg
  else
    warn "ffmpeg not found (needed for videos): install it, e.g. brew install ffmpeg"
  fi
fi

# Clone or update
if [ -d "$DIR/.git" ]; then
  say "Updating $DIR"
  git -C "$DIR" pull --ff-only
else
  say "Cloning $REPO into $DIR"
  mkdir -p "$(dirname "$DIR")"
  if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
    gh repo clone "$REPO" "$DIR"
  else
    git clone "https://github.com/$REPO.git" "$DIR"
  fi
fi
cd "$DIR"

say "Installing dependencies"
bun install --frozen-lockfile 2>/dev/null || bun install

say "Installing Chromium for capture"
bunx playwright install chromium

if [ -z "${PSHOT_SKIP_BEZELS:-}" ]; then
  if [ -f assets/bezels/bezels.json ]; then
    say "Apple bezels already installed"
  else
    say "Downloading Apple product bezels (accepts Apple's bezel license; ~230 MB)"
    bun scripts/setup-bezels.ts || warn "Bezel setup failed; CSS frames will be used. Retry: bun scripts/setup-bezels.ts"
  fi
fi

if [ -z "${PSHOT_SKIP_LINK:-}" ]; then
  say "Linking the pshot command"
  chmod +x src/cli.ts
  bun link >/dev/null

  say "Installing the Claude Code skill"
  mkdir -p "$HOME/.claude/skills"
  ln -sfn "$DIR/skills/pshot" "$HOME/.claude/skills/pshot"
fi

[ -f .env ] || cp .env.example .env

echo
say "pshot is installed in $DIR"
if command -v pshot >/dev/null; then
  echo "  pshot --help          see commands"
else
  echo "  Add ~/.bun/bin to your PATH, then: pshot --help"
fi
echo "  pshot init <url>      start a recipe in any project"
echo "  Optional: add FIGMA_TOKEN to $DIR/.env for Figma exports."
echo "  Mac app capture needs Screen Recording for your terminal (System Settings → Privacy & Security)."
