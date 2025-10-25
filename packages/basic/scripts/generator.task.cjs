#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const PRIORITY_FOLDERS = {
    'P0': 'p0-bloqueador',
    'P1': 'p1-critico',
    'P2': 'p2-alto',
    'P3': 'p3-medio',
    'P4': 'p4-baixo'
};

function readStdin() {
    return new Promise((resolve, reject) => {
        let data = '';
        process.stdin.setEncoding('utf8');

        process.stdin.on('data', chunk => {
            data += chunk;
        });

        process.stdin.on('end', () => {
            try {
                resolve(JSON.parse(data));
            } catch (e) {
                reject(new Error(`Failed to parse JSON: ${e.message}`));
            }
        });

        process.stdin.on('error', reject);
    });
}

function loadTemplate() {
    const installedPath = path.join(__dirname, '..', 'templates', 'template.task.md');
    const devPath = path.join(__dirname, '..', 'structure', 'templates', 'template.task.md');

    const templatePath = fs.existsSync(installedPath) ? installedPath : devPath;

    if (!fs.existsSync(templatePath)) {
        throw new Error(`Template not found. Tried:\n  - ${installedPath}\n  - ${devPath}`);
    }

    return fs.readFileSync(templatePath, 'utf8');
}

function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 50);
}

function populateTemplate(template, task, metadata) {
    const taskNum = String(task.number).padStart(3, '0');
    const taskId = `${metadata.featureId}-${taskNum}`;
    const categorySlug = slugify(task.category);
    const titleSlug = slugify(task.title);

    const replacements = {
        '{{TASK_ID}}': taskId,
        '{{FEATURE_ID}}': metadata.featureId,
        '{{FEATURE_NAME}}': metadata.featureName,
        '{{TITLE}}': task.title,
        '{{PRIORITY}}': task.priority,
        '{{CATEGORY}}': task.category,
        '{{PHASE}}': task.phase,
        '{{ESTIMATED_TIME}}': task.estimatedTime,
        '{{CREATED_AT}}': metadata.timestamp,
        '{{UPDATED_AT}}': metadata.timestamp,
        '{{SOURCE_PLAN}}': metadata.sourcePlan,
        '{{SOURCE_TYPE}}': metadata.sourceType,
        '{{PLAN_OBJECTIVE}}': metadata.planObjective,
        '{{CONTEXT_DESCRIPTION}}': task.contextDescription || 'N/A',
        '{{FULL_DESCRIPTION}}': task.description,
        '{{FILE_LIST}}': formatList(task.affectedFiles),
        '{{DEPENDS_ON_LIST}}': formatList(task.dependsOn),
        '{{BLOCKS_LIST}}': formatList(task.blocks),
        '{{IMPLEMENTATION_STEPS}}': task.implementationSteps,
        '{{IMPLEMENTATION_CHECKLIST}}': task.implementationChecklist,
        '{{VALIDATION}}': task.validation,
        '{{NOTES}}': task.notes || 'N/A'
    };

    let content = template;
    for (const [placeholder, value] of Object.entries(replacements)) {
        content = content.replace(new RegExp(placeholder, 'g'), value);
    }

    return {
        content,
        filename: `task-${taskId}-${categorySlug}-${titleSlug}.md`,
        taskNum,
        categorySlug
    };
}

function formatList(items) {
    if (!items || items.length === 0) return 'N/A';

    if (Array.isArray(items)) {
        return items.map(item => `- ${item}`).join('\n');
    }

    return items;
}

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function generateTasks(data) {
    const { metadata, tasks } = data;
    const template = loadTemplate();

    const tasksDir = path.join(process.cwd(), 'vibes', 'tasks', metadata.featureId);
    ensureDir(tasksDir);

    const created = [];
    const errors = [];
    const byPriority = {};
    const byCategory = {};

    for (const task of tasks) {
        try {
            const priorityFolder = PRIORITY_FOLDERS[task.priority];
            if (!priorityFolder) {
                throw new Error(`Invalid priority: ${task.priority}`);
            }

            const priorityDir = path.join(tasksDir, priorityFolder);
            ensureDir(priorityDir);

            const { content, filename } = populateTemplate(template, task, metadata);

            const filePath = path.join(priorityDir, filename);
            fs.writeFileSync(filePath, content, 'utf8');

            created.push({
                taskId: `${metadata.featureId}-${String(task.number).padStart(3, '0')}`,
                file: path.relative(process.cwd(), filePath),
                priority: task.priority,
                category: task.category
            });

            byPriority[task.priority] = (byPriority[task.priority] || 0) + 1;
            byCategory[task.category] = (byCategory[task.category] || 0) + 1;

        } catch (error) {
            errors.push({
                task: task.number,
                error: error.message
            });
        }
    }

    return {
        created,
        errors,
        summary: {
            total: created.length,
            byPriority,
            byCategory
        }
    };
}

async function main() {
    try {
        const data = await readStdin();

        if (!data.metadata || !data.tasks) {
            throw new Error('Invalid input: missing metadata or tasks');
        }

        const result = generateTasks(data);

        console.log(JSON.stringify(result, null, 2));

        process.exit(result.errors.length > 0 ? 1 : 0);

    } catch (error) {
        console.error(JSON.stringify({
            error: error.message,
            stack: error.stack
        }, null, 2));
        process.exit(1);
    }
}

main();
