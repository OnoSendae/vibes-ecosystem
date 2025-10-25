import { SandboxManager } from '../../../../../../vibe/vibes/testing/helpers/sandbox-wrapper.js';
import { StashTestHelpers } from '../../helpers/test-helpers.js';
import { StashManager } from '../../../src/stash/stash-manager.js';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('Integration Test 4: Mixed File Types', () => {
    let sandbox: SandboxManager;
    let helpers: StashTestHelpers;
    let manager: StashManager;

    beforeEach(async () => {
        sandbox = new SandboxManager();
        await sandbox.create({ projectName: 'integration-mixed-types' });
        helpers = new StashTestHelpers(sandbox.getPath());
        manager = new StashManager();
    });

    afterEach(async () => {
        await sandbox.cleanup();
    });

    test('stash handles .md, .ts, .json, .sh files correctly', async () => {
        const mdFile = path.join(sandbox.getPath()!, 'config', 'doc.md');
        const tsFile = path.join(sandbox.getPath()!, 'config', 'script.ts');
        const jsonFile = path.join(sandbox.getPath()!, 'config', 'config.json');
        const shFile = path.join(sandbox.getPath()!, 'config', 'script.sh');

        await fs.writeFile(mdFile, '# Markdown\n\nContent here', 'utf-8');
        await fs.writeFile(tsFile, 'const x: number = 42;\nexport default x;', 'utf-8');
        await fs.writeFile(jsonFile, '{\n  "key": "value",\n  "number": 123\n}', 'utf-8');
        await fs.writeFile(shFile, '#!/bin/bash\necho "Hello"\nexit 0', 'utf-8');

        const files = new Map([
            [mdFile, mdFile],
            [tsFile, tsFile],
            [jsonFile, jsonFile],
            [shFile, shFile]
        ]);

        const stashId = await manager.create(files, { reason: 'manual' });

        await fs.writeFile(mdFile, 'Modified', 'utf-8');
        await fs.writeFile(tsFile, 'Modified', 'utf-8');
        await fs.writeFile(jsonFile, '{}', 'utf-8');
        await fs.writeFile(shFile, 'Modified', 'utf-8');

        await manager.apply(stashId);

        const mdContent = await fs.readFile(mdFile, 'utf-8');
        const tsContent = await fs.readFile(tsFile, 'utf-8');
        const jsonContent = await fs.readFile(jsonFile, 'utf-8');
        const shContent = await fs.readFile(shFile, 'utf-8');

        expect(mdContent).toBe('# Markdown\n\nContent here');
        expect(tsContent).toBe('const x: number = 42;\nexport default x;');
        expect(jsonContent).toContain('"key": "value"');
        expect(shContent).toContain('#!/bin/bash');
    });

    test('preserves UTF-8 encoding and special characters', async () => {
        const file1 = path.join(sandbox.getPath()!, 'config', 'unicode.txt');
        const file2 = path.join(sandbox.getPath()!, 'config', 'emoji.md');

        const unicodeContent = '你好世界\nПривет мир\nمرحبا بالعالم';
        const emojiContent = '# Title 🚀\n\n✅ Item 1\n❌ Item 2\n💡 Idea';

        await fs.writeFile(file1, unicodeContent, 'utf-8');
        await fs.writeFile(file2, emojiContent, 'utf-8');

        const files = new Map([
            [file1, file1],
            [file2, file2]
        ]);

        const stashId = await manager.create(files, { reason: 'manual' });

        await fs.writeFile(file1, 'Changed', 'utf-8');
        await fs.writeFile(file2, 'Changed', 'utf-8');

        await manager.apply(stashId);

        const content1 = await fs.readFile(file1, 'utf-8');
        const content2 = await fs.readFile(file2, 'utf-8');

        expect(content1).toBe(unicodeContent);
        expect(content2).toBe(emojiContent);
    });

    test('handles large files correctly', async () => {
        const largeFile = path.join(sandbox.getPath()!, 'config', 'large.md');

        const largeContent = '# Large File\n\n' + 'Lorem ipsum dolor sit amet.\n'.repeat(1000);

        await fs.writeFile(largeFile, largeContent, 'utf-8');

        const files = new Map([[largeFile, largeFile]]);
        const stashId = await manager.create(files, { reason: 'manual' });

        const metadata = await helpers.loadStashMetadata(stashId);
        expect(metadata.files[0].size).toBeGreaterThan(10000);

        await fs.writeFile(largeFile, 'Small', 'utf-8');
        await manager.apply(stashId);

        const restoredContent = await fs.readFile(largeFile, 'utf-8');
        expect(restoredContent).toBe(largeContent);
        expect(restoredContent.length).toBeGreaterThan(10000);
    });

    test('preserves file permissions for executables', async () => {
        const shFile = path.join(sandbox.getPath()!, 'config', 'script.sh');

        await fs.writeFile(shFile, '#!/bin/bash\necho "test"', 'utf-8');
        await fs.chmod(shFile, 0o755);

        const files = new Map([[shFile, shFile]]);
        const stashId = await manager.create(files, { reason: 'manual' });

        await fs.writeFile(shFile, 'Modified', 'utf-8');

        await manager.apply(stashId);

        const stats = await fs.stat(shFile);
        const mode = stats.mode & 0o777;

        expect(mode).toBe(0o755);
    });

    test('handles nested directory structures', async () => {
        const deep1 = path.join(sandbox.getPath()!, 'config', 'a', 'b', 'c', 'file1.md');
        const deep2 = path.join(sandbox.getPath()!, 'config', 'x', 'y', 'z', 'file2.json');

        await fs.mkdir(path.dirname(deep1), { recursive: true });
        await fs.mkdir(path.dirname(deep2), { recursive: true });

        await fs.writeFile(deep1, 'Deep file 1', 'utf-8');
        await fs.writeFile(deep2, '{"deep": true}', 'utf-8');

        const files = new Map([
            [deep1, deep1],
            [deep2, deep2]
        ]);

        const stashId = await manager.create(files, { reason: 'manual' });

        await fs.rm(path.join(sandbox.getPath()!, 'config', 'a'), { recursive: true });
        await fs.rm(path.join(sandbox.getPath()!, 'config', 'x'), { recursive: true });

        await manager.apply(stashId);

        await helpers.assertFileExists(deep1);
        await helpers.assertFileExists(deep2);

        const content1 = await fs.readFile(deep1, 'utf-8');
        const content2 = await fs.readFile(deep2, 'utf-8');

        expect(content1).toBe('Deep file 1');
        expect(content2).toContain('"deep": true');
    });
});

