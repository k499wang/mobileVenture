#!/usr/bin/env node

import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import path from 'node:path';

const foundationDirectory = path.resolve(import.meta.dirname, '..');
const excludedTopLevelDirectories = new Set(['.git', '.expo', 'node_modules', 'factory', 'ios']);
const excludedFiles = new Set(['.env', 'package-lock.json']);
const args = process.argv.slice(2);
const destinationArgument = args.find((arg) => !arg.startsWith('--'));

function flag(name) {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function identifierPart(value) {
  return value.replace(/[^a-zA-Z0-9]/g, '');
}

async function directoryIsEmpty(directory) {
  try {
    return (await readdir(directory)).length === 0;
  } catch {
    return true;
  }
}

async function replaceTokens(directory, tokens) {
  for (const entry of await readdir(directory)) {
    const absolutePath = path.join(directory, entry);
    const info = await stat(absolutePath);
    if (info.isDirectory()) {
      await replaceTokens(absolutePath, tokens);
      continue;
    }

    if (entry.endsWith('.png') || entry.endsWith('.jpg') || entry.endsWith('.ico')) continue;
    let content = await readFile(absolutePath, 'utf8');
    for (const [token, value] of Object.entries(tokens)) content = content.replaceAll(token, value);
    await writeFile(absolutePath, content);
  }
}

async function configureExpoProject(directory, values) {
  const configPath = path.join(directory, 'app.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.expo.name = values.name;
  config.expo.slug = values.slug;
  config.expo.scheme = values.scheme;
  config.expo.ios.bundleIdentifier = values.bundleId;
  for (const plugin of config.expo.plugins ?? []) {
    if (!Array.isArray(plugin)) continue;
    if (plugin[0] === 'expo-splash-screen') plugin[1] = { ...plugin[1], backgroundColor: values.brandColor };
    if (plugin[0] === 'expo-tracking-transparency') {
      plugin[1] = { ...plugin[1], userTrackingPermission: `Allow ${values.name} to measure which promotions lead to app installs and improve the experience.` };
    }
  }
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const packagePath = path.join(directory, 'package.json');
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
  packageJson.name = values.slug;
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

async function main() {
  const interactive = input.isTTY && !args.includes('--yes');
  const questions = interactive ? createInterface({ input, output }) : undefined;
  const ask = async (label, fallback) => {
    const answer = flag(label.toLowerCase().replaceAll(' ', '-'))
      ?? (questions ? await questions.question(`${label} (${fallback}): `) : '');
    return answer.trim() || fallback;
  };

  try {
    const name = await ask('Name', 'My App');
    const slug = slugify(await ask('Slug', slugify(name)));
    const defaultBundleId = `com.example.${identifierPart(slug) || 'myapp'}`;
    const bundleId = await ask('Bundle ID', defaultBundleId);
    const brandColor = await ask('Brand color', '#6C5CE7');
    const target = path.resolve(destinationArgument ?? slug);

    if (!slug) throw new Error('The app slug must include letters or numbers.');
    if (!/^#[0-9a-fA-F]{6}$/.test(brandColor)) throw new Error('Brand color must be a six-digit hex color, such as #6C5CE7.');
    if (!(await directoryIsEmpty(target))) throw new Error(`Destination is not empty: ${target}`);
    if (target.startsWith(`${foundationDirectory}${path.sep}`)) throw new Error('Create an app outside the factory repository so it cannot copy itself.');

    await mkdir(path.dirname(target), { recursive: true });
    await cp(foundationDirectory, target, {
      recursive: true,
      filter: (source) => {
        const relative = path.relative(foundationDirectory, source);
        if (!relative) return true;
        const topLevel = relative.split(path.sep)[0];
        return !excludedTopLevelDirectories.has(topLevel) && !excludedFiles.has(relative);
      },
    });
    await replaceTokens(target, {
      '__APP_NAME__': name,
      '__APP_SLUG__': slug,
      '__APP_SCHEME__': slug.replaceAll('-', ''),
      '__BUNDLE_ID__': bundleId,
      '__BRAND_COLOR__': brandColor.slice(1).toUpperCase(),
    });
    await configureExpoProject(target, { name, slug, bundleId, scheme: slug.replaceAll('-', ''), brandColor: brandColor.toUpperCase() });

    output.write(`\nCreated ${name} at ${target}\n\nNext:\n  cd ${path.relative(process.cwd(), target) || '.'}\n  npm install\n  npm run ios\n\nThen configure credentials in .env and follow README.md.\n`);
  } finally {
    questions?.close();
  }
}

main().catch((error) => {
  console.error(`\nCould not create app: ${error.message}`);
  process.exitCode = 1;
});
