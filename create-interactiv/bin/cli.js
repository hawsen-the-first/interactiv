#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import prompts from 'prompts';
import chalk from 'chalk';
import ora from 'ora';
import { execSync } from 'child_process';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get network IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '192.168.1.100';
}

// Main CLI function
async function main() {
  console.log(chalk.cyan.bold('\n🚀 Create Interactiv App\n'));

  try {
    // Get project configuration from user
    const config = await prompts([
      {
        type: 'text',
        name: 'projectName',
        message: 'Project name:',
        initial: 'my-interactiv-app',
        validate: (value) => {
          if (!value) return 'Project name is required';
          if (!/^[a-z0-9-]+$/.test(value)) {
            return 'Project name can only contain lowercase letters, numbers, and hyphens';
          }
          return true;
        }
      },
      {
        type: 'confirm',
        name: 'useAnimations',
        message: 'Enable animations?',
        initial: true
      },
      {
        type: 'confirm',
        name: 'debugMode',
        message: 'Enable debug logging?',
        initial: false
      },
      {
        type: 'select',
        name: 'logLevel',
        message: 'Minimum log level:',
        choices: [
          { title: 'Error', value: 'error' },
          { title: 'Warn', value: 'warn' },
          { title: 'Trace', value: 'trace' }
        ],
        initial: 0
      },
      {
        type: 'confirm',
        name: 'linkRemote',
        message: 'Link to existing remote repository?',
        initial: false
      },
      {
        type: (prev) => prev ? 'text' : null,
        name: 'remoteUrl',
        message: 'Remote repository URL:',
        validate: (value) => {
          if (!value) return 'Remote URL is required';
          return true;
        }
      },
      {
        type: 'text',
        name: 'hostIp',
        message: 'Your local IP address for BrightSign dev mode:',
        initial: getLocalIP(),
        validate: (value) => {
          if (!value) return 'IP address is required';
          if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value)) {
            return 'Invalid IP address format';
          }
          return true;
        }
      }
    ]);

    // Check if user cancelled
    if (!config.projectName) {
      console.log(chalk.red('\n❌ Setup cancelled\n'));
      process.exit(1);
    }

    const projectPath = path.resolve(process.cwd(), config.projectName);

    // Check if directory already exists
    if (fs.existsSync(projectPath)) {
      console.log(chalk.red(`\n❌ Directory "${config.projectName}" already exists\n`));
      process.exit(1);
    }

    console.log(chalk.blue('\n📦 Creating project...\n'));

    // Create project directory
    fs.mkdirSync(projectPath, { recursive: true });

    // Copy template files
    const templatePath = path.join(__dirname, '../templates/base');
    const spinner = ora('Copying template files...').start();
    
    await copyTemplate(templatePath, projectPath, config);
    
    spinner.succeed('Template files copied');

    // Initialize git repository
    spinner.start('Initializing git repository...');
    try {
      execSync('git init', { cwd: projectPath, stdio: 'ignore' });
      
      if (config.linkRemote && config.remoteUrl) {
        execSync(`git remote add origin ${config.remoteUrl}`, { cwd: projectPath, stdio: 'ignore' });
        spinner.succeed(`Git repository initialized with remote: ${config.remoteUrl}`);
      } else {
        spinner.succeed('Git repository initialized');
      }
    } catch (error) {
      spinner.warn('Git initialization failed (git may not be installed)');
    }

    // Install dependencies
    spinner.start('Installing dependencies (this may take a minute)...');
    try {
      execSync('npm install', { cwd: projectPath, stdio: 'ignore' });
      spinner.succeed('Dependencies installed');
    } catch (error) {
      spinner.fail('Failed to install dependencies');
      console.log(chalk.yellow('\n⚠️  You can manually run: cd ' + config.projectName + ' && npm install\n'));
    }

    // Success message
    console.log(chalk.green.bold('\n✅ Project created successfully!\n'));
    console.log(chalk.cyan('Next steps:\n'));
    console.log(chalk.white(`  cd ${config.projectName}`));
    console.log(chalk.white(`  npm run dev\n`));
    console.log(chalk.cyan('Your project includes:\n'));
    console.log(chalk.white('  ✓ Page, View, and Component examples'));
    console.log(chalk.white('  ✓ Screensaver functionality'));
    console.log(chalk.white('  ✓ Hidden settings page (corner activation)'));
    console.log(chalk.white('  ✓ BrightSign-optimized Vite config'));
    console.log(chalk.white('  ✓ TypeScript configuration\n'));

  } catch (error) {
    console.error(chalk.red('\n❌ Error creating project:'), error);
    process.exit(1);
  }
}

// Copy template with variable substitution
async function copyTemplate(templatePath, projectPath, config) {
  const files = fs.readdirSync(templatePath, { withFileTypes: true });

  for (const file of files) {
    const sourcePath = path.join(templatePath, file.name);
    const destPath = path.join(projectPath, file.name);

    if (file.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      await copyTemplate(sourcePath, destPath, config);
    } else {
      let content = fs.readFileSync(sourcePath, 'utf-8');

      // Replace template variables
      content = content
        .replace(/\{\{PROJECT_NAME\}\}/g, config.projectName)
        .replace(/\{\{USE_ANIMATIONS\}\}/g, config.useAnimations.toString())
        .replace(/\{\{DEBUG_MODE\}\}/g, config.debugMode.toString())
        .replace(/\{\{LOG_LEVEL\}\}/g, config.logLevel)
        .replace(/\{\{HOST_IP\}\}/g, config.hostIp);

      fs.writeFileSync(destPath, content, 'utf-8');
    }
  }
}

main().catch((error) => {
  console.error(chalk.red('Unexpected error:'), error);
  process.exit(1);
});
