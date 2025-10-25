import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import { installFromNpm } from '../installers/npm-installer.js';
import { installFromGitHub, type VibeManifest } from '../installers/github-installer.js';
import { createSymlink, getVibesHome, getVibePackageDir } from '../utils/symlink-manager.js';
import { ConflictDetector } from '../stash/conflict-detector.js';
import { ConflictResolver } from '../stash/conflict-resolver.js';
import { StashManager } from '../stash/stash-manager.js';
import { isCriticalSystemDirectory } from '../utils/safe-paths.js';

interface GlobalManifest {
    version: string;
    installedVibes: Record<string, {
        version: string;
        source: string;
        installedAt: string;
        symlinks: Record<string, string>;
    }>;
    projects: Record<string, {
        vibes: string[];
        linkedAt: string;
    }>;
}

async function loadGlobalManifest(): Promise<GlobalManifest | null> {
    const manifestPath = path.join(getVibesHome(), 'vibes.json');

    if (!existsSync(manifestPath)) {
        return null;
    }

    const content = await fs.readFile(manifestPath, 'utf-8');
    return JSON.parse(content) as GlobalManifest;
}

async function saveGlobalManifest(manifest: GlobalManifest): Promise<void> {
    const manifestPath = path.join(getVibesHome(), 'vibes.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

function detectCurrentVersion(_packageName: string, manifest: GlobalManifest, pkgName: string): string | null {
    const installed = manifest.installedVibes[pkgName];
    return installed ? installed.version : null;
}

async function determineNewVersion(
    _packageName: string,
    options: { version?: string; latest?: boolean }
): Promise<string> {
    if (options.version) {
        return options.version;
    }

    if (options.latest) {
        return 'latest';
    }

    throw new Error('Must specify --version <version> or --latest');
}

export async function updateCommand(
    packageName: string,
    options: {
        version?: string;
        latest?: boolean;
        dryRun?: boolean;
    } = {}
): Promise<void> {
    const projectRoot = path.resolve(process.cwd());

    if (isCriticalSystemDirectory(projectRoot)) {
        console.error(chalk.red(`❌ Cannot update in critical system directory: ${projectRoot}`));
        console.error(chalk.yellow('Please run from a safe project directory.'));
        throw new Error(`Update blocked: critical system directory`);
    }

    const spinner = ora('Updating vibe...').start();

    try {
        const manifest = await loadGlobalManifest();
        if (!manifest) {
            throw new Error('No vibes installed. Run install first.');
        }

        const currentVersion = detectCurrentVersion(packageName, manifest, packageName);
        if (!currentVersion) {
            throw new Error(`Package ${packageName} is not installed`);
        }

        spinner.text = 'Determining new version...';
        const newVersion = await determineNewVersion(packageName, options);

        spinner.text = `Downloading ${packageName}@${newVersion}...`;

        const source = `${packageName}@${newVersion}`;
        let vibeManifest: VibeManifest;

        if (packageName.includes('github.com') || packageName.startsWith('github:')) {
            const result = await installFromGitHub(source);
            vibeManifest = result.manifest;
        } else {
            const result = await installFromNpm(source);
            vibeManifest = result.manifest;
        }

        const vibeDir = getVibePackageDir(vibeManifest.name, vibeManifest.version);

        if (!vibeManifest.symlinks) {
            spinner.succeed(chalk.green('No files to update'));
            return;
        }

        spinner.text = 'Detecting conflicts...';

        const detector = new ConflictDetector();
        const conflicts = await detector.detectAll(
            vibeManifest.symlinks,
            projectRoot,
            vibeDir
        );

        if (options.dryRun) {
            spinner.info(chalk.blue('Dry Run - No changes will be made'));
            console.log('');
            console.log(chalk.bold('Update:'), `${currentVersion} → ${vibeManifest.version}`);
            console.log(chalk.bold('Conflicts:'), conflicts.length);

            for (const conflict of conflicts) {
                console.log(chalk.gray('  -'), conflict.destPath);
            }

            console.log('');
            return;
        }

        let shouldForceOverwrite = false;

        if (conflicts.length > 0) {
            spinner.stop();

            const resolver = new ConflictResolver();
            const resolution = await resolver.prompt(conflicts);

            if (resolution === 'cancel') {
                throw new Error('Update cancelled by user');
            }

            if (resolution === 'overwrite') {
                console.log('');
                console.log(chalk.yellow('⚠️  Overwriting files without backup...'));
                console.log('');
                shouldForceOverwrite = true;
            }

            if (resolution === 'stash-and-overwrite') {
                const stashManager = new StashManager();
                const filesToStash = new Map(
                    conflicts.map(c => [c.destPath, c.destPath])
                );

                const stashId = await stashManager.create(filesToStash, {
                    reason: 'update',
                    package: packageName,
                    version_old: currentVersion,
                    version_new: vibeManifest.version
                });

                console.log('');
                console.log(chalk.green(`✓ Stash created: stash{${stashId}}`));
                console.log(chalk.gray(`  Version: ${currentVersion} → ${vibeManifest.version}`));
                console.log(chalk.gray(`  To restore: npx vibe-devtools stash apply ${stashId}`));
                console.log('');
                shouldForceOverwrite = true;
            }

            spinner.start('Updating files...');
        }

        const projectSymlinks: Record<string, string> = {};

        for (const [destination, source] of Object.entries(vibeManifest.symlinks)) {
            const sourcePath = path.join(vibeDir, source);
            const destPath = path.join(projectRoot, destination);

            if (!existsSync(sourcePath)) {
                console.warn(chalk.yellow(`Warning: Source path does not exist: ${sourcePath}`));
                continue;
            }

            try {
                await createSymlink(sourcePath, destPath, {
                    force: shouldForceOverwrite,
                    type: 'dir',
                    fallbackCopy: true
                });

                projectSymlinks[destPath] = sourcePath;
            } catch (error) {
                console.warn(chalk.yellow(`Warning: Failed to create symlink: ${(error as Error).message}`));
            }
        }

        spinner.text = 'Updating manifest...';

        const globalManifest = await loadGlobalManifest();
        if (globalManifest) {
            globalManifest.installedVibes[packageName] = {
                version: vibeManifest.version,
                source: packageName,
                installedAt: new Date().toISOString(),
                symlinks: projectSymlinks
            };
            await saveGlobalManifest(globalManifest);
        }

        spinner.succeed(chalk.green('Vibe updated successfully!'));

        console.log('');
        console.log(chalk.bold('📦 Updated:'), chalk.cyan(`${packageName}`));
        console.log(chalk.bold('📈 Version:'), `${currentVersion} → ${vibeManifest.version}`);
        console.log(chalk.bold('📁 Conflicts:'), conflicts.length);
        console.log('');

    } catch (error) {
        spinner.fail(chalk.red(`Update failed: ${(error as Error).message}`));
        throw error;
    }
}


