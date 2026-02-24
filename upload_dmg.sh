#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./upload_dmg.sh \
    [--base-url https://deepterm.net] \
    [--email admin@deepterm.net] \
    [--password admin123] \
    [--macos-file /path/to/DeepTerm.dmg] \
    [--windows-file /path/to/DeepTerm.exe] \
    [--linux-file /path/to/DeepTerm.AppImage] \
    [--ios-file /path/to/DeepTerm.ipa] \
    [--release-notes-file /path/to/release_notes.txt] \
    [--notes /path/to/RELEASE_NOTES.md] \
    [--mandatory true|false] \
    [--minimum-os-version 14.0] \
    [--no-tunnel] \
    [--tunnel-target macan@deepterm.net --tunnel-local-port 3000] \
    [--version 1.2.3]

Notes:
- Upload endpoint: POST /api/admin/downloads/upload
- Auth endpoint:   POST /api/admin/auth/login
- macOS file must be a .dmg
- Other platforms can be any file type; server keeps a per-platform latest copy under /public/downloads/<platform>/
- Tunnel is enabled by default (recommended for intranet-only admin login).
- Use --no-tunnel only if your machine can reach admin login directly.
- Default local macOS DMG path: ~/Development/DeployDeepTerm/DeepTerm.dmg
- Default release notes path: <file dir>/release_notes.txt (per platform)
- If you omit --version, the server will infer it from the release notes heading:
  ## Version 1.0.1 — February 16, 2026
EOF
}

BASE_URL="https://deepterm.net"
EMAIL="admin@deepterm.net"
PASSWORD="admin123"
DMG_FILE="$HOME/Development/DeployDeepTerm/DeepTerm.dmg"
RELEASE_NOTES_FILE=""
RELEASE_NOTES_FILE_IS_DEFAULT="true"
VERSION=""
MANDATORY="false"
MINIMUM_OS_VERSION="14.0"

MACOS_FILE=""
WINDOWS_FILE=""
LINUX_FILE=""
IOS_FILE=""

MACOS_NOTES=""
WINDOWS_NOTES=""
LINUX_NOTES=""
IOS_NOTES=""
USE_TUNNEL="true"
TUNNEL_TARGET="macan@10.10.10.10"
TUNNEL_LOCAL_PORT="3000"
TUNNEL_PID=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --email)
      EMAIL="$2"
      shift 2
      ;;
    --password)
      PASSWORD="$2"
      shift 2
      ;;
    --file)
      # Backward-compat alias
      MACOS_FILE="$2"
      shift 2
      ;;
    --macos-file)
      MACOS_FILE="$2"
      shift 2
      ;;
    --windows-file)
      WINDOWS_FILE="$2"
      shift 2
      ;;
    --linux-file)
      LINUX_FILE="$2"
      shift 2
      ;;
    --ios-file)
      IOS_FILE="$2"
      shift 2
      ;;
    --release-notes-file)
      RELEASE_NOTES_FILE="$2"
      RELEASE_NOTES_FILE_IS_DEFAULT="false"
      shift 2
      ;;
    --notes)
      # Alias (matches older docs)
      RELEASE_NOTES_FILE="$2"
      RELEASE_NOTES_FILE_IS_DEFAULT="false"
      shift 2
      ;;
    --version)
      VERSION="$2"
      shift 2
      ;;
    --mandatory)
      MANDATORY="$2"
      shift 2
      ;;
    --minimum-os-version)
      MINIMUM_OS_VERSION="$2"
      shift 2
      ;;
    --use-tunnel)
      USE_TUNNEL="true"
      shift
      ;;
    --no-tunnel)
      USE_TUNNEL="false"
      shift
      ;;
    --tunnel-target)
      TUNNEL_TARGET="$2"
      shift 2
      ;;
    --tunnel-local-port)
      TUNNEL_LOCAL_PORT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$MACOS_FILE" && -z "$WINDOWS_FILE" && -z "$LINUX_FILE" && -z "$IOS_FILE" ]]; then
  # Default to previous DMG path
  MACOS_FILE="$DMG_FILE"
fi

uploads_present="false"
for f in "$MACOS_FILE" "$WINDOWS_FILE" "$LINUX_FILE" "$IOS_FILE"; do
  if [[ -n "$f" ]]; then
    uploads_present="true"
    break
  fi
done

if [[ "$uploads_present" != "true" ]]; then
  echo "No files provided." >&2
  usage
  exit 1
fi

if [[ -n "$MACOS_FILE" ]]; then
  if [[ ! -f "$MACOS_FILE" ]]; then
    echo "macOS file not found: $MACOS_FILE" >&2
    exit 1
  fi
  case "$MACOS_FILE" in
    *.dmg|*.DMG) ;;
    *)
      echo "macOS file must be a .dmg: $MACOS_FILE" >&2
      exit 1
      ;;
  esac
fi

for f in "$WINDOWS_FILE" "$LINUX_FILE" "$IOS_FILE"; do
  if [[ -n "$f" && ! -f "$f" ]]; then
    echo "File not found: $f" >&2
    exit 1
  fi
done

# Default release notes per platform to the same directory as that platform's file
default_notes_for() {
  local file="$1"
  if [[ -z "$file" ]]; then
    echo ""
    return
  fi
  echo "$(dirname "$file")/release_notes.txt"
}

if [[ "${RELEASE_NOTES_FILE_IS_DEFAULT}" == "true" ]]; then
  MACOS_NOTES="$(default_notes_for "$MACOS_FILE")"
  WINDOWS_NOTES="$(default_notes_for "$WINDOWS_FILE")"
  LINUX_NOTES="$(default_notes_for "$LINUX_FILE")"
  IOS_NOTES="$(default_notes_for "$IOS_FILE")"
else
  # If the user provided a single notes file, use it for all uploads
  MACOS_NOTES="$RELEASE_NOTES_FILE"
  WINDOWS_NOTES="$RELEASE_NOTES_FILE"
  LINUX_NOTES="$RELEASE_NOTES_FILE"
  IOS_NOTES="$RELEASE_NOTES_FILE"
fi

BASE_URL="${BASE_URL%/}"
COOKIE_JAR="$(mktemp)"
LOGIN_BODY="$(mktemp)"
UPLOAD_BODY="$(mktemp)"
INFO_BODY="$(mktemp)"

CURL_BIN="$(command -v curl || true)"
if [[ -z "$CURL_BIN" ]]; then
  echo "curl command not found. Please install curl and retry." >&2
  exit 1
fi

if [[ "$USE_TUNNEL" == "true" ]]; then
  if [[ -z "$TUNNEL_TARGET" ]]; then
    echo "When using --use-tunnel, you must provide --tunnel-target (e.g. macan@deepterm.net)." >&2
    exit 1
  fi

  if ! command -v ssh >/dev/null 2>&1; then
    echo "ssh command not found. Install OpenSSH client and retry." >&2
    exit 1
  fi

  if ! [[ "$TUNNEL_LOCAL_PORT" =~ ^[0-9]+$ ]]; then
    echo "Invalid --tunnel-local-port: $TUNNEL_LOCAL_PORT" >&2
    exit 1
  fi

  echo "Opening SSH tunnel: $TUNNEL_TARGET (local $TUNNEL_LOCAL_PORT -> server 127.0.0.1:3000)"
  ssh -o ExitOnForwardFailure=yes -N -L "${TUNNEL_LOCAL_PORT}:127.0.0.1:3000" "$TUNNEL_TARGET" >/dev/null 2>&1 &
  TUNNEL_PID="$!"

  sleep 1
  if ! kill -0 "$TUNNEL_PID" >/dev/null 2>&1; then
    echo "Failed to open SSH tunnel." >&2
    exit 1
  fi

  BASE_URL="http://127.0.0.1:${TUNNEL_LOCAL_PORT}"
fi

cleanup() {
  if [[ -n "${TUNNEL_PID:-}" ]] && kill -0 "$TUNNEL_PID" >/dev/null 2>&1; then
    kill "$TUNNEL_PID" >/dev/null 2>&1 || true
    wait "$TUNNEL_PID" 2>/dev/null || true
  fi
  rm -f "$COOKIE_JAR" "$LOGIN_BODY" "$UPLOAD_BODY" "$INFO_BODY"
}
trap cleanup EXIT

echo "Logging in as admin..."
LOGIN_HTTP_CODE="$(
  "$CURL_BIN" -sS -o "$LOGIN_BODY" -w '%{http_code}' \
    -X POST "$BASE_URL/api/admin/auth/login" \
    -H 'Content-Type: application/json' \
    -c "$COOKIE_JAR" \
    --data "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
)"

if [[ "$LOGIN_HTTP_CODE" != "200" ]]; then
  echo "Admin login failed (HTTP $LOGIN_HTTP_CODE)." >&2
  cat "$LOGIN_BODY" >&2
  if [[ "$LOGIN_HTTP_CODE" == "403" && "$USE_TUNNEL" != "true" ]]; then
    echo >&2
    echo "Hint: admin login is intranet-only. Retry with SSH tunnel:" >&2
    echo "  ./upload_dmg.sh --use-tunnel --tunnel-target $TUNNEL_TARGET --macos-file \"$DMG_FILE\" ${VERSION:+--version \"$VERSION\"}" >&2
  fi
  exit 1
fi

upload_one() {
  local platform="$1"
  local file="$2"
  local notes="$3"

  if [[ -z "$file" ]]; then
    return 0
  fi

  echo "Uploading $platform: $file"

  local form_args=(
    -F "platform=$platform"
    -F "file=@$file"
  )

  if [[ -n "$VERSION" ]]; then
    form_args+=( -F "version=$VERSION" )
  fi

  if [[ -n "${MANDATORY:-}" ]]; then
    form_args+=( -F "mandatory=$MANDATORY" )
  fi

  if [[ -n "${MINIMUM_OS_VERSION:-}" ]]; then
    form_args+=( -F "minimumOSVersion=$MINIMUM_OS_VERSION" )
  fi

  if [[ -n "$notes" && -f "$notes" ]]; then
    # Send notes as a text field (matches server spec)
    form_args+=( -F "releaseNotes=<$notes" )
  else
    if [[ -z "$VERSION" ]]; then
      echo "Release notes file not found for $platform: $notes" >&2
      echo "Hint: create release_notes.txt next to the file, or pass --version manually." >&2
      exit 1
    fi
  fi

  local http_code
  http_code="$(
    "$CURL_BIN" -sS -o "$UPLOAD_BODY" -w '%{http_code}' \
      -X POST "$BASE_URL/api/admin/downloads/upload" \
      -b "$COOKIE_JAR" \
      "${form_args[@]}"
  )"

  if [[ "$http_code" != "200" ]]; then
    echo "Upload failed for $platform (HTTP $http_code)." >&2
    cat "$UPLOAD_BODY" >&2
    exit 1
  fi

  echo "Upload OK for $platform."
  cat "$UPLOAD_BODY"
  echo
}

upload_one "macos" "$MACOS_FILE" "$MACOS_NOTES"
upload_one "windows" "$WINDOWS_FILE" "$WINDOWS_NOTES"
upload_one "linux" "$LINUX_FILE" "$LINUX_NOTES"
upload_one "ios" "$IOS_FILE" "$IOS_NOTES"

echo "Verifying published download info..."
INFO_HTTP_CODE="$(
  "$CURL_BIN" -sS -o "$INFO_BODY" -w '%{http_code}' \
    -X GET "$BASE_URL/api/downloads/info"
)"

if [[ "$INFO_HTTP_CODE" == "200" ]]; then
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$INFO_BODY" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)

def show(label: str, *keys: str):
    info = None
    for key in keys:
        if key in data:
            info = data.get(key)
            break

    if info is None:
        info = {}

    if not isinstance(info, dict):
        print(f"Published {label} info: (unexpected shape)")
        print(info)
        return

    print(f"Published {label} info:")
    print(f"  version: {info.get('version', '-')}")
    print(f"  size: {info.get('size', '-')}")
    print(f"  lastModified: {info.get('lastModified', '-')}")
    print(f"  exists: {info.get('exists', False)}")

show('macOS', 'macOS', 'macos')
show('Windows', 'windows', 'Windows')
show('Linux', 'linux', 'Linux')
show('iOS', 'ios', 'iOS')
PY
  else
    echo "downloads/info response:"
    cat "$INFO_BODY"
  fi
else
  echo "Warning: could not verify /api/downloads/info (HTTP $INFO_HTTP_CODE)." >&2
  cat "$INFO_BODY" >&2 || true
fi
