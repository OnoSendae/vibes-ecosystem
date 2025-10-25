import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import { installFromGitHub, type VibeManifest } from '../installers/github-installer.js';
import { installFromNpm } from '../installers/npm-installer.js';
import { createSymlink, getVibesHome, getVibePackageDir } from '../utils/symlink-manager.js';
import { AdapterRegistry, AgentDetector, type VibePackage, type TargetPaths } from '../adapters/index.js';
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

function detectSource(source: string): 'github' | 'npm' | 'local' {
    if (source.startsWith('github:') || source.includes('github.com')) {
        return 'github';
    }

    if (source.startsWith('./') || source.startsWith('/') || source.startsWith('~')) {
        return 'local';
    }

    return 'npm';
}

async function ensureVibesDir(): Promise<void> {
    const vibesHome = getVibesHome();

    if (!existsSync(vibesHome)) {
        await fs.mkdir(vibesHome, { recursive: true });
        await fs.mkdir(path.join(vibesHome, 'packages'), { recursive: true });
        await fs.mkdir(path.join(vibesHome, 'cache'), { recursive: true });
        await fs.mkdir(path.join(vibesHome, 'logs'), { recursive: true });
    }
}

async function loadGlobalManifest(): Promise<GlobalManifest> {
    const manifestPath = path.join(getVibesHome(), 'vibes.json');

    if (!existsSync(manifestPath)) {
        const defaultManifest: GlobalManifest = {
            version: '1.0',
            installedVibes: {},
            projects: {}
        };

        await fs.writeFile(manifestPath, JSON.stringify(defaultManifest, null, 2));
        return defaultManifest;
    }

    const content = await fs.readFile(manifestPath, 'utf-8');
    return JSON.parse(content) as GlobalManifest;
}

async function saveGlobalManifest(manifest: GlobalManifest): Promise<void> {
    const manifestPath = path.join(getVibesHome(), 'vibes.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

async function createVibeSymlinks(
    vibeName: string,
    vibeVersion: string,
    vibeManifest: VibeManifest,
    projectRoot: string,
    options: { dryRun?: boolean } = {}
): Promise<Record<string, string>> {
    const vibeDir = getVibePackageDir(vibeName, vibeVersion);
    const symlinksCreated: Record<string, string> = {};

    if (!vibeManifest.symlinks) {
        return symlinksCreated;
    }

    const detector = new ConflictDetector();
    const conflicts = await detector.detectAll(
        vibeManifest.symlinks,
        projectRoot,
        vibeDir
    );

    let shouldForceOverwrite = false;

    if (conflicts.length > 0 && !options.dryRun) {
        const resolver = new ConflictResolver();
        const resolution = await resolver.prompt(conflicts);

        if (resolution === 'cancel') {
            throw new Error('Installation cancelled by user');
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
                reason: 'install',
                package: `${vibeName}@${vibeVersion}`,
                version_new: vibeVersion
            });

            console.log('');
            console.log(chalk.green(`✓ Stash created: stash{${stashId}}`));
            console.log(chalk.gray(`  To restore: npx vibe-devtools stash apply ${stashId}`));
            console.log('');
            shouldForceOverwrite = true;
        }
    }

    if (options.dryRun) {
        console.log(chalk.blue('🔍 Dry Run - No changes will be made\n'));
        console.log(chalk.bold('Conflicts detected:'), conflicts.length);
        for (const conflict of conflicts) {
            console.log(`  - ${conflict.destPath}`);
        }
        console.log('');
        return symlinksCreated;
    }

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

            symlinksCreated[destPath] = sourcePath;
        } catch (error) {
            console.warn(chalk.yellow(`Warning: Failed to create symlink: ${(error as Error).message}`));
        }
    }

    return symlinksCreated;
}

export async function installCommand(
    source: string,
    options: { conflict?: string; agent?: string; dryRun?: boolean } = {}
): Promise<void> {
    const projectRoot = path.resolve(process.cwd());

    if (isCriticalSystemDirectory(projectRoot)) {
        console.error(chalk.red(`❌ Cannot install in critical system directory: ${projectRoot}`));
        console.error(chalk.yellow('Please run from a safe project directory.'));
        throw new Error(`Installation blocked: critical system directory`);
    }

    const spinner = ora('Installing vibe...').start();

    try {
        await ensureVibesDir();

        const sourceType = detectSource(source);

        spinner.text = 'Downloading vibe...';

        let manifest: VibeManifest;
        let installedPath: string;

        if (sourceType === 'github') {
            const result = await installFromGitHub(source);
            manifest = result.manifest;
            installedPath = result.installedPath;
        } else if (sourceType === 'npm') {
            const result = await installFromNpm(source);
            manifest = result.manifest;
            installedPath = result.installedPath;
        } else {
            const absolutePath = path.resolve(source);
            const vibeJsonPath = path.join(absolutePath, 'vibe.json');

            if (!existsSync(vibeJsonPath)) {
                throw new Error('vibe.json not found in directory');
            }

            const vibeJsonContent = await fs.readFile(vibeJsonPath, 'utf-8');
            manifest = JSON.parse(vibeJsonContent) as VibeManifest;

            installedPath = getVibePackageDir(manifest.name, manifest.version);

            await fs.mkdir(installedPath, { recursive: true });
            await fs.cp(absolutePath, installedPath, { recursive: true });
        }

        spinner.text = 'Detecting agents...';

        const adapters = AdapterRegistry.getAllAdapters();
        const detector = new AgentDetector(adapters);
        let detectedAgents = await detector.detectAll();

        if (detectedAgents.length === 0) {
            spinner.warn(chalk.yellow('No agents detected, using Cursor as fallback'));
            const cursorAdapter = AdapterRegistry.getAdapter('cursor');
            if (cursorAdapter) {
                detectedAgents = [{
                    name: 'cursor',
                    adapter: cursorAdapter,
                    paths: cursorAdapter.getTargetPaths()
                }];
            }
        }

        if (options.agent) {
            const requestedAgents = options.agent.split(',').map(a => a.trim());
            detectedAgents = detectedAgents.filter(a => requestedAgents.includes(a.name));

            if (detectedAgents.length === 0) {
                throw new Error(`Requested agents (${options.agent}) are not installed`);
            }
        }

        spinner.text = 'Installing for agents...';

        const vibePackage: VibePackage = {
            name: manifest.name,
            version: manifest.version,
            path: installedPath,
            agentTargets: manifest.agentTargets as Record<string, TargetPaths> | undefined,
            symlinks: manifest.symlinks
        };

        const installedForAgents: string[] = [];

        for (const agent of detectedAgents) {
            try {
                await agent.adapter.install(vibePackage, projectRoot);
                installedForAgents.push(agent.name);
            } catch (error) {
                console.warn(chalk.yellow(`Warning: Failed to install for ${agent.name}: ${(error as Error).message}`));
            }
        }

        const projectSymlinks = await createVibeSymlinks(
            manifest.name,
            manifest.version,
            manifest,
            projectRoot,
            { dryRun: options.dryRun }
        );

        spinner.text = 'Updating manifest...';

        const globalManifest = await loadGlobalManifest();

        globalManifest.installedVibes[manifest.name] = {
            version: manifest.version,
            source: source,
            installedAt: new Date().toISOString(),
            symlinks: projectSymlinks
        };

        if (!globalManifest.projects[projectRoot]) {
            globalManifest.projects[projectRoot] = {
                vibes: [],
                linkedAt: new Date().toISOString()
            };
        }

        if (!globalManifest.projects[projectRoot].vibes.includes(manifest.name)) {
            globalManifest.projects[projectRoot].vibes.push(manifest.name);
        }

        await saveGlobalManifest(globalManifest);

        spinner.succeed(chalk.green('Vibe installed successfully!'));

        console.log('');
        console.log(chalk.bold('📦 Installed:'), chalk.cyan(`${manifest.name}@${manifest.version}`));
        console.log(chalk.bold('📂 Location:'), installedPath);
        console.log(chalk.bold('🤖 Agents:'), chalk.green(installedForAgents.join(', ')));
        console.log(chalk.bold('🔗 Symlinks:'), Object.keys(projectSymlinks).length);
        console.log('');
        console.log(chalk.gray('Run'), chalk.cyan(`vdt agents detect`), chalk.gray('to see all detected agents'));

    } catch (error) {
        spinner.fail(chalk.red(`Installation failed: ${(error as Error).message}`));
        throw error;
    }
}

