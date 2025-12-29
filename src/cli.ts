#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import JSON5 from 'json5';
import { program, Option } from 'commander';
import { mergeConfig, parseTarget } from './lib/merge-config.js';
import { checkComponentAvailability, checkAllComponentsAvailability } from './lib/component-discovery.js';
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

interface ListEnvironmentsCommandOptions {
  config: string;
  component?: string;
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
  .command('resolve')
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

// List environments command - find environments where components have valid configuration
program
  .command('list-environments')
  .alias('le')
  .description('List environments where components have valid configuration (no null values)')
  .requiredOption('--config <path>', 'Path to the configuration file')
  .option('--component <name>', 'Component name to check (if omitted, checks all components)')
  .addOption(
    new Option('--output <format>', 'Output format')
      .choices(['json', 'list'])
      .default('json')
  )
  .action((options: ListEnvironmentsCommandOptions) => {
    const configPath = path.resolve(options.config);
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON5.parse(configContent) as DeploymentConfig;

    if (options.component) {
      // Single component check
      const result = checkComponentAvailability(config, options.component);

      if (result.environments.length === 0 && !config.environments) {
        console.error('No environments found in config file');
        process.exit(1);
      }

      if (options.output === 'list') {
        for (const env of result.environments.filter(e => e.available)) {
          if (env.envLevel.target) {
            console.log(env.envLevel.target);
          }
          if (env.regions) {
            for (const reg of env.regions.filter(r => r.target)) {
              console.log(reg.target);
            }
          }
        }
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    } else {
      // All components check
      const result = checkAllComponentsAvailability(config);

      if (result.environments.length === 0 && !config.environments) {
        console.error('No environments found in config file');
        process.exit(1);
      }

      if (options.output === 'list') {
        // Show all valid targets (where ANY component is valid)
        for (const env of result.environments.filter(e => e.valid)) {
          // Show environment target if any component is valid at env level
          const envLevelTarget = env.components.find(c => c.envLevel.target)?.envLevel.target;
          if (envLevelTarget) {
            console.log(envLevelTarget);
          }
          // Collect all valid region targets across all components
          const validTargets = new Set<string>();
          for (const comp of env.components) {
            for (const reg of (comp.regions ?? []).filter(r => r.target)) {
              validTargets.add(reg.target!);
            }
          }
          for (const target of validTargets) {
            console.log(target);
          }
        }
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
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

if (!process.argv.slice(2).length) {
  program.help();
}
