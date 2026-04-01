#!/usr/bin/env bash
# capture-screenshots.sh — Repeatable screenshot capture for DeepTerm documentation
#
# Usage:
#   ./scripts/capture-screenshots.sh [--ci-mac USER@HOST] [--output-dir DIR]
#
# This script captures screenshots of the DeepTerm macOS app for use in the
# user documentation. It connects to a Mac (local or CI runner) via SSH,
# launches the app, navigates to each feature view, captures a screenshot,
# and copies the results to public/screenshots/.
#
# Prerequisites:
#   - macOS machine with DeepTerm installed (or built from source)
#   - screencapture CLI available (ships with macOS)
#   - SSH access to the Mac (if running remotely)
#   - A documentation user account with sample data (see seed-doc-user.ts)
#
# Screenshot list (must match docs-data.ts references):
#   app-hosts.png          — Hosts view with vault sidebar
#   app-sftp.png           — SFTP dual-pane file browser
#   app-snippets.png       — Snippets library
#   app-port-forwarding.png — Port Forwarding rules
#   app-keychain.png       — Keychain (Keys + Identities tabs)
#   app-history.png        — Connection History
#   app-known-hosts.png    — Known Hosts fingerprints
#   app-settings.png       — Settings / Preferences

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="${REPO_ROOT}/public/screenshots"
CI_MAC=""
DEEPTERM_APP="/Applications/DeepTerm.app"
WINDOW_WIDTH=2000
WINDOW_HEIGHT=1264
DELAY_BETWEEN=2  # seconds between captures to allow UI to settle

# ── Parse arguments ──────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ci-mac)
      CI_MAC="$2"
      shift 2
      ;;
    --output-dir)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --width)
      WINDOW_WIDTH="$2"
      shift 2
      ;;
    --height)
      WINDOW_HEIGHT="$2"
      shift 2
      ;;
    --delay)
      DELAY_BETWEEN="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--ci-mac USER@HOST] [--output-dir DIR] [--width W] [--height H] [--delay S]"
      echo ""
      echo "Options:"
      echo "  --ci-mac USER@HOST   SSH target for remote Mac (default: run locally)"
      echo "  --output-dir DIR     Output directory (default: public/screenshots/)"
      echo "  --width W            Window width in pixels (default: 2000)"
      echo "  --height H           Window height in pixels (default: 1264)"
      echo "  --delay S            Delay between captures in seconds (default: 2)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

mkdir -p "$OUTPUT_DIR"

# ── Screenshot names matching docs-data.ts ───────────────────
SCREENSHOTS=(
  "app-hosts"
  "app-sftp"
  "app-snippets"
  "app-port-forwarding"
  "app-keychain"
  "app-history"
  "app-known-hosts"
  "app-settings"
)

# Vault sidebar sections corresponding to each screenshot
SIDEBAR_SECTIONS=(
  "Hosts"
  "SFTP"
  "Snippets"
  "Port Forwarding"
  "Keychain"
  "History"
  "Known Hosts"
  "Settings"
)

# ── Helper: run command locally or on CI Mac ─────────────────
run_cmd() {
  if [[ -n "$CI_MAC" ]]; then
    ssh -o StrictHostKeyChecking=no "$CI_MAC" "$@"
  else
    eval "$@"
  fi
}

# ── Helper: copy file from CI Mac ────────────────────────────
copy_from() {
  local remote_path="$1"
  local local_path="$2"
  if [[ -n "$CI_MAC" ]]; then
    scp -o StrictHostKeyChecking=no "${CI_MAC}:${remote_path}" "$local_path"
  else
    cp "$remote_path" "$local_path"
  fi
}

# ── AppleScript to navigate sidebar + capture ────────────────
generate_applescript() {
  local section="$1"
  local output_path="$2"

  cat <<APPLESCRIPT
tell application "DeepTerm"
  activate
  delay 1
end tell

tell application "System Events"
  tell process "DeepTerm"
    -- Ensure the vault sidebar is visible (click Vault tab if needed)
    set frontWindow to front window
    set windowPos to position of frontWindow
    set windowSize to size of frontWindow

    -- Resize window to target dimensions
    set position of frontWindow to {50, 50}
    set size of frontWindow to {${WINDOW_WIDTH}, ${WINDOW_HEIGHT}}
    delay 0.5

    -- Navigate to the target section in the vault sidebar
    -- The sidebar has navigation items; click the one matching our section
    try
      -- Use accessibility to find and click the sidebar item
      click menu item "${section}" of menu "View" of menu bar 1
    on error
      -- Fallback: try clicking in the sidebar area directly
      -- The sidebar items are typically in the left panel
      log "Could not find menu item '${section}', trying keyboard shortcut"
    end try

    delay ${DELAY_BETWEEN}
  end tell
end tell

-- Capture the window
do shell script "screencapture -l \$(osascript -e 'tell application \"System Events\" to return id of first window of process \"DeepTerm\"') '${output_path}'"
APPLESCRIPT
}

# ── Main capture loop ────────────────────────────────────────
echo "=== DeepTerm Screenshot Capture ==="
echo "Output: $OUTPUT_DIR"
echo "Window: ${WINDOW_WIDTH}x${WINDOW_HEIGHT}"
[[ -n "$CI_MAC" ]] && echo "Target: $CI_MAC" || echo "Target: localhost"
echo ""

# Ensure DeepTerm is running
echo "Launching DeepTerm..."
run_cmd "open -a '${DEEPTERM_APP}' 2>/dev/null || echo 'DeepTerm not found at ${DEEPTERM_APP}'"
sleep 3

REMOTE_TMP="/tmp/deepterm-screenshots"
run_cmd "mkdir -p ${REMOTE_TMP}"

for i in "${!SCREENSHOTS[@]}"; do
  name="${SCREENSHOTS[$i]}"
  section="${SIDEBAR_SECTIONS[$i]}"
  remote_path="${REMOTE_TMP}/${name}.png"
  local_path="${OUTPUT_DIR}/${name}.png"

  echo "[$((i+1))/${#SCREENSHOTS[@]}] Capturing: ${name} (section: ${section})..."

  # Generate and run AppleScript on the Mac
  script=$(generate_applescript "$section" "$remote_path")
  run_cmd "osascript -e '${script}' 2>/dev/null" || {
    # Fallback: plain screencapture of the frontmost window
    echo "  AppleScript failed, falling back to screencapture..."
    run_cmd "screencapture -o -w '${remote_path}' 2>/dev/null" || true
  }

  # Copy to output
  if copy_from "$remote_path" "$local_path" 2>/dev/null; then
    echo "  Saved: ${local_path}"
  else
    echo "  WARNING: Failed to capture ${name}"
  fi

  sleep "$DELAY_BETWEEN"
done

# Cleanup remote temp
run_cmd "rm -rf ${REMOTE_TMP}" 2>/dev/null || true

echo ""
echo "=== Done! Captured ${#SCREENSHOTS[@]} screenshots ==="
echo "Files in: $OUTPUT_DIR"
ls -la "$OUTPUT_DIR"/*.png 2>/dev/null || echo "(no screenshots found)"
