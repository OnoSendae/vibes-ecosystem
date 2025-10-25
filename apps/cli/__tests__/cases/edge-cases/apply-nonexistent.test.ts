import { SandboxManager } from '../../../../../../vibe/vibes/testing/helpers/sandbox-wrapper.js';
import { StashTestHelpers } from '../../helpers/test-helpers.js';
import { StashManager } from '../../../src/stash/stash-manager.js';

describe('Edge Case 1: Apply Nonexistent Stash', () => {
    let sandbox: SandboxManager;
    let helpers: StashTestHelpers;
    let manager: StashManager;

    beforeEach(async () => {
        sandbox = new SandboxManager();
        await sandbox.create({ projectName: 'edge-nonexistent' });
        helpers = new StashTestHelpers(sandbox.getPath());
        manager = new StashManager();
    });

    afterEach(async () => {
        await sandbox.cleanup();
    });

    test('apply nonexistent stash throws clear error', async () => {
        await expect(manager.apply(999)).rejects.toThrow('Stash 999 not found');
    });

    test('show nonexistent stash throws clear error', async () => {
        await expect(manager.show(5)).rejects.toThrow('Stash 5 not found');
    });

    test('remove nonexistent stash throws clear error', async () => {
        await expect(manager.remove(10)).rejects.toThrow('Stash 10 not found');
    });

    test('applying nonexistent stash does not modify files', async () => {
        await helpers.assertStashCount(0);

        await expect(manager.apply(0)).rejects.toThrow();

        await helpers.assertStashCount(0);
    });

    test('error message is user-friendly', async () => {
        try {
            await manager.apply(42);
            fail('Should have thrown');
        } catch (error) {
            expect((error as Error).message).toContain('Stash 42');
            expect((error as Error).message).toContain('not found');
        }
    });
});

