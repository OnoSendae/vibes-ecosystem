import { SandboxManager } from '../../../../../../vibe/vibes/testing/helpers/sandbox-wrapper.js';
import { StashTestHelpers } from '../../helpers/test-helpers.js';
import { StashManager } from '../../../src/stash/stash-manager.js';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('Basic Test 6: Clear All Stashes', () => {
    let sandbox: SandboxManager;
    let helpers: StashTestHelpers;
    let manager: StashManager;

    beforeEach(async () => {
        sandbox = new SandboxManager();
        await sandbox.create({ projectName: 'stash-clear-all' });
        helpers = new StashTestHelpers(sandbox.getPath());
        manager = new StashManager();
    });

    afterEach(async () => {
        await sandbox.cleanup();
    });

    test('clear removes all stashes', async () => {
        const testFilePath = path.join(sandbox.getPath()!, 'config', 'test.txt');
        await fs.writeFile(testFilePath, 'Content', 'utf-8');
        const filesToStash = new Map([[testFilePath, testFilePath]]);

        await manager.create(filesToStash, { reason: 'manual' });
        await manager.create(filesToStash, { reason: 'manual' });
        await manager.create(filesToStash, { reason: 'manual' });
        await manager.create(filesToStash, { reason: 'manual' });
        await manager.create(filesToStash, { reason: 'manual' });

        await helpers.assertStashCount(5);

        await manager.clear(true);

        await helpers.assertStashCount(0);
    });

    test('clear resets index to initial state', async () => {
        const testFilePath = path.join(sandbox.getPath()!, 'config', 'test.txt');
        await fs.writeFile(testFilePath, 'Content', 'utf-8');
        const filesToStash = new Map([[testFilePath, testFilePath]]);

        await manager.create(filesToStash, { reason: 'manual' });
        await manager.create(filesToStash, { reason: 'manual' });

        await manager.clear(true);

        const index = await helpers.loadStashIndex();
        expect(index.stashes).toHaveLength(0);
        expect(index.next_id).toBe(0);
    });

    test('clear deletes all physical stash directories', async () => {
        const testFilePath = path.join(sandbox.getPath()!, 'config', 'test.txt');
        await fs.writeFile(testFilePath, 'Content', 'utf-8');
        const filesToStash = new Map([[testFilePath, testFilePath]]);

        await manager.create(filesToStash, { reason: 'manual' });
        await manager.create(filesToStash, { reason: 'manual' });
        await manager.create(filesToStash, { reason: 'manual' });

        const stashDir0 = await helpers.getStashDirectory(0);
        const stashDir1 = await helpers.getStashDirectory(1);
        const stashDir2 = await helpers.getStashDirectory(2);

        await helpers.assertFileExists(stashDir0);
        await helpers.assertFileExists(stashDir1);
        await helpers.assertFileExists(stashDir2);

        await manager.clear(true);

        await helpers.assertFileNotExists(stashDir0);
        await helpers.assertFileNotExists(stashDir1);
        await helpers.assertFileNotExists(stashDir2);
    });

    test('clear requires confirmation', async () => {
        const testFilePath = path.join(sandbox.getPath()!, 'config', 'test.txt');
        await fs.writeFile(testFilePath, 'Content', 'utf-8');
        const filesToStash = new Map([[testFilePath, testFilePath]]);

        await manager.create(filesToStash, { reason: 'manual' });

        await expect(manager.clear(false)).rejects.toThrow('Clear operation requires confirmation');

        await helpers.assertStashCount(1);
    });

    test('clear on empty stash list succeeds', async () => {
        await helpers.assertStashCount(0);

        await expect(manager.clear(true)).resolves.not.toThrow();

        await helpers.assertStashCount(0);
    });
});

