import { SandboxManager } from '../../../../../../vibe/vibes/testing/helpers/sandbox-wrapper.js';
import { StashTestHelpers } from '../../helpers/test-helpers.js';
import { StashManager } from '../../../src/stash/stash-manager.js';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('Basic Test 2: Update with Conflicts', () => {
  let sandbox: SandboxManager;
  let helpers: StashTestHelpers;
  let manager: StashManager;

  beforeEach(async () => {
    sandbox = new SandboxManager();
    await sandbox.create({ projectName: 'stash-update-conflicts' });
    helpers = new StashTestHelpers(sandbox.getPath());
    manager = new StashManager();
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  test('update with customized file creates stash', async () => {
    const testFilePath = path.join(sandbox.getPath()!, 'config', '.cursor', 'commands', 'test.command.md');
    
    await fs.mkdir(path.dirname(testFilePath), { recursive: true });
    await fs.writeFile(testFilePath, 'Original content v1', 'utf-8');

    const filesToStash = new Map([[testFilePath, testFilePath]]);
    
    const stashId = await manager.create(filesToStash, {
      reason: 'install',
      package: 'test-vibe@2.0.0',
      version_old: '1.0.0',
      version_new: '2.0.0'
    });

    expect(stashId).toBe(0);
    
    await helpers.assertStashCount(1);
    await helpers.assertStashExists(0);
    await helpers.assertFileInStash(0, testFilePath);
  });

  test('stash metadata contains correct information', async () => {
    const testFilePath = path.join(sandbox.getPath()!, 'config', 'test.txt');
    
    await fs.writeFile(testFilePath, 'Test content', 'utf-8');

    const filesToStash = new Map([[testFilePath, testFilePath]]);
    
    await manager.create(filesToStash, {
      reason: 'install',
      package: 'test-package@2.0.0',
      version_old: '1.0.0',
      version_new: '2.0.0'
    });

    await helpers.assertStashMetadata(0, {
      reason: 'install',
      package: 'test-package@2.0.0',
      version_old: '1.0.0',
      version_new: '2.0.0'
    });
  });

  test('stash preserves file content exactly', async () => {
    const originalContent = 'This is the original customized content\nWith multiple lines\nAnd special chars: 你好';
    const testFilePath = path.join(sandbox.getPath()!, 'config', 'test.md');
    
    await fs.writeFile(testFilePath, originalContent, 'utf-8');

    const filesToStash = new Map([[testFilePath, testFilePath]]);
    await manager.create(filesToStash, { reason: 'manual' });

    const stashFilePath = await helpers.getStashFilePath(0, 'test.md');
    const stashedContent = await fs.readFile(stashFilePath, 'utf-8');
    
    expect(stashedContent).toBe(originalContent);
  });
});

