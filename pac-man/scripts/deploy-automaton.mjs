import AdmZip from 'adm-zip';
import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

async function loadEnvFile(filePath) {
    try {
        const raw = await readFile(filePath, 'utf8');
        for (const line of raw.split(/\r?\n/u)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            const separatorIndex = trimmed.indexOf('=');
            if (separatorIndex === -1) {
                continue;
            }

            const key = trimmed.slice(0, separatorIndex).trim();
            const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/gu, '');

            if (key && !process.env[key]) {
                process.env[key] = value;
            }
        }
    } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
            return;
        }

        throw error;
    }
}

function getArg(flagName) {
    const flagIndex = process.argv.indexOf(flagName);
    if (flagIndex === -1) {
        return null;
    }

    return process.argv[flagIndex + 1] ?? null;
}

async function loadAutomatonConfig(projectRoot) {
    const configPath = join(projectRoot, 'automaton.json');
    const configRaw = await readFile(configPath, 'utf8');
    return JSON.parse(configRaw);
}

async function resolveBundlePath(projectRoot) {
    const requestedPath = getArg('--bundle') ?? getArg('--path') ?? 'dist';
    return resolve(projectRoot, requestedPath);
}

async function createZipFromDirectory(directoryPath) {
    const zip = new AdmZip();
    zip.addLocalFolder(directoryPath, '');

    const zipPath = join(tmpdir(), `automaton-deploy-${Date.now()}.zip`);
    await writeFile(zipPath, zip.toBuffer());
    return zipPath;
}

function resolveUploadUrl(server, appId) {
    const baseUrl = server.endsWith('/') ? server : `${server}/`;
    return new URL(`api/apps/${appId}/upload`, baseUrl).toString();
}

async function main() {
    const projectRoot = process.cwd();
    await loadEnvFile(join(projectRoot, '.env'));
    await loadEnvFile(join(projectRoot, '.env.local'));
    const config = await loadAutomatonConfig(projectRoot);

    const server = process.env.AUTOMATON_SERVER || config.server;
    const appId = process.env.AUTOMATON_APP_ID || config.appId;
    const apiKey = process.env.AUTOMATON_API_KEY;

    if (!server) {
        throw new Error('Automaton server is required. Set AUTOMATON_SERVER or provide it in automaton.json.');
    }

    if (!appId) {
        throw new Error('Automaton app id is required. Set AUTOMATON_APP_ID or provide it in automaton.json.');
    }

    if (!apiKey) {
        throw new Error('AUTOMATON_API_KEY is required for deployment.');
    }

    const bundlePath = await resolveBundlePath(projectRoot);
    const bundleStats = await stat(bundlePath);
    const shouldDeleteZip = bundleStats.isDirectory();
    const uploadPath = shouldDeleteZip ? await createZipFromDirectory(bundlePath) : bundlePath;

    if (!bundleStats.isDirectory() && extname(bundlePath).toLowerCase() !== '.zip') {
        throw new Error('Bundle path must point to a directory or a .zip file.');
    }

    try {
        const zipBuffer = await readFile(uploadPath);
        const formData = new FormData();
        formData.set('file', new Blob([zipBuffer], { type: 'application/zip' }), basename(uploadPath));

        const response = await fetch(resolveUploadUrl(server, appId), {
            method: 'POST',
            headers: {
                'X-API-Key': apiKey
            },
            body: formData
        });

        const bodyText = await response.text();
        const result = bodyText ? JSON.parse(bodyText) : {};

        if (!response.ok) {
            throw new Error(`Automaton upload failed with status ${response.status}: ${bodyText}`);
        }

        if (Array.isArray(result.errors) && result.errors.length) {
            throw new Error(`Automaton upload reported errors: ${JSON.stringify(result.errors)}`);
        }

        console.log(`Deploy target: ${server} -> ${appId}`);
        console.log(`Uploaded ${basename(uploadPath)} to app ${appId}.`);
        console.log(JSON.stringify(result, null, 2));
    } finally {
        if (shouldDeleteZip) {
            await rm(uploadPath, { force: true });
        }
    }
}

await main();