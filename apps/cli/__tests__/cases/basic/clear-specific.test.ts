import { SandboxManager } from '../../../../../../vibe/vibes/testing/helpers/sandbox-wrapper.js';
import { StashTestHelpers } from '../../helpers/test-helpers.js';
import { StashManager } from '../../../src/stash/stash-manager.js';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('Basic Test 5: Clear Specific Stash', () => {
    let sandbox: SandboxManager;
    let helpers: StashTestHelpers;
    let manager: StashManager;

    beforeEach(async () => {
        sandbox = new SandboxManager();
        await sandbox.create({ projectName: 'stash-clear-specific' });
        helpers = new StashTestHelpers(sandbox.getPath());
        manager = new StashManager();
    });

    afterEach(async () => {
        await sandbox.cleanup();
    });

    test('remove deletes specific stash', async () => {
        const testFilePath = path.join(sandbox.getPath()!, 'config', 'test.txt');
        await fs.writeFile(testFilePath, 'Content', 'utf-8');
        const filesToStash = new Map([[testFilePath, testFilePath]]);

        await manager.create(filesToStash, { reason: 'manual' });
        await manager.create(filesToStash, { reason: 'manual' });
        await manager.create(filesToStash, { reason: 'manual' });

        await helpers.assertStashCount(3);

        await manager.remove(1);

        await helpers.assertStashCount(2);
        await helpers.assertStashNotExists(2);
    });

    test('remove reorders remaining stashes (FILO)', async () => {
        const testFilePath = path.join(sandbox.getPath()!, 'config', 'test.txt');
        await fs.writeFile(testFilePath, 'Content', 'utf-8');
        const filesToStash = new Map([[testFilePath, testFilePath]]);

        await manager.create(filesToStash, { reason: 'manual', package: 'stash-0' });
        await manager.create(filesToStash, { reason: 'manual', package: 'stash-1' });
        await manager.create(filesToStash, { reason: 'manual', package: 'stash-2' });

        await manager.remove(1);

        await helpers.assertStashOrdering([0, 1]);

        const metadata0 = await helpers.loadStashMetadata(0);
        const metadata1 = await helpers.loadStashMetadata(1);

        expect(metadata0.package).toBe('stash-0');
        expect(metadata1.package).toBe('stash-2');
    });

    test('remove throws error if stash not found', async () => {
        await expect(manager.remove(999)).rejects.toThrow('Stash 999 not found');
    });

    test('remove deletes physical stash directory', async () => {
        const testFilePath = path.join(sandbox.getPath()!, 'config', 'test.txt');
        await fs.writeFile(testFilePath, 'Content', 'utf-8');
        const filesToStash = new Map([[testFilePath, testFilePath]]);

        await manager.create(filesToStash, { reason: 'manual' });

        const stashDir = await helpers.getStashDirectory(0);
        await helpers.assertFileExists(stashDir);

        await manager.remove(0);

        await helpers.assertFileNotExists(stashDir);
    });

    test('remove updates index.json correctly', async () => {
        const testFilePath = path.join(sandbox.getPath()!, 'config', 'test.txt');
        await fs.writeFile(testFilePath, 'Content', 'utf-8');
        const filesToStash = new Map([[testFilePath, testFilePath]]);

        await manager.create(filesToStash, { reason: 'manual' });
        await manager.create(filesToStash, { reason: 'manual' });

        let index = await helpers.loadStashIndex();
        expect(index.stashes).toHaveLength(2);
        expect(index.next_id).toBe(2);

        await manager.remove(0);

        index = await helpers.loadStashIndex();
        expect(index.stashes).toHaveLength(1);
        expect(index.stashes[0].stash_id).toBe(0);
    });
});

