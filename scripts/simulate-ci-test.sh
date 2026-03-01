#!/bin/bash
# Simulate a CI test run by posting lifecycle events to the Pi
# Usage: ./scripts/simulate-ci-test.sh [storyId] [pass|fail]
#
# This mimics what pr-check.yml would do in a real CI pipeline.
# Each suite: started → progress updates → completed/failed

STORY_ID="${1:-cmm4w6qmi0001vzo9p26qtk4b}"
OUTCOME="${2:-pass}"  # pass or fail
PI_URL="http://localhost:3000"
API_KEY="adf1ee268f983689396843c8c9963747f10acb9fb8ea390f016f1c58406c5593"

post_event() {
  local event="$1"
  local detail="$2"
  curl -s -X POST "$PI_URL/api/admin/cockpit/lifecycle/events" \
    -H "Content-Type: application/json" \
    -H "x-api-key: $API_KEY" \
    -d "{
      \"storyId\": \"$STORY_ID\",
      \"stepId\": \"test\",
      \"event\": \"$event\",
      \"detail\": $detail,
      \"actor\": \"ci\"
    }" > /dev/null
  echo "  ✓ $event: $(echo $detail | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get(\"message\",d.get(\"suite\",\"\")))' 2>/dev/null || echo "$detail")"
}

echo "🔧 Simulating CI test run for story: $STORY_ID (outcome: $OUTCOME)"
echo ""

# ── Build Verification ──
echo "📦 Build Verification"
post_event "progress" '{"suite":"build","status":"active","message":"Building project (xcodebuild)...","passed":0,"failed":0,"total":3,"currentTest":"Compiling sources"}'
sleep 3

post_event "progress" '{"suite":"build","status":"active","passed":1,"failed":0,"total":3,"currentTest":"Linking dependencies"}'
sleep 2

post_event "progress" '{"suite":"build","status":"active","passed":2,"failed":0,"total":3,"currentTest":"Code signing"}'
sleep 2

post_event "progress" '{"suite":"build","status":"completed","passed":3,"failed":0,"total":3,"duration":7,"message":"Build succeeded"}'
echo ""

# ── Unit Tests ──
echo "🧪 Unit Tests (XCTest)"
UNIT_TESTS=("TestSSHConnection" "TestKeyExchange" "TestChannelOpen" "TestSFTPUpload" "TestSFTPDownload" "TestPortForward" "TestAgentForward" "TestHostKeyVerify" "TestPasswordAuth" "TestPubkeyAuth" "TestSessionReuse" "TestGracefulDisconnect")
UNIT_TOTAL=${#UNIT_TESTS[@]}
UNIT_FAIL_IDX=7  # TestHostKeyVerify fails if outcome=fail

for i in "${!UNIT_TESTS[@]}"; do
  test_name="${UNIT_TESTS[$i]}"
  passed=$((i))
  failed=0

  if [[ "$OUTCOME" == "fail" && $i -eq $UNIT_FAIL_IDX ]]; then
    failed=1
    post_event "progress" "{\"suite\":\"unit\",\"passed\":$passed,\"failed\":$failed,\"total\":$UNIT_TOTAL,\"currentTest\":\"$test_name\",\"message\":\"$test_name failed\"}"
    sleep 1
    continue
  fi

  post_event "progress" "{\"suite\":\"unit\",\"passed\":$passed,\"failed\":$failed,\"total\":$UNIT_TOTAL,\"currentTest\":\"$test_name\"}"
  sleep 1
done

if [[ "$OUTCOME" == "fail" ]]; then
  post_event "failed" "{\"suite\":\"unit\",\"passed\":11,\"failed\":1,\"total\":$UNIT_TOTAL,\"duration\":14,\"message\":\"1 unit test failed\",\"failures\":[{\"test\":\"TestHostKeyVerify\",\"class\":\"SSHSecurityTests\",\"message\":\"XCTAssertEqual failed: expected ed25519 but got rsa-sha2-256\",\"file\":\"SSHSecurityTests.swift\",\"line\":87}]}"
else
  post_event "progress" "{\"suite\":\"unit\",\"status\":\"completed\",\"passed\":$UNIT_TOTAL,\"failed\":0,\"total\":$UNIT_TOTAL,\"duration\":14,\"message\":\"All unit tests passed\"}"
fi
echo ""

# ── UI Tests ──
echo "🖥️  UI Tests (XCUITest)"
UI_TESTS=("TestMainWindowAppears" "TestNewConnectionDialog" "TestSSHTerminalInput" "TestTabSwitching" "TestSettingsPanel" "TestDarkModeToggle" "TestKeyboardShortcuts" "TestCopyPaste")
UI_TOTAL=${#UI_TESTS[@]}

for i in "${!UI_TESTS[@]}"; do
  test_name="${UI_TESTS[$i]}"
  passed=$((i))
  post_event "progress" "{\"suite\":\"ui\",\"passed\":$passed,\"failed\":0,\"total\":$UI_TOTAL,\"currentTest\":\"$test_name\"}"
  sleep 2
done

post_event "progress" "{\"suite\":\"ui\",\"status\":\"completed\",\"passed\":$UI_TOTAL,\"failed\":0,\"total\":$UI_TOTAL,\"duration\":18,\"message\":\"All UI tests passed\"}"
echo ""

# ── Overall result ──
if [[ "$OUTCOME" == "fail" ]]; then
  post_event "failed" '{"message":"1 suite failed: unit (1 failure)","totalSuites":3,"passedSuites":2,"failedSuites":1}'
  echo "❌ Test run complete — FAILED"
else
  post_event "completed" '{"message":"All 3 suites passed","totalSuites":3,"passedSuites":3,"failedSuites":0}'
  echo "✅ Test run complete — PASSED"
fi
