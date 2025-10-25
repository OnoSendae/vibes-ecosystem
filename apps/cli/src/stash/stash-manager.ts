import fs from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { StashIndex, StashMetadata, ApplyOptions, DiffResult, StashFile } from './types.js';
import { HashCalculator } from './hash-calculator.js';
import { StashLogger } from './logger.js';

export class StashManager {
    private readonly stashDir: string;
    private readonly indexPath: string;
    private readonly hashCalculator: HashCalculator;
    private readonly logger: StashLogger;

    constructor(stashDir?: string) {
        this.stashDir = stashDir ?? path.join(os.homedir(), '.vibes', 'stash');
        this.indexPath = path.join(this.stashDir, 'index.json');
        this.hashCalculator = new HashCalculator();
        this.logger = new StashLogger();
    }

    async loadIndex(): Promise<StashIndex> {
        if (!existsSync(this.indexPath)) {
            await this.ensureStashDir();
            const defaultIndex: StashIndex = {
                stashes: [],
                next_id: 0
            };
            await this.saveIndex(defaultIndex);
            return defaultIndex;
        }

        const content = await fs.readFile(this.indexPath, 'utf-8');
        return JSON.parse(content) as StashIndex;
    }

    async saveIndex(index: StashIndex): Promise<void> {
        await this.ensureStashDir();
        await fs.writeFile(
            this.indexPath,
            JSON.stringify(index, null, 2),
            'utf-8'
        );
    }

    private async ensureStashDir(): Promise<void> {
        if (!existsSync(this.stashDir)) {
            await fs.mkdir(this.stashDir, { recursive: true });
        }
    }

    /**
     * Creates a new stash with the provided files
     * 
     * @param files - Map of source file paths to stash (key and value are same path)
     * @param metadata - Partial metadata for the stash (reason, package, version_old, version_new)
     * @returns The stash ID (incrementing number starting from 0)
     * 
     * @remarks
     * This method COPIES files to the stash directory but does NOT delete the original files.
     * Deletion of original files is the responsibility of the caller.
     * 
     * Typically, callers (install.ts, update.ts) use createSymlink() with force: true to 
     * overwrite local files after stashing. This separation of concerns allows:
     * - StashManager to focus on backup/restore logic
     * - Caller to control when and how files are replaced
     * - Manual stash operations (stash save) to preserve original files
     * 
     * @example
     * const filesToStash = new Map([
     *   ['vibes/configs/constitution.md', 'vibes/configs/constitution.md']
     * ]);
     * const stashId = await stashManager.create(filesToStash, {
     *   reason: 'install',
     *   package: '@vibe-devtools/basic@1.0.0'
     * });
     * // Files are copied to ~/.vibes/stash/stash-N/ but originals remain
     * // Caller then uses createSymlink({ force: true }) to replace originals
     */
    async create(
        files: Map<string, string>,
        metadata: Partial<StashMetadata>
    ): Promise<number> {
        const index = await this.loadIndex();
        const stashId = index.next_id;
        const stashPath = path.join(this.stashDir, `stash-${stashId}`);
        const filesPath = path.join(stashPath, 'files');

        await fs.mkdir(filesPath, { recursive: true });

        const stashFiles: StashFile[] = [];

        for (const [sourcePath] of files.entries()) {
            if (!existsSync(sourcePath)) {
                continue;
            }

            const stats = statSync(sourcePath);
            const relativePath = path.basename(sourcePath);
            const targetPath = path.join(filesPath, relativePath);

            if (stats.isDirectory()) {
                await fs.cp(sourcePath, targetPath, { recursive: true });
                const dirHashes = await this.hashCalculator.calculateDirectory(sourcePath);
                for (const [relPath, hash] of dirHashes.entries()) {
                    const fileStats = statSync(path.join(sourcePath, relPath));
                    stashFiles.push({
                        path: path.join(sourcePath, relPath),
                        hash,
                        size: fileStats.size,
                        relativePath: path.join(relativePath, relPath)
                    });
                }
            } else {
                await fs.cp(sourcePath, targetPath);
                const hash = await this.hashCalculator.calculateFile(sourcePath);
                stashFiles.push({
                    path: sourcePath,
                    hash,
                    size: stats.size,
                    relativePath
                });
            }
        }

        const stashMetadata: StashMetadata = {
            stash_id: stashId,
            timestamp: new Date().toISOString(),
            reason: metadata.reason || 'manual',
            package: metadata.package,
            version_old: metadata.version_old,
            version_new: metadata.version_new,
            files: stashFiles
        };

        await fs.writeFile(
            path.join(stashPath, 'metadata.json'),
            JSON.stringify(stashMetadata, null, 2),
            'utf-8'
        );

        index.stashes.push(stashMetadata);
        index.next_id += 1;
        await this.saveIndex(index);

        await this.logger.log({
            timestamp: stashMetadata.timestamp,
            operation: 'create',
            stash_id: stashId,
            package: metadata.package,
            files_count: stashFiles.length,
            success: true
        });

        return stashId;
    }

    async list(): Promise<StashMetadata[]> {
        const index = await this.loadIndex();
        return index.stashes;
    }

    async show(stashId: number): Promise<StashMetadata> {
        const index = await this.loadIndex();
        const stash = index.stashes.find(s => s.stash_id === stashId);
        if (!stash) {
            throw new Error(`Stash ${stashId} not found`);
        }
        return stash;
    }

    async apply(stashId: number, _options?: ApplyOptions): Promise<void> {
        const metadata = await this.show(stashId);
        const stashPath = path.join(this.stashDir, `stash-${stashId}`);
        const filesPath = path.join(stashPath, 'files');

        if (!existsSync(filesPath)) {
            throw new Error(`Stash ${stashId} is corrupted or missing`);
        }

        for (const file of metadata.files) {
            const stashFilePath = path.join(filesPath, file.relativePath);

            if (!existsSync(stashFilePath)) {
                throw new Error(`Stash file missing: ${file.relativePath}`);
            }

            const currentHash = await this.hashCalculator.calculateFile(stashFilePath);
            if (currentHash !== file.hash) {
                throw new Error(`Stash ${stashId} is corrupted (hash mismatch for ${file.relativePath})`);
            }

            const targetPath = file.path;
            const targetDir = path.dirname(targetPath);

            await fs.mkdir(targetDir, { recursive: true });
            await fs.cp(stashFilePath, targetPath, { recursive: false });
        }

        await this.logger.log({
            timestamp: new Date().toISOString(),
            operation: 'apply',
            stash_id: stashId,
            package: metadata.package,
            files_count: metadata.files.length,
            success: true
        });
    }

    async pop(stashId: number): Promise<void> {
        await this.apply(stashId);
        await this.remove(stashId);

        await this.logger.log({
            timestamp: new Date().toISOString(),
            operation: 'pop',
            stash_id: stashId,
            files_count: 0,
            success: true
        });
    }

    async remove(stashId: number): Promise<void> {
        const index = await this.loadIndex();
        const stashIndex = index.stashes.findIndex(s => s.stash_id === stashId);

        if (stashIndex === -1) {
            throw new Error(`Stash ${stashId} not found`);
        }

        const stashPath = path.join(this.stashDir, `stash-${stashId}`);

        if (existsSync(stashPath)) {
            await fs.rm(stashPath, { recursive: true });
        }

        index.stashes.splice(stashIndex, 1);
        await this.reorderStashes(index);
        await this.saveIndex(index);

        await this.logger.log({
            timestamp: new Date().toISOString(),
            operation: 'remove',
            stash_id: stashId,
            files_count: 0,
            success: true
        });
    }

    async clear(confirm: boolean): Promise<void> {
        if (!confirm) {
            throw new Error('Clear operation requires confirmation');
        }

        const index = await this.loadIndex();
        const stashCount = index.stashes.length;

        for (const stash of index.stashes) {
            const stashPath = path.join(this.stashDir, `stash-${stash.stash_id}`);
            if (existsSync(stashPath)) {
                await fs.rm(stashPath, { recursive: true });
            }
        }

        index.stashes = [];
        index.next_id = 0;
        await this.saveIndex(index);

        await this.logger.log({
            timestamp: new Date().toISOString(),
            operation: 'clear',
            files_count: stashCount,
            success: true
        });
    }

    async diff(stashId: number): Promise<DiffResult[]> {
        const metadata = await this.show(stashId);
        const results: DiffResult[] = [];

        for (const file of metadata.files) {
            if (!existsSync(file.path)) {
                results.push({
                    file: file.path,
                    status: 'added'
                });
            } else {
                const currentHash = await this.hashCalculator.calculateFile(file.path);
                if (currentHash !== file.hash) {
                    results.push({
                        file: file.path,
                        status: 'modified'
                    });
                }
            }
        }

        return results;
    }


    private async reorderStashes(index: StashIndex): Promise<void> {
        for (let i = 0; i < index.stashes.length; i++) {
            const stash = index.stashes[i];
            const oldStashPath = path.join(this.stashDir, `stash-${stash.stash_id}`);
            const newStashPath = path.join(this.stashDir, `stash-${i}`);

            if (stash.stash_id !== i && existsSync(oldStashPath)) {
                await fs.rename(oldStashPath, newStashPath);

                const metadataPath = path.join(newStashPath, 'metadata.json');
                if (existsSync(metadataPath)) {
                    const metadata = JSON.parse(
                        await fs.readFile(metadataPath, 'utf-8')
                    ) as StashMetadata;
                    metadata.stash_id = i;
                    await fs.writeFile(
                        metadataPath,
                        JSON.stringify(metadata, null, 2),
                        'utf-8'
                    );
                }
            }

            stash.stash_id = i;
        }
    }
}

