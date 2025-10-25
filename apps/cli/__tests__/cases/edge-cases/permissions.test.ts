import { SandboxManager } from '../../../../../../vibe/vibes/testing/helpers/sandbox-wrapper.js';
import { StashTestHelpers } from '../../helpers/test-helpers.js';
import { StashManager } from '../../../src/stash/stash-manager.js';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('Edge Case 4: Permissions Issues', () => {
    let sandbox: SandboxManager;
    let helpers: StashTestHelpers;
    let manager: StashManager;

    beforeEach(async () => {
        sandbox = new SandboxManager();
        await sandbox.create({ projectName: 'edge-permissions' });
        helpers = new StashTestHelpers(sandbox.getPath());
        manager = new StashManager();
    });

    afterEach(async () => {
        await sandbox.cleanup();
    });

    test('read-only stash directory blocks creation', async () => {
        const testFilePath = path.join(sandbox.getPath()!, 'config', 'test.txt');
        await fs.writeFile(testFilePath, 'Content', 'utf-8');
        const filesToStash = new Map([[testFilePath, testFilePath]]);

        const vibesHome = await helpers.getVibesHome();
        const stashDir = path.join(vibesHome, 'stash');

        await fs.chmod(stashDir, 0o444);

        await expect(manager.create(filesToStash, { reason: 'manual' })).rejects.toThrow();

        await fs.chmod(stashDir, 0o755);
    });

    test('no-read permission on stash prevents listing', async () => {
        const testFilePath = path.join(sandbox.getPath()!, 'config', 'test.txt');
        await fs.writeFile(testFilePath, 'Content', 'utf-8');
        const filesToStash = new Map([[testFilePath, testFilePath]]);

        const stashId = await manager.create(filesToStash, { reason: 'manual' });

        await helpers.removeStashPermissions(stashId);

        await expect(manager.show(stashId)).rejects.toThrow();

        await helpers.restoreStashPermissions(stashId);
    });

    test('write-protected target file prevents apply', async () => {
        const testFilePath = path.join(sandbox.getPath()!, 'config', 'test.txt');
        await fs.writeFile(testFilePath, 'Original', 'utf-8');
        const filesToStash = new Map([[testFilePath, testFilePath]]);

        const stashId = await manager.create(filesToStash, { reason: 'manual' });

        await fs.writeFile(testFilePath, 'Modified', 'utf-8');
        await fs.chmod(testFilePath, 0o444);

        await expect(manager.apply(stashId)).rejects.toThrow();

        await fs.chmod(testFilePath, 0o644);
    });

    test('missing parent directory is created during apply', async () => {
        const testFilePath = path.join(sandbox.getPath()!, 'config', 'nested', 'deep', 'test.txt');

        await fs.mkdir(path.dirname(testFilePath), { recursive: true });
        await fs.writeFile(testFilePath, 'Content', 'utf-8');

        const filesToStash = new Map([[testFilePath, testFilePath]]);
        const stashId = await manager.create(filesToStash, { reason: 'manual' });

        await fs.rm(path.join(sandbox.getPath()!, 'config', 'nested'), { recursive: true });

        await manager.apply(stashId);

        await helpers.assertFileExists(testFilePath);
        const content = await fs.readFile(testFilePath, 'utf-8');
        expect(content).toBe('Content');
    });
});

