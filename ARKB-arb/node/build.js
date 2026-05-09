#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const distDir = path.join(rootDir, 'dist');

const filesToCopy = [
  ['README.md', 'README.md'],
  ['DEPLOYMENT.md', 'DEPLOYMENT.md'],
  ['analyze.js', 'analyze.js'],
  ['dashboard.js', 'dashboard.js'],
  ['monitor.js', 'monitor.js'],
  ['config.json', 'config.json'],
  ['package.json', 'package.json'],
  ['package-lock.json', 'package-lock.json'],
  ['staticwebapp.config.json', 'staticwebapp.config.json'],
  ['public/index.html', 'index.html'],
  ['public/index.html', 'public/index.html'],
  ['lib/utils.js', 'lib/utils.js'],
  ['lib/discord.js', 'lib/discord.js'],
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFile(fromRelativePath, toRelativePath) {
  const sourcePath = path.join(rootDir, fromRelativePath);
  const targetPath = path.join(distDir, toRelativePath);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing required build input: ${fromRelativePath}`);
  }

  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function cleanDist() {
  fs.rmSync(distDir, { recursive: true, force: true });
  ensureDir(distDir);
}

function writeEnvExample() {
  const envExample = [
    'DEPLOYMENT_TOKEN=your_static_web_apps_deployment_token',
    'DISCORD_TOKEN=your_discord_bot_token_here',
    'DISCORD_USER_ID=your_discord_user_id_here',
    'DISCORD_GUILD_ID=your_discord_guild_id_here',
    '',
  ].join('\n');

  fs.writeFileSync(path.join(distDir, '.env.example'), envExample);
}

function main() {
  cleanDist();

  for (const [fromRelativePath, toRelativePath] of filesToCopy) {
    copyFile(fromRelativePath, toRelativePath);
  }

  writeEnvExample();
  console.log(`Built dist at ${distDir}`);
}

main();