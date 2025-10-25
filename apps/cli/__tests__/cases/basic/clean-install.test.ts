import { SandboxManager } from '../../../../../../vibe/vibes/testing/helpers/sandbox-wrapper.js';
import { StashTestHelpers } from '../../helpers/test-helpers.js';
import { StashManager } from '../../../src/stash/stash-manager.js';

describe('Basic Test 1: Clean Install', () => {
  let sandbox: SandboxManager;
  let helpers: StashTestHelpers;
  let manager: StashManager;

  beforeEach(async () => {
    sandbox = new SandboxManager();
    await sandbox.create({ projectName: 'stash-clean-install' });
    helpers = new StashTestHelpers(sandbox.getPath());
    manager = new StashManager();
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  test('first install creates no stash (nothing to preserve)', async () => {
    const index = await manager.loadIndex();
    
    expect(index.stashes).toHaveLength(0);
    expect(index.next_id).toBe(0);
    
    await helpers.assertStashCount(0);
  });

  test('stash directory structure is initialized', async () => {
    const vibesHome = await helpers.getVibesHome();
    
    await helpers.assertFileExists(`${vibesHome}/stash/index.json`);
    
    const index = await helpers.loadStashIndex();
    expect(index).toHaveProperty('stashes');
    expect(index).toHaveProperty('next_id');
  });

  test('index.json has correct initial state', async () => {
    await helpers.assertIndexProperty('next_id', 0);
    
    const index = await helpers.loadStashIndex();
    expect(Array.isArray(index.stashes)).toBe(true);
  });
});

