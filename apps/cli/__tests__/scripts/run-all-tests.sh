#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo "🧪 Vibe Stash Test Suite"
echo "========================="
echo ""

TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

START_TIME=$(date +%s)

run_test_suite() {
  local suite_name=$1
  local test_pattern=$2
  
  echo -e "${BLUE}▶ Running ${suite_name}...${NC}"
  echo ""
  
  if npm test -- "${test_pattern}" 2>&1 | tee /tmp/test-output-$$.log; then
    echo -e "${GREEN}✓ ${suite_name} passed${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
  else
    echo -e "${RED}✗ ${suite_name} failed${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
  
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  echo ""
}

cd "$CLI_DIR"

echo "📂 Running tests from: $CLI_DIR"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  BASIC TESTS (6 suites)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

run_test_suite "Clean Install" "__tests__/cases/basic/clean-install.test.ts"
run_test_suite "Update with Conflicts" "__tests__/cases/basic/update-with-conflicts.test.ts"
run_test_suite "Apply Stash" "__tests__/cases/basic/apply-stash.test.ts"
run_test_suite "List Stashes" "__tests__/cases/basic/list-stashes.test.ts"
run_test_suite "Clear Specific" "__tests__/cases/basic/clear-specific.test.ts"
run_test_suite "Clear All" "__tests__/cases/basic/clear-all.test.ts"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  EDGE CASES (4 suites)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

run_test_suite "Apply Nonexistent" "__tests__/cases/edge-cases/apply-nonexistent.test.ts"
run_test_suite "Multiple Stashes" "__tests__/cases/edge-cases/multiple-stashes.test.ts"
run_test_suite "Corrupted Stash" "__tests__/cases/edge-cases/corrupted-stash.test.ts"
run_test_suite "Permissions" "__tests__/cases/edge-cases/permissions.test.ts"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  INTEGRATION TESTS (4 suites)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

run_test_suite "Full Workflow" "__tests__/cases/integration/full-workflow.test.ts"
run_test_suite "Multiple Updates" "__tests__/cases/integration/multiple-updates.test.ts"
run_test_suite "Rollback Multiple" "__tests__/cases/integration/rollback-multiple.test.ts"
run_test_suite "Mixed File Types" "__tests__/cases/integration/mixed-file-types.test.ts"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  TEST SUMMARY${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Total Suites:  $TOTAL_TESTS"
echo -e "Passed:        ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed:        ${RED}$FAILED_TESTS${NC}"
echo -e "Skipped:       ${YELLOW}$SKIPPED_TESTS${NC}"
echo ""

if [ $TOTAL_TESTS -gt 0 ]; then
  PASS_RATE=$(echo "scale=2; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)
  echo "Pass Rate:     ${PASS_RATE}%"
fi

echo "Duration:      ${DURATION}s"
echo ""

rm -f /tmp/test-output-$$.log

if [ $FAILED_TESTS -gt 0 ]; then
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${RED}  ✗ TESTS FAILED${NC}"
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  exit 1
else
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}  ✓ ALL TESTS PASSED!${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  exit 0
fi

