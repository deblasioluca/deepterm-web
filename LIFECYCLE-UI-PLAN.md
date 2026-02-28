# Lifecycle UI Polish — Implementation Plan
# Date: 2026-02-28
# Status: IN PROGRESS

## Pre-crash changes (already in git diff, uncommitted):
- [x] A. retry-step backend emits 'started' event after 'retried' (route.ts)
- [x] B. 'started' event handler widened: resets on any status, clears substeps (DevLifecycleFlow.tsx)
- [x] C. Review gate expanded: Approve, Request Changes→Implement, Back to Deliberation, Abandon
- [x] D. Test failure recovery buttons: Auto-fix (AI), Back to Deliberation
- [x] E. loop-test-to-deliberation backend handler added (route.ts)

## Remaining tasks:

### Task 1: Fix FeedbackDialog wiring for review actions
**Problem:** Review buttons call `loop-review-to-implement` directly, bypassing
the FeedbackDialog that requires reason text. Also `handleFeedbackSubmit` maps
to wrong action names (`loop-back-implement` instead of `loop-review-to-implement`).

**Fix:**
- [ ] 1a. Change review gate action names to `open-feedback-implement`, `open-feedback-deliberation`, `open-feedback-abandon`
- [ ] 1b. Fix handleFeedbackSubmit action map: implement→`loop-review-to-implement`, deliberation→`loop-review-to-deliberation`, abandon→`abandon-implementation`
- [ ] 1c. Pass feedback text as reason in the API call

### Task 2: Add static "potential loop" arrows to diagram
**Problem:** SVG loop arrows only render after loop events occur. User wants to
always see where back-cycles are possible.

**Fix:**
- [ ] 2a. Add `getStaticLoopArrows()` function returning potential loops:
       Test→Implement, Test→Deliberation, Review→Implement, Review→Deliberation
- [ ] 2b. Render these as faded/ghost dashed arrows (opacity ~0.2) alongside event-based arrows
- [ ] 2c. Event-based arrows render solid on top when loops actually occur

### Task 3: Show current test name in TestProgressPanel
**Problem:** Shows "5/12" but not which test is currently running.

**Fix:**
- [ ] 3a. Add `currentTest?: string` to TestSuiteData interface
- [ ] 3b. Parse `currentTest` from progress event detail JSON
- [ ] 3c. Display current test name next to count in SuiteCard (when status=active)

### Task 4: Build, verify, commit
- [ ] 4a. npm run build (fix any TypeScript errors)
- [ ] 4b. pm2 restart deepterm
- [ ] 4c. Visual check in browser
- [ ] 4d. git add -A && git commit && git push
