import fs from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import type { StashIndex, StashMetadata } from '../../src/stash/types.js';
import { HashCalculator } from '../../src/stash/hash-calculator.js';

export class StashTestHelpers {
    private readonly vibesHome: string;
    private readonly hashCalculator: HashCalculator;

    constructor(sandboxPath?: string) {
        this.vibesHome = sandboxPath
            ? path.join(sandboxPath, '.vibes')
            : path.join(process.env.VIBES_HOME || path.join(process.env.HOME || '', '.vibes'));
        this.hashCalculator = new HashCalculator();
    }

    async loadStashIndex(): Promise<StashIndex> {
        const indexPath = path.join(this.vibesHome, 'stash', 'index.json');

        if (!existsSync(indexPath)) {
            throw new Error(`Stash index not found at ${indexPath}`);
        }

        const content = await fs.readFile(indexPath, 'utf-8');
        return JSON.parse(content) as StashIndex;
    }

    async loadStashMetadata(stashId: number): Promise<StashMetadata> {
        const metadataPath = path.join(
            this.vibesHome,
            'stash',
            `stash-${stashId}`,
            'metadata.json'
        );

        if (!existsSync(metadataPath)) {
            throw new Error(`Stash metadata not found for stash{${stashId}}`);
        }

        const content = await fs.readFile(metadataPath, 'utf-8');
        return JSON.parse(content) as StashMetadata;
    }

    async assertStashExists(stashId: number): Promise<void> {
        const stashPath = path.join(this.vibesHome, 'stash', `stash-${stashId}`);

        if (!existsSync(stashPath)) {
            throw new Error(`Expected stash{${stashId}} to exist at ${stashPath}`);
        }

        const metadataPath = path.join(stashPath, 'metadata.json');
        if (!existsSync(metadataPath)) {
            throw new Error(`Expected metadata.json to exist for stash{${stashId}}`);
        }

        const filesPath = path.join(stashPath, 'files');
        if (!existsSync(filesPath)) {
            throw new Error(`Expected files/ directory to exist for stash{${stashId}}`);
        }
    }

    async assertStashNotExists(stashId: number): Promise<void> {
        const stashPath = path.join(this.vibesHome, 'stash', `stash-${stashId}`);

        if (existsSync(stashPath)) {
            throw new Error(`Expected stash{${stashId}} NOT to exist at ${stashPath}`);
        }
    }

    async assertStashCount(expectedCount: number): Promise<void> {
        const index = await this.loadStashIndex();

        if (index.stashes.length !== expectedCount) {
            throw new Error(
                `Expected ${expectedCount} stashes, found ${index.stashes.length}`
            );
        }
    }

    async assertFileInStash(stashId: number, filePath: string): Promise<void> {
        const metadata = await this.loadStashMetadata(stashId);

        const fileExists = metadata.files.some(f => f.path === filePath);

        if (!fileExists) {
            throw new Error(
                `Expected file ${filePath} in stash{${stashId}}, found: ${metadata.files.map(f => f.path).join(', ')}`
            );
        }

        const fileName = path.basename(filePath);
        const stashFilePath = path.join(
            this.vibesHome,
            'stash',
            `stash-${stashId}`,
            'files',
            fileName
        );

        if (!existsSync(stashFilePath)) {
            throw new Error(
                `Expected physical file ${fileName} in stash{${stashId}} at ${stashFilePath}`
            );
        }
    }

    async assertHashMatch(filePath: string, expectedHash: string): Promise<void> {
        if (!existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const actualHash = await this.hashCalculator.calculateFile(filePath);

        if (actualHash !== expectedHash) {
            throw new Error(
                `Hash mismatch for ${filePath}\n` +
                `Expected: ${expectedHash}\n` +
                `Actual:   ${actualHash}`
            );
        }
    }

    async assertStashMetadata(
        stashId: number,
        expected: Partial<StashMetadata>
    ): Promise<void> {
        const metadata = await this.loadStashMetadata(stashId);

        if (expected.reason && metadata.reason !== expected.reason) {
            throw new Error(
                `Expected reason "${expected.reason}", got "${metadata.reason}"`
            );
        }

        if (expected.package && metadata.package !== expected.package) {
            throw new Error(
                `Expected package "${expected.package}", got "${metadata.package}"`
            );
        }

        if (expected.version_old && metadata.version_old !== expected.version_old) {
            throw new Error(
                `Expected version_old "${expected.version_old}", got "${metadata.version_old}"`
            );
        }

        if (expected.version_new && metadata.version_new !== expected.version_new) {
            throw new Error(
                `Expected version_new "${expected.version_new}", got "${metadata.version_new}"`
            );
        }

        if (expected.files && metadata.files.length !== expected.files.length) {
            throw new Error(
                `Expected ${expected.files.length} files, got ${metadata.files.length}`
            );
        }
    }

    async assertFileExists(filePath: string): Promise<void> {
        if (!existsSync(filePath)) {
            throw new Error(`Expected file to exist: ${filePath}`);
        }
    }

    async assertFileNotExists(filePath: string): Promise<void> {
        if (existsSync(filePath)) {
            throw new Error(`Expected file NOT to exist: ${filePath}`);
        }
    }

    async assertFileContains(filePath: string, expectedContent: string): Promise<void> {
        if (!existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const content = await fs.readFile(filePath, 'utf-8');

        if (!content.includes(expectedContent)) {
            throw new Error(
                `Expected file ${filePath} to contain "${expectedContent}"\n` +
                `Actual content:\n${content}`
            );
        }
    }

    async assertIndexProperty(property: keyof StashIndex, expected: any): Promise<void> {
        const index = await this.loadStashIndex();

        if (index[property] !== expected) {
            throw new Error(
                `Expected index.${property} to be ${expected}, got ${index[property]}`
            );
        }
    }

    async getStashFilePath(stashId: number, fileName: string): Promise<string> {
        return path.join(
            this.vibesHome,
            'stash',
            `stash-${stashId}`,
            'files',
            fileName
        );
    }

    async corruptStashFile(stashId: number, fileName: string): Promise<void> {
        const filePath = await this.getStashFilePath(stashId, fileName);
        await fs.writeFile(filePath, 'CORRUPTED CONTENT', 'utf-8');
    }

    async getStashDirectory(stashId: number): Promise<string> {
        return path.join(this.vibesHome, 'stash', `stash-${stashId}`);
    }

    async removeStashPermissions(stashId: number): Promise<void> {
        const stashDir = await this.getStashDirectory(stashId);

        if (existsSync(stashDir)) {
            await fs.chmod(stashDir, 0o000);
        }
    }

    async restoreStashPermissions(stashId: number): Promise<void> {
        const stashDir = await this.getStashDirectory(stashId);

        if (existsSync(stashDir)) {
            await fs.chmod(stashDir, 0o755);
        }
    }

    async getVibesHome(): Promise<string> {
        return this.vibesHome;
    }

    async assertStashOrdering(expectedOrdering: number[]): Promise<void> {
        const index = await this.loadStashIndex();
        const actualOrdering = index.stashes.map(s => s.stash_id);

        if (actualOrdering.length !== expectedOrdering.length) {
            throw new Error(
                `Expected ${expectedOrdering.length} stashes, got ${actualOrdering.length}`
            );
        }

        for (let i = 0; i < expectedOrdering.length; i++) {
            if (actualOrdering[i] !== expectedOrdering[i]) {
                throw new Error(
                    `Expected stash ordering ${expectedOrdering.join(', ')}\n` +
                    `Actual ordering: ${actualOrdering.join(', ')}`
                );
            }
        }
    }
}

