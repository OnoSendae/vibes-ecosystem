import { SandboxManager } from '../../../../../../vibe/vibes/testing/helpers/sandbox-wrapper.js';
import { StashTestHelpers } from '../../helpers/test-helpers.js';
import { StashManager } from '../../../src/stash/stash-manager.js';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('Edge Case 2: Multiple Stashes Simultaneous', () => {
    let sandbox: SandboxManager;
    let helpers: StashTestHelpers;
    let manager: StashManager;

    beforeEach(async () => {
        sandbox = new SandboxManager();
        await sandbox.create({ projectName: 'edge-multiple' });
        helpers = new StashTestHelpers(sandbox.getPath());
        manager = new StashManager();
    });

    afterEach(async () => {
        await sandbox.cleanup();
    });

    test('create 10 stashes in sequence', async () => {
        const testFilePath = path.join(sandbox.getPath()!, 'config', 'test.txt');
        await fs.writeFile(testFilePath, 'Content', 'utf-8');
        const filesToStash = new Map([[testFilePath, testFilePath]]);

        for (let i = 0; i < 10; i++) {
            await manager.create(filesToStash, {
                reason: 'manual',
                package: `package-v${i}@${i}.0.0`
            });
        }

        await helpers.assertStashCount(10);
    });

    test('FILO ordering maintained with many stashes', async () => {
        const testFilePath = path.join(sandbox.getPath()!, 'config', 'test.txt');
        await fs.writeFile(testFilePath, 'Content', 'utf-8');
        const filesToStash = new Map([[testFilePath, testFilePath]]);

        for (let i = 0; i < 10; i++) {
            await manager.create(filesToStash, { reason: 'manual' });
        }

        const expectedOrdering = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
        await helpers.assertStashOrdering(expectedOrdering);
    });

    test('each stash is independent and recoverable', async () => {
        const testFilePath = path.join(sandbox.getPath()!, 'config', 'test.txt');
        const filesToStash = new Map([[testFilePath, testFilePath]]);

        const contents = ['Content 0', 'Content 1', 'Content 2', 'Content 3', 'Content 4'];

        for (const content of contents) {
            await fs.writeFile(testFilePath, content, 'utf-8');
            await manager.create(filesToStash, { reason: 'manual' });
        }

        for (let i = 0; i < contents.length; i++) {
            const stashFilePath = await helpers.getStashFilePath(i, 'test.txt');
            const stashedContent = await fs.readFile(stashFilePath, 'utf-8');
            expect(stashedContent).toBe(contents[i]);
        }
    });

    test('removing middle stash reorders correctly', async () => {
        const testFilePath = path.join(sandbox.getPath()!, 'config', 'test.txt');
        await fs.writeFile(testFilePath, 'Content', 'utf-8');
        const filesToStash = new Map([[testFilePath, testFilePath]]);

        for (let i = 0; i < 5; i++) {
            await manager.create(filesToStash, {
                reason: 'manual',
                package: `stash-${i}`
            });
        }

        await manager.remove(2);

        await helpers.assertStashCount(4);
        await helpers.assertStashOrdering([0, 1, 2, 3]);

        const metadata0 = await helpers.loadStashMetadata(0);
        const metadata1 = await helpers.loadStashMetadata(1);
        const metadata2 = await helpers.loadStashMetadata(2);
        const metadata3 = await helpers.loadStashMetadata(3);

        expect(metadata0.package).toBe('stash-0');
        expect(metadata1.package).toBe('stash-1');
        expect(metadata2.package).toBe('stash-3');
        expect(metadata3.package).toBe('stash-4');
    });

    test('applying any stash from many works correctly', async () => {
        const testFilePath = path.join(sandbox.getPath()!, 'config', 'test.txt');
        const filesToStash = new Map([[testFilePath, testFilePath]]);

        const contents = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7'];

        for (const content of contents) {
            await fs.writeFile(testFilePath, content, 'utf-8');
            await manager.create(filesToStash, { reason: 'manual' });
        }

        await manager.apply(3);
        const appliedContent = await fs.readFile(testFilePath, 'utf-8');
        expect(appliedContent).toBe('V4');

        await manager.apply(0);
        const reappliedContent = await fs.readFile(testFilePath, 'utf-8');
        expect(reappliedContent).toBe('V1');
    });
});

