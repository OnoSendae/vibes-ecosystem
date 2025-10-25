import { SandboxManager } from '../../../../../../vibe/vibes/testing/helpers/sandbox-wrapper.js';
import { StashTestHelpers } from '../../helpers/test-helpers.js';
import { StashManager } from '../../../src/stash/stash-manager.js';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('Edge Case 3: Corrupted Stash', () => {
    let sandbox: SandboxManager;
    let helpers: StashTestHelpers;
    let manager: StashManager;

    beforeEach(async () => {
        sandbox = new SandboxManager();
        await sandbox.create({ projectName: 'edge-corrupted' });
        helpers = new StashTestHelpers(sandbox.getPath());
        manager = new StashManager();
    });

    afterEach(async () => {
        await sandbox.cleanup();
    });

    test('corrupted file (hash mismatch) is detected', async () => {
        const testFilePath = path.join(sandbox.getPath()!, 'config', 'test.txt');
        await fs.writeFile(testFilePath, 'Original content', 'utf-8');
        const filesToStash = new Map([[testFilePath, testFilePath]]);

        const stashId = await manager.create(filesToStash, { reason: 'manual' });

        await helpers.corruptStashFile(stashId, 'test.txt');

        await expect(manager.apply(stashId)).rejects.toThrow(/corrupted|hash mismatch/i);
    });

    test('missing stash file is detected', async () => {
        const testFilePath = path.join(sandbox.getPath()!, 'config', 'test.txt');
        await fs.writeFile(testFilePath, 'Content', 'utf-8');
        const filesToStash = new Map([[testFilePath, testFilePath]]);

        const stashId = await manager.create(filesToStash, { reason: 'manual' });

        const stashFilePath = await helpers.getStashFilePath(stashId, 'test.txt');
        await fs.unlink(stashFilePath);

        await expect(manager.apply(stashId)).rejects.toThrow(/missing/i);
    });

    test('corrupted metadata.json is handled', async () => {
        const testFilePath = path.join(sandbox.getPath()!, 'config', 'test.txt');
        await fs.writeFile(testFilePath, 'Content', 'utf-8');
        const filesToStash = new Map([[testFilePath, testFilePath]]);

        const stashId = await manager.create(filesToStash, { reason: 'manual' });

        const stashDir = await helpers.getStashDirectory(stashId);
        const metadataPath = path.join(stashDir, 'metadata.json');

        await fs.writeFile(metadataPath, 'INVALID JSON{{{', 'utf-8');

        await expect(manager.show(stashId)).rejects.toThrow();
    });

    test('missing files directory is detected', async () => {
        const testFilePath = path.join(sandbox.getPath()!, 'config', 'test.txt');
        await fs.writeFile(testFilePath, 'Content', 'utf-8');
        const filesToStash = new Map([[testFilePath, testFilePath]]);

        const stashId = await manager.create(filesToStash, { reason: 'manual' });

        const stashDir = await helpers.getStashDirectory(stashId);
        const filesDir = path.join(stashDir, 'files');

        await fs.rm(filesDir, { recursive: true });

        await expect(manager.apply(stashId)).rejects.toThrow(/corrupted|missing/i);
    });

    test('partial corruption does not apply any files', async () => {
        const file1Path = path.join(sandbox.getPath()!, 'config', 'file1.txt');
        const file2Path = path.join(sandbox.getPath()!, 'config', 'file2.txt');

        await fs.writeFile(file1Path, 'File 1', 'utf-8');
        await fs.writeFile(file2Path, 'File 2', 'utf-8');

        const filesToStash = new Map([
            [file1Path, file1Path],
            [file2Path, file2Path]
        ]);

        const stashId = await manager.create(filesToStash, { reason: 'manual' });

        await helpers.corruptStashFile(stashId, 'file2.txt');

        await fs.writeFile(file1Path, 'Modified 1', 'utf-8');
        await fs.writeFile(file2Path, 'Modified 2', 'utf-8');

        await expect(manager.apply(stashId)).rejects.toThrow();

        const content1 = await fs.readFile(file1Path, 'utf-8');
        const content2 = await fs.readFile(file2Path, 'utf-8');

        expect(content1).toBe('Modified 1');
        expect(content2).toBe('Modified 2');
    });
});

