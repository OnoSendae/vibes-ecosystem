import { SandboxManager } from '../../../../../../vibe/vibes/testing/helpers/sandbox-wrapper.js';
import { StashTestHelpers } from '../../helpers/test-helpers.js';
import { StashManager } from '../../../src/stash/stash-manager.js';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('Integration Test 3: Multiple Rollbacks', () => {
    let sandbox: SandboxManager;
    let helpers: StashTestHelpers;
    let manager: StashManager;

    beforeEach(async () => {
        sandbox = new SandboxManager();
        await sandbox.create({ projectName: 'integration-rollback' });
        helpers = new StashTestHelpers(sandbox.getPath());
        manager = new StashManager();
    });

    afterEach(async () => {
        await sandbox.cleanup();
    });

    test('rollback through multiple versions: apply stash{0} → apply stash{1} → apply stash{2}', async () => {
        const testFile = path.join(sandbox.getPath()!, 'config', 'test.md');
        const files = new Map([[testFile, testFile]]);

        const versions = ['v1', 'v2', 'v3', 'v4', 'v5'];

        for (const version of versions) {
            await fs.writeFile(testFile, `Content: ${version}`, 'utf-8');
            await manager.create(files, { reason: 'manual' });
        }

        await fs.writeFile(testFile, 'Current: v6', 'utf-8');

        await manager.apply(0);
        let content = await fs.readFile(testFile, 'utf-8');
        expect(content).toBe('Content: v1');

        await manager.apply(2);
        content = await fs.readFile(testFile, 'utf-8');
        expect(content).toBe('Content: v3');

        await manager.apply(4);
        content = await fs.readFile(testFile, 'utf-8');
        expect(content).toBe('Content: v5');

        await helpers.assertStashCount(5);
    });

    test('back-and-forth rollbacks preserve stash integrity', async () => {
        const testFile = path.join(sandbox.getPath()!, 'config', 'test.txt');
        const files = new Map([[testFile, testFile]]);

        await fs.writeFile(testFile, 'Original', 'utf-8');
        await manager.create(files, { reason: 'manual' });

        await fs.writeFile(testFile, 'Modified', 'utf-8');
        await manager.create(files, { reason: 'manual' });

        for (let i = 0; i < 5; i++) {
            await manager.apply(0);
            let content = await fs.readFile(testFile, 'utf-8');
            expect(content).toBe('Original');

            await manager.apply(1);
            content = await fs.readFile(testFile, 'utf-8');
            expect(content).toBe('Modified');
        }

        await helpers.assertStashCount(2);
        await helpers.assertStashExists(0);
        await helpers.assertStashExists(1);
    });

    test('rollback after remove still works for remaining stashes', async () => {
        const testFile = path.join(sandbox.getPath()!, 'config', 'test.md');
        const files = new Map([[testFile, testFile]]);

        const contents = ['A', 'B', 'C', 'D', 'E'];
        for (const content of contents) {
            await fs.writeFile(testFile, content, 'utf-8');
            await manager.create(files, { reason: 'manual' });
        }

        await manager.remove(2);

        await helpers.assertStashCount(4);

        await manager.apply(0);
        let content = await fs.readFile(testFile, 'utf-8');
        expect(content).toBe('A');

        await manager.apply(2);
        content = await fs.readFile(testFile, 'utf-8');
        expect(content).toBe('D');
    });

    test('apply same stash multiple times is idempotent', async () => {
        const testFile = path.join(sandbox.getPath()!, 'config', 'test.txt');
        const files = new Map([[testFile, testFile]]);

        const originalContent = 'Stable version';
        await fs.writeFile(testFile, originalContent, 'utf-8');
        await manager.create(files, { reason: 'manual' });

        for (let i = 0; i < 10; i++) {
            await fs.writeFile(testFile, `Temporary change ${i}`, 'utf-8');
            await manager.apply(0);

            const content = await fs.readFile(testFile, 'utf-8');
            expect(content).toBe(originalContent);
        }

        await helpers.assertStashCount(1);
    });

    test('complex rollback scenario: temporal navigation', async () => {
        const file1 = path.join(sandbox.getPath()!, 'config', 'file1.txt');
        const file2 = path.join(sandbox.getPath()!, 'config', 'file2.txt');

        await fs.writeFile(file1, 'F1-V1', 'utf-8');
        await fs.writeFile(file2, 'F2-V1', 'utf-8');

        const filesMap1 = new Map([[file1, file1], [file2, file2]]);
        await manager.create(filesMap1, { reason: 'manual' });

        await fs.writeFile(file1, 'F1-V2', 'utf-8');
        const filesMap2 = new Map([[file1, file1]]);
        await manager.create(filesMap2, { reason: 'manual' });

        await fs.writeFile(file2, 'F2-V3', 'utf-8');
        const filesMap3 = new Map([[file2, file2]]);
        await manager.create(filesMap3, { reason: 'manual' });

        await manager.apply(1);
        let content1 = await fs.readFile(file1, 'utf-8');
        expect(content1).toBe('F1-V2');

        await manager.apply(0);
        content1 = await fs.readFile(file1, 'utf-8');
        const content2 = await fs.readFile(file2, 'utf-8');
        expect(content1).toBe('F1-V1');
        expect(content2).toBe('F2-V1');
    });
});

