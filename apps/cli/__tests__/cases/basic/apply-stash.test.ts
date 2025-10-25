import { SandboxManager } from '../../../../../../vibe/vibes/testing/helpers/sandbox-wrapper.js';
import { StashTestHelpers } from '../../helpers/test-helpers.js';
import { StashManager } from '../../../src/stash/stash-manager.js';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('Basic Test 3: Apply Stash', () => {
  let sandbox: SandboxManager;
  let helpers: StashTestHelpers;
  let manager: StashManager;

  beforeEach(async () => {
    sandbox = new SandboxManager();
    await sandbox.create({ projectName: 'stash-apply' });
    helpers = new StashTestHelpers(sandbox.getPath());
    manager = new StashManager();
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  test('apply stash restores original file content', async () => {
    const originalContent = 'Original version v1.0.0';
    const testFilePath = path.join(sandbox.getPath()!, 'config', 'test.md');
    
    await fs.writeFile(testFilePath, originalContent, 'utf-8');

    const filesToStash = new Map([[testFilePath, testFilePath]]);
    const stashId = await manager.create(filesToStash, { reason: 'manual' });

    await fs.writeFile(testFilePath, 'New version v2.0.0', 'utf-8');

    await manager.apply(stashId);

    const restoredContent = await fs.readFile(testFilePath, 'utf-8');
    expect(restoredContent).toBe(originalContent);
  });

  test('apply keeps stash in history (not deleted)', async () => {
    const testFilePath = path.join(sandbox.getPath()!, 'config', 'test.txt');
    
    await fs.writeFile(testFilePath, 'Content', 'utf-8');

    const filesToStash = new Map([[testFilePath, testFilePath]]);
    const stashId = await manager.create(filesToStash, { reason: 'manual' });

    await helpers.assertStashExists(stashId);
    
    await manager.apply(stashId);

    await helpers.assertStashExists(stashId);
    await helpers.assertStashCount(1);
  });

  test('apply validates hash integrity', async () => {
    const testFilePath = path.join(sandbox.getPath()!, 'config', 'test.md');
    
    await fs.writeFile(testFilePath, 'Original content', 'utf-8');

    const filesToStash = new Map([[testFilePath, testFilePath]]);
    const stashId = await manager.create(filesToStash, { reason: 'manual' });

    const metadata = await helpers.loadStashMetadata(stashId);
    const originalHash = metadata.files[0].hash;

    await manager.apply(stashId);

    await helpers.assertHashMatch(testFilePath, originalHash);
  });

  test('apply multiple files at once', async () => {
    const file1Path = path.join(sandbox.getPath()!, 'config', 'file1.md');
    const file2Path = path.join(sandbox.getPath()!, 'config', 'file2.txt');
    const file3Path = path.join(sandbox.getPath()!, 'config', 'file3.json');
    
    await fs.writeFile(file1Path, 'File 1 content', 'utf-8');
    await fs.writeFile(file2Path, 'File 2 content', 'utf-8');
    await fs.writeFile(file3Path, '{"key": "value"}', 'utf-8');

    const filesToStash = new Map([
      [file1Path, file1Path],
      [file2Path, file2Path],
      [file3Path, file3Path]
    ]);
    
    const stashId = await manager.create(filesToStash, { reason: 'manual' });

    await fs.writeFile(file1Path, 'Modified 1', 'utf-8');
    await fs.writeFile(file2Path, 'Modified 2', 'utf-8');
    await fs.writeFile(file3Path, '{}', 'utf-8');

    await manager.apply(stashId);

    const content1 = await fs.readFile(file1Path, 'utf-8');
    const content2 = await fs.readFile(file2Path, 'utf-8');
    const content3 = await fs.readFile(file3Path, 'utf-8');
    
    expect(content1).toBe('File 1 content');
    expect(content2).toBe('File 2 content');
    expect(content3).toBe('{"key": "value"}');
  });
});

