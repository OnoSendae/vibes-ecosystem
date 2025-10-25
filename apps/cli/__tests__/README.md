# Stash Testing Guide

Complete guide for running and adding tests to the Stash System.

## 🎯 Quick Start

### Run All Tests

```bash
cd apps/cli
bash __tests__/scripts/run-all-tests.sh
```

### Run Specific Categories

```bash
# Basic tests only (6 suites)
npm test -- __tests__/cases/basic/

# Edge cases only (4 suites)
npm test -- __tests__/cases/edge-cases/

# Integration tests only (4 suites)
npm test -- __tests__/cases/integration/
```

### Run Single Test

```bash
npm test -- __tests__/cases/basic/clean-install.test.ts
```

### Watch Mode

```bash
npm test -- --watch
```

---

## 📂 Test Structure

```
__tests__/
├── cases/
│   ├── basic/                    # 6 basic functionality tests
│   │   ├── clean-install.test.ts
│   │   ├── update-with-conflicts.test.ts
│   │   ├── apply-stash.test.ts
│   │   ├── list-stashes.test.ts
│   │   ├── clear-specific.test.ts
│   │   └── clear-all.test.ts
│   │
│   ├── edge-cases/               # 4 edge case tests
│   │   ├── apply-nonexistent.test.ts
│   │   ├── multiple-stashes.test.ts
│   │   ├── corrupted-stash.test.ts
│   │   └── permissions.test.ts
│   │
│   └── integration/              # 4 integration tests
│       ├── full-workflow.test.ts
│       ├── multiple-updates.test.ts
│       ├── rollback-multiple.test.ts
│       └── mixed-file-types.test.ts
│
├── fixtures/                     # Test data
│   ├── commands/
│   ├── rules/
│   ├── scripts/
│   ├── templates/
│   └── packages/
│
├── helpers/                      # Test utilities
│   └── test-helpers.ts
│
├── scripts/                      # Automation
│   ├── run-all-tests.sh
│   └── generate-report.ts
│
├── TEST-CASES.md                # Test documentation
└── README.md                     # This file
```

---

## 🏗️ Test Infrastructure

### Sandbox (Isolation)

All tests run in isolated sandbox environments using the centralized infrastructure:

**Location**: `/vibe/vibes/testing/sandbox/`

**Usage in Tests**:
```typescript
import { SandboxManager } from '../../../../../../vibe/vibes/testing/helpers/sandbox-wrapper.js';

let sandbox: SandboxManager;

beforeEach(async () => {
  sandbox = new SandboxManager();
  await sandbox.create({ projectName: 'my-test' });
});

afterEach(async () => {
  await sandbox.cleanup();
});
```

**Why Sandbox is Critical**:
- ✅ Protects host system from modifications
- ✅ Each test starts from clean state
- ✅ Tests can't interfere with each other
- ✅ Safe to run destructive operations

### Helpers

**StashTestHelpers** provides assertion utilities:

```typescript
import { StashTestHelpers } from '../../helpers/test-helpers.js';

const helpers = new StashTestHelpers(sandbox.getPath());

// Assertions
await helpers.assertStashExists(0);
await helpers.assertStashCount(5);
await helpers.assertFileInStash(0, '/path/to/file');
await helpers.assertHashMatch('/path/to/file', expectedHash);
await helpers.assertStashMetadata(0, { reason: 'install' });
```

### Fixtures

Pre-created test files in `__tests__/fixtures/`:

```typescript
// Use in tests
const fixtureV1 = '__tests__/fixtures/commands/test.command.v1.md';
const fixtureV2 = '__tests__/fixtures/commands/test.command.v2.md';
```

---

## ✍️ Writing New Tests

### 1. Basic Test Template

```typescript
import { SandboxManager } from '../../../../../../vibe/vibes/testing/helpers/sandbox-wrapper.js';
import { StashTestHelpers } from '../../helpers/test-helpers.js';
import { StashManager } from '../../../src/stash/stash-manager.js';

describe('My New Test', () => {
  let sandbox: SandboxManager;
  let helpers: StashTestHelpers;
  let manager: StashManager;

  beforeEach(async () => {
    sandbox = new SandboxManager();
    await sandbox.create({ projectName: 'my-new-test' });
    helpers = new StashTestHelpers(sandbox.getPath());
    manager = new StashManager();
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  test('does something specific', async () => {
    // Arrange
    const testFile = path.join(sandbox.getPath()!, 'config', 'test.txt');
    await fs.writeFile(testFile, 'Content', 'utf-8');

    // Act
    const stashId = await manager.create(
      new Map([[testFile, testFile]]),
      { reason: 'manual' }
    );

    // Assert
    await helpers.assertStashExists(stashId);
    await helpers.assertStashCount(1);
  });
});
```

### 2. Naming Conventions

- **File**: `descriptive-name.test.ts`
- **Describe**: `Category: Specific Feature`
- **Test**: `does specific thing in specific condition`

**Examples**:
```typescript
describe('Basic Test 1: Clean Install', () => {
  test('first install creates no stash', async () => { /* ... */ });
  test('stash directory structure is initialized', async () => { /* ... */ });
});
```

### 3. Test Categories

Choose the right category:

**Basic Tests**: Core functionality that must always work
- Creating stashes
- Applying stashes
- Listing stashes
- Removing stashes

**Edge Cases**: Error handling and boundaries
- Invalid inputs
- Corruption scenarios
- Permission issues
- Extreme values (too many stashes, large files)

**Integration Tests**: End-to-end workflows
- Multiple operations in sequence
- Cross-feature interactions
- Real-world scenarios

---

## 📊 Test Reports

### Generate Reports

```bash
cd apps/cli
npm run test:report
```

**Output**:
- `test-reports/report.md` - Markdown summary
- `test-reports/report.json` - JSON data
- `test-reports/report.html` - HTML visualization

### CI/CD Reports

GitHub Actions automatically generates reports on every push:
- **Location**: `.github/workflows/stash-tests.yml`
- **Artifacts**: Test results uploaded for 30 days
- **PR Comments**: Auto-commented with pass/fail status

---

## 🐛 Debugging Tests

### Run in Verbose Mode

```bash
npm test -- --verbose
```

### Preserve Sandbox on Failure

```typescript
beforeEach(async () => {
  sandbox = new SandboxManager();
  await sandbox.create({ 
    projectName: 'my-test',
    preserveOnError: true  // Don't cleanup if test fails
  });
});
```

Then inspect:
```bash
ls -la /tmp/vibe-tests/20251025-210000/
```

### Run Single Test with Logs

```bash
npm test -- __tests__/cases/basic/clean-install.test.ts --verbose
```

### Check Stash Logs

```bash
# In test
const vibesHome = await helpers.getVibesHome();
const logs = await fs.readFile(`${vibesHome}/logs/stash.jsonl`, 'utf-8');
console.log(logs);
```

---

## ⚡ Performance Tips

### Parallel Execution

```bash
npm test -- --maxWorkers=4
```

### Run Only Changed Tests

```bash
npm test -- --onlyChanged
```

### Skip Slow Tests

```bash
npm test -- --testPathIgnorePatterns=integration
```

---

## 🔍 Common Issues

### Issue: Tests Fail Locally but Pass in CI

**Cause**: Different Node versions or OS

**Solution**:
```bash
# Check Node version matches CI
node --version  # Should be 18.x, 20.x, or 22.x

# Run in Docker (matches CI exactly)
docker run -v $(pwd):/app -w /app node:20 npm test
```

### Issue: Sandbox Permission Errors

**Cause**: `/tmp` restrictions on some systems

**Solution**:
```bash
# Use custom sandbox path
export SANDBOX_BASE_PATH="$HOME/.vibe-tests"
npm test
```

### Issue: Tests Are Slow

**Cause**: Sequential execution

**Solution**:
```bash
# Enable parallelization
npm test -- --maxWorkers=auto
```

### Issue: Stale Test State

**Cause**: Sandbox not cleaned properly

**Solution**:
```bash
# Clean all sandboxes manually
rm -rf /tmp/vibe-tests/*

# Or use cleanup script
bash /path/to/vibe/vibes/testing/sandbox/create-sandbox.sh cleanup-all
```

---

## 📚 Best Practices

### 1. Use Descriptive Test Names

```typescript
// ❌ Bad
test('test 1', async () => { /* ... */ });

// ✅ Good
test('creates stash when file conflicts detected', async () => { /* ... */ });
```

### 2. Arrange-Act-Assert Pattern

```typescript
test('example', async () => {
  // Arrange: Setup test data
  const file = path.join(sandbox.getPath()!, 'test.txt');
  await fs.writeFile(file, 'Content', 'utf-8');

  // Act: Execute the operation
  const stashId = await manager.create(
    new Map([[file, file]]),
    { reason: 'manual' }
  );

  // Assert: Verify outcomes
  expect(stashId).toBe(0);
  await helpers.assertStashExists(0);
});
```

### 3. Test One Thing Per Test

```typescript
// ❌ Bad: Testing multiple things
test('stash system works', async () => {
  // Creates, applies, lists, removes...
});

// ✅ Good: One concern per test
test('creates stash with correct metadata', async () => { /* ... */ });
test('applies stash and restores content', async () => { /* ... */ });
```

### 4. Use Helpers for Common Assertions

```typescript
// ❌ Bad: Manual assertions
const index = await manager.loadIndex();
expect(index.stashes.length).toBe(5);

// ✅ Good: Use helper
await helpers.assertStashCount(5);
```

### 5. Clean Up Resources

```typescript
// ✅ Always use afterEach
afterEach(async () => {
  await sandbox.cleanup();
});
```

---

## 🎯 Coverage Goals

Current coverage:
- **Lines**: 87.5%
- **Statements**: 89.2%
- **Functions**: 92.1%
- **Branches**: 78.4%

Target coverage:
- **Lines**: > 90%
- **Statements**: > 90%
- **Functions**: > 95%
- **Branches**: > 85%

Check coverage:
```bash
npm run test:coverage
open coverage/lcov-report/index.html
```

---

## 🚀 CI/CD Integration

Tests run automatically on:
- ✅ Push to `main`, `develop`, `feat/**`
- ✅ Pull requests to `main`, `develop`
- ✅ Changes to stash source code or tests

**Workflow**: `.github/workflows/stash-tests.yml`

**Matrix Testing**:
- OS: Ubuntu, macOS
- Node: 18.x, 20.x, 22.x

**Artifacts**:
- Test reports
- Coverage reports
- Uploaded for 30 days

---

## 📖 Additional Resources

- **Test Cases Documentation**: `TEST-CASES.md`
- **Sandbox Documentation**: `/vibe/vibes/testing/sandbox/README.md`
- **General Testing Infrastructure**: `/vibe/vibes/testing/README.md`
- **Stash Architecture**: `/vibe/vibes/memory/assistant/architectures/2025-10-23-vibe-devtools-stash-system.md`

---

## 🤝 Contributing

When adding new tests:

1. **Choose the right category** (basic/edge-cases/integration)
2. **Follow naming conventions**
3. **Use sandbox for isolation**
4. **Document in TEST-CASES.md**
5. **Update this README if adding new patterns**
6. **Ensure tests pass locally before PR**

---

**Last Updated**: 2025-10-25  
**Test Suites**: 14  
**Test Cases**: 40+  
**Pass Rate**: 100%

