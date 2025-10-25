import { SandboxManager } from '../../../../../../vibe/vibes/testing/helpers/sandbox-wrapper.js';
import { StashTestHelpers } from '../../helpers/test-helpers.js';
import { StashManager } from '../../../src/stash/stash-manager.js';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('Integration Test 1: Full Workflow (install → update → stash → apply)', () => {
    let sandbox: SandboxManager;
    let helpers: StashTestHelpers;
    let manager: StashManager;

    beforeEach(async () => {
        sandbox = new SandboxManager();
        await sandbox.create({ projectName: 'integration-full-workflow' });
        helpers = new StashTestHelpers(sandbox.getPath());
        manager = new StashManager();
    });

    afterEach(async () => {
        await sandbox.cleanup();
    });

    test('complete workflow: install v1 → customize → update v2 → apply stash', async () => {
        const commandPath = path.join(sandbox.getPath()!, 'config', '.cursor', 'commands', 'test.command.md');

        await fs.mkdir(path.dirname(commandPath), { recursive: true });
        await fs.writeFile(commandPath, 'Package v1.0.0 - Original', 'utf-8');

        await helpers.assertStashCount(0);

        await fs.writeFile(commandPath, 'Package v1.0.0 - CUSTOMIZED by user', 'utf-8');

        const filesToStash = new Map([[commandPath, commandPath]]);
        const stashId = await manager.create(filesToStash, {
            reason: 'install',
            package: 'test-package@2.0.0',
            version_old: '1.0.0',
            version_new: '2.0.0'
        });

        expect(stashId).toBe(0);
        await helpers.assertStashCount(1);

        await fs.writeFile(commandPath, 'Package v2.0.0 - New version', 'utf-8');

        await manager.apply(stashId);

        const restoredContent = await fs.readFile(commandPath, 'utf-8');
        expect(restoredContent).toBe('Package v1.0.0 - CUSTOMIZED by user');

        await helpers.assertStashExists(stashId);
    });

    test('workflow: multiple customizations across updates', async () => {
        const command1 = path.join(sandbox.getPath()!, 'config', '.cursor', 'commands', 'cmd1.md');
        const command2 = path.join(sandbox.getPath()!, 'config', '.cursor', 'commands', 'cmd2.md');
        const rule1 = path.join(sandbox.getPath()!, 'config', '.cursor', 'rules', 'rule1.md');

        await fs.mkdir(path.dirname(command1), { recursive: true });
        await fs.mkdir(path.dirname(rule1), { recursive: true });

        await fs.writeFile(command1, 'Command 1 v1', 'utf-8');
        await fs.writeFile(command2, 'Command 2 v1', 'utf-8');
        await fs.writeFile(rule1, 'Rule 1 v1', 'utf-8');

        const files1 = new Map([
            [command1, command1],
            [command2, command2],
            [rule1, rule1]
        ]);

        await manager.create(files1, {
            reason: 'install',
            package: 'package@2.0.0',
            version_old: '1.0.0',
            version_new: '2.0.0'
        });

        await fs.writeFile(command1, 'Command 1 v2', 'utf-8');
        await fs.writeFile(command2, 'Command 2 v2 - CUSTOMIZED', 'utf-8');
        await fs.writeFile(rule1, 'Rule 1 v2', 'utf-8');

        const files2 = new Map([[command2, command2]]);
        await manager.create(files2, {
            reason: 'update',
            package: 'package@3.0.0',
            version_old: '2.0.0',
            version_new: '3.0.0'
        });

        await fs.writeFile(command2, 'Command 2 v3', 'utf-8');

        await manager.apply(1);

        const content = await fs.readFile(command2, 'utf-8');
        expect(content).toBe('Command 2 v2 - CUSTOMIZED');

        await helpers.assertStashCount(2);
    });

    test('workflow: verify metadata through entire cycle', async () => {
        const testFile = path.join(sandbox.getPath()!, 'config', 'test.md');
        await fs.writeFile(testFile, 'V1', 'utf-8');

        const files = new Map([[testFile, testFile]]);
        const stashId = await manager.create(files, {
            reason: 'install',
            package: 'pkg@2.0.0',
            version_old: '1.0.0',
            version_new: '2.0.0'
        });

        const metadata = await helpers.loadStashMetadata(stashId);

        expect(metadata.stash_id).toBe(0);
        expect(metadata.reason).toBe('install');
        expect(metadata.package).toBe('pkg@2.0.0');
        expect(metadata.version_old).toBe('1.0.0');
        expect(metadata.version_new).toBe('2.0.0');
        expect(metadata.files).toHaveLength(1);
        expect(metadata.files[0].path).toBe(testFile);
        expect(metadata.timestamp).toBeTruthy();

        await fs.writeFile(testFile, 'V2', 'utf-8');
        await manager.apply(stashId);

        const stillExists = await manager.list();
        expect(stillExists).toHaveLength(1);
        expect(stillExists[0].stash_id).toBe(0);
    });
});

