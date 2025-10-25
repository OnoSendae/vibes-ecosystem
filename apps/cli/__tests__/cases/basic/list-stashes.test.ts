import { SandboxManager } from '../../../../../../vibe/vibes/testing/helpers/sandbox-wrapper.js';
import { StashTestHelpers } from '../../helpers/test-helpers.js';
import { StashManager } from '../../../src/stash/stash-manager.js';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('Basic Test 4: List Stashes', () => {
  let sandbox: SandboxManager;
  let helpers: StashTestHelpers;
  let manager: StashManager;

  beforeEach(async () => {
    sandbox = new SandboxManager();
    await sandbox.create({ projectName: 'stash-list' });
    helpers = new StashTestHelpers(sandbox.getPath());
    manager = new StashManager();
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  test('list returns empty array when no stashes', async () => {
    const stashes = await manager.list();
    
    expect(stashes).toHaveLength(0);
    expect(Array.isArray(stashes)).toBe(true);
  });

  test('list returns all stashes in FILO order', async () => {
    const testFilePath = path.join(sandbox.getPath()!, 'config', 'test.txt');
    await fs.writeFile(testFilePath, 'Content', 'utf-8');
    const filesToStash = new Map([[testFilePath, testFilePath]]);

    await manager.create(filesToStash, { 
      reason: 'install',
      package: 'package-v1@1.0.0'
    });

    await new Promise(resolve => setTimeout(resolve, 10));

    await manager.create(filesToStash, { 
      reason: 'update',
      package: 'package-v2@2.0.0'
    });

    await new Promise(resolve => setTimeout(resolve, 10));

    await manager.create(filesToStash, { 
      reason: 'manual'
    });

    const stashes = await manager.list();
    
    expect(stashes).toHaveLength(3);
    expect(stashes[0].stash_id).toBe(0);
    expect(stashes[1].stash_id).toBe(1);
    expect(stashes[2].stash_id).toBe(2);
  });

  test('list includes complete metadata', async () => {
    const testFilePath = path.join(sandbox.getPath()!, 'config', 'test.md');
    await fs.writeFile(testFilePath, 'Test content', 'utf-8');
    const filesToStash = new Map([[testFilePath, testFilePath]]);

    await manager.create(filesToStash, { 
      reason: 'install',
      package: 'test-package@1.0.0',
      version_old: '0.9.0',
      version_new: '1.0.0'
    });

    const stashes = await manager.list();
    const stash = stashes[0];
    
    expect(stash).toHaveProperty('stash_id');
    expect(stash).toHaveProperty('timestamp');
    expect(stash).toHaveProperty('reason');
    expect(stash).toHaveProperty('package');
    expect(stash).toHaveProperty('version_old');
    expect(stash).toHaveProperty('version_new');
    expect(stash).toHaveProperty('files');
    
    expect(stash.reason).toBe('install');
    expect(stash.package).toBe('test-package@1.0.0');
    expect(stash.files).toHaveLength(1);
  });

  test('list shows correct file count per stash', async () => {
    const file1 = path.join(sandbox.getPath()!, 'config', 'file1.txt');
    const file2 = path.join(sandbox.getPath()!, 'config', 'file2.txt');
    const file3 = path.join(sandbox.getPath()!, 'config', 'file3.txt');
    
    await fs.writeFile(file1, 'Content 1', 'utf-8');
    await fs.writeFile(file2, 'Content 2', 'utf-8');
    await fs.writeFile(file3, 'Content 3', 'utf-8');

    const stash1Files = new Map([[file1, file1]]);
    await manager.create(stash1Files, { reason: 'manual' });

    const stash2Files = new Map([[file1, file1], [file2, file2], [file3, file3]]);
    await manager.create(stash2Files, { reason: 'manual' });

    const stashes = await manager.list();
    
    expect(stashes[0].files).toHaveLength(1);
    expect(stashes[1].files).toHaveLength(3);
  });

  test('list timestamps are in ISO format', async () => {
    const testFilePath = path.join(sandbox.getPath()!, 'config', 'test.txt');
    await fs.writeFile(testFilePath, 'Content', 'utf-8');
    const filesToStash = new Map([[testFilePath, testFilePath]]);

    await manager.create(filesToStash, { reason: 'manual' });

    const stashes = await manager.list();
    const timestamp = stashes[0].timestamp;
    
    expect(typeof timestamp).toBe('string');
    expect(() => new Date(timestamp)).not.toThrow();
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

