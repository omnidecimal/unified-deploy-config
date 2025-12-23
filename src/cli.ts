#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import JSON5 from 'json5';
import { program, Option } from 'commander';
import { mergeConfig, parseTarget } from './lib/merge-config.js';
import { checkComponentAvailability } from './lib/component-check.js';
import type { DeploymentConfig } from './types/index.js';

interface ResolveCommandOptions {
  config: string;
  target?: string;
  env?: string;
  region?: string;
  output: 'json' | 'flatten';
  delimiter: string;
  terraform: boolean;
  ephemeralBranchPrefix?: string;
  disableEphemeralBranchCheck: boolean;
  branchName?: string;
  component?: string;
  debug: boolean;
}

interface WhereCommandOptions {
  config: string;
  component: string;
  output: 'json' | 'list';
}

interface ConvertCommandOptions {
  minify: boolean;
}

program
  .name('unified-deploy-config')
  .description('Unified Deployment Configuration (UDC) management tool')
  .version('1.0.0');

// Parse command - merge configurations for different environments and regions
program
  .command('resolve', { isDefault: true })
  .description('Show resolved active configuration for a specified environment and region')
  .requiredOption('--config <path>', 'Path to the configuration file')
  .option('--target <deployment-id>', 'Target Deployment ID in format: environment[-region] (e.g., dev-usw2)')
  .option('--env <env>', 'Environment name (cannot be used with --target)')
  .option('--region <region>', 'Region code or name (cannot be used with --target)')
  .addOption(
    new Option('--output <format>', 'Output format (json or flatten)')
      .choices(['json', 'flatten'])
      .default('json')
  )
  .option('--delimiter <char>', 'Delimiter for flattened output', '.')
  .option('--terraform', 'Enable Terraform output mode', false)
  .option('--ephemeral-branch-prefix <prefix>', 'Prefix for ephemeral branch names')
  .option('--disable-ephemeral-branch-check', 'Disable ephemeral branch validation', false)
  .option('--branch-name <name>', 'Branch name for ephemeral environments')
  .option('--component <component>', 'Component to hoist to root level')
  .option('--debug', 'Enable debug mode', false)
  .action((options: ResolveCommandOptions) => {
    // Validate mutually exclusive options
    if (options.target && (options.env || options.region)) {
      console.error('Error: --target cannot be used with --env or --region');
      process.exit(1);
    }
    if (!options.target && !options.env) {
      console.error('Error: Either --target or --env must be specified');
      process.exit(1);
    }

    // Parse target or use env/region directly
    let env: string;
    let region: string | undefined;
    if (options.target) {
      const parsed = parseTarget(options.target);
      env = parsed.env;
      region = parsed.region;
    } else {
      env = options.env!;
      region = options.region;
    }

    const result = mergeConfig({
      configFile: options.config,
      env,
      region,
      output: options.output,
      delimiter: options.delimiter,
      ephemeralBranchPrefix: options.ephemeralBranchPrefix,
      disableEphemeralBranchCheck: options.disableEphemeralBranchCheck,
      branchName: options.branchName,
      component: options.component
    });

    if (options.terraform) {
      // If debug mode is enabled, output human-readable config to stderr for visibility
      if (options.debug) {
        console.error('=== DEBUG: Merged Configuration ===');
        console.error(JSON.stringify(result, null, 2));
        console.error('=== END DEBUG ===');

        // Write to a debug file in /tmp with random suffix for easier viewing when called from Terraform
        try {
          const timestamp = Date.now();
          const randomSuffix = Math.random().toString(36).substring(2, 8);
          const debugFile = path.join('/tmp', `merge-config-debug-${timestamp}-${randomSuffix}.json`);
          fs.writeFileSync(debugFile, JSON.stringify(result, null, 2));
          console.error(`=== DEBUG: Debug file written to ${debugFile} ===`);
        } catch (e) {
          const error = e as Error;
          console.error(`=== DEBUG: Could not write debug file: ${error.message} ===`);
        }
      }

      // For Terraform, output as { "mergedConfig": <object> }
      // Terraform needs the mergedConfig value to be a string, which it will then parse as JSON
      console.log(JSON.stringify({ mergedConfig: JSON.stringify(result) }));

    } else {
      // Pretty JSON to stdout
      console.log(JSON.stringify(result, null, 2));
    }
  });

// Where command - find environments where a component is active
program
  .command('where')
  .description('Find environments where a component has valid configuration (no null values)')
  .requiredOption('--config <path>', 'Path to the configuration file')
  .requiredOption('--component <name>', 'Component name to check')
  .addOption(
    new Option('--output <format>', 'Output format')
      .choices(['json', 'list'])
      .default('json')
  )
  .action((options: WhereCommandOptions) => {
    const configPath = path.resolve(options.config);
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON5.parse(configContent) as DeploymentConfig;

    const results = checkComponentAvailability(config, options.component);

    if (results.length === 0 && !(config.accounts || config.environments)) {
      console.error('No environments or accounts found in config file');
      process.exit(1);
    }

    if (options.output === 'list') {
      const validEnvs = results.filter(r => r.valid);
      for (const env of validEnvs) {
        // Only show bare environment name if env-level is valid
        if (env.envLevel.valid) {
          console.log(env.environment);
        }
        if (env.regions) {
          for (const reg of env.regions.filter(r => r.valid)) {
            // Output as target ID: environment-regionshortcode
            console.log(`${env.environment}-${reg.regionShort}`);
          }
        }
      }
    } else {
      console.log(JSON.stringify(results, null, 2));
    }
  });

// Convert command - convert JSON5 to JSON
program
  .command('convert')
  .description('Convert JSON5 file to standard JSON')
  .argument('<input>', 'Input JSON5 file path')
  .argument('[output]', 'Output JSON file path (optional, defaults to stdout)')
  .option('--minify', 'Minify the JSON output', false)
  .action((input: string, output: string | undefined, options: ConvertCommandOptions) => {
    try {
      const inputPath = path.resolve(input);
      const json5Content = fs.readFileSync(inputPath, 'utf8');
      const parsed = JSON5.parse(json5Content) as unknown;
      const jsonOutput = options.minify
        ? JSON.stringify(parsed)
        : JSON.stringify(parsed, null, 2);

      if (output) {
        const outputPath = path.resolve(output);
        fs.writeFileSync(outputPath, jsonOutput + '\n', 'utf8');
        console.error(`Successfully converted ${input} to ${output}`);
      } else {
        console.log(jsonOutput);
      }
    } catch (error) {
      const err = error as Error;
      console.error(`Error converting file: ${err.message}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
