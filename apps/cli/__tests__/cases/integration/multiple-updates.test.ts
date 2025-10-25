import { SandboxManager } from '../../../../../../vibe/vibes/testing/helpers/sandbox-wrapper.js';
import { StashTestHelpers } from '../../helpers/test-helpers.js';
import { StashManager } from '../../../src/stash/stash-manager.js';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('Integration Test 2: Multiple Updates (FILO stacking)', () => {
    let sandbox: SandboxManager;
    let helpers: StashTestHelpers;
    let manager: StashManager;

    beforeEach(async () => {
        sandbox = new SandboxManager();
        await sandbox.create({ projectName: 'integration-multiple-updates' });
        helpers = new StashTestHelpers(sandbox.getPath());
        manager = new StashManager();
    });

    afterEach(async () => {
        await sandbox.cleanup();
    });

    test('5 sequential updates create 5 stashes in FILO order', async () => {
        const testFile = path.join(sandbox.getPath()!, 'config', 'test.md');
        const files = new Map([[testFile, testFile]]);

        const versions = ['v1.0.0', 'v1.1.0', 'v1.2.0', 'v2.0.0', 'v2.1.0'];

        for (let i = 0; i < versions.length; i++) {
            await fs.writeFile(testFile, `Content for ${versions[i]}`, 'utf-8');

            await manager.create(files, {
                reason: i === 0 ? 'install' : 'update',
                package: `pkg@${versions[i]}`,
                version_old: i > 0 ? versions[i - 1] : undefined,
                version_new: versions[i]
            });
        }

        await helpers.assertStashCount(5);
        await helpers.assertStashOrdering([0, 1, 2, 3, 4]);

        const stashes = await manager.list();
        expect(stashes[0].package).toBe('pkg@v1.0.0');
        expect(stashes[4].package).toBe('pkg@v2.1.0');
    });

    test('stash stack maintains content integrity across updates', async () => {
        const testFile = path.join(sandbox.getPath()!, 'config', 'test.txt');
        const files = new Map([[testFile, testFile]]);

        const contents = [
            'First version content',
            'Second version content',
            'Third version content',
            'Fourth version content'
        ];

        for (const content of contents) {
            await fs.writeFile(testFile, content, 'utf-8');
            await manager.create(files, { reason: 'manual' });
        }

        for (let i = 0; i < contents.length; i++) {
            const stashFilePath = await helpers.getStashFilePath(i, 'test.txt');
            const stashedContent = await fs.readFile(stashFilePath, 'utf-8');
            expect(stashedContent).toBe(contents[i]);
        }
    });

    test('removing middle update reorders stack correctly', async () => {
        const testFile = path.join(sandbox.getPath()!, 'config', 'test.md');
        const files = new Map([[testFile, testFile]]);

        for (let i = 0; i < 5; i++) {
            await fs.writeFile(testFile, `Version ${i}`, 'utf-8');
            await manager.create(files, {
                reason: 'update',
                package: `pkg@${i}.0.0`
            });
        }

        await manager.remove(2);

        await helpers.assertStashCount(4);
        await helpers.assertStashOrdering([0, 1, 2, 3]);

        const stashes = await manager.list();
        expect(stashes[0].package).toBe('pkg@0.0.0');
        expect(stashes[1].package).toBe('pkg@1.0.0');
        expect(stashes[2].package).toBe('pkg@3.0.0');
        expect(stashes[3].package).toBe('pkg@4.0.0');
    });

    test('clearing all after multiple updates resets state', async () => {
        const testFile = path.join(sandbox.getPath()!, 'config', 'test.md');
        const files = new Map([[testFile, testFile]]);

        for (let i = 0; i < 10; i++) {
            await fs.writeFile(testFile, `Version ${i}`, 'utf-8');
            await manager.create(files, { reason: 'update' });
        }

        await helpers.assertStashCount(10);

        await manager.clear(true);

        await helpers.assertStashCount(0);

        const index = await helpers.loadStashIndex();
        expect(index.next_id).toBe(0);
    });

    test('applying oldest stash in stack works correctly', async () => {
        const testFile = path.join(sandbox.getPath()!, 'config', 'test.txt');
        const files = new Map([[testFile, testFile]]);

        const firstContent = 'This is the very first version';
        await fs.writeFile(testFile, firstContent, 'utf-8');
        await manager.create(files, { reason: 'install' });

        for (let i = 1; i < 5; i++) {
            await fs.writeFile(testFile, `Version ${i}`, 'utf-8');
            await manager.create(files, { reason: 'update' });
        }

        await fs.writeFile(testFile, 'Current latest version', 'utf-8');

        await manager.apply(0);

        const content = await fs.readFile(testFile, 'utf-8');
        expect(content).toBe(firstContent);
    });
});

