// GitHub Action entrypoint. Packs into action/dist/index.js via build:gha script.
import * as core from '@actions/core';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { join } from 'node:path';
import JSON5 from 'json5';
import mergeConfig, { parseTarget } from '../lib/merge-config.js';
import type { FlattenedConfig } from '../types/index.js';

// Support --parse <file> for jq-json5 helper
const args = process.argv.slice(2);
const parseIndex = args.indexOf('--parse');
if (parseIndex !== -1 && parseIndex + 1 < args.length) {
  const filePath = args[parseIndex + 1];
  try {
    const fileContent = fs.readFileSync(filePath!, 'utf8');
    const parsed = JSON5.parse(fileContent) as unknown;
    console.log(JSON.stringify(parsed, null, 2));
    process.exit(0);
  } catch (error) {
    const err = error as Error;
    console.error(`Error parsing file ${filePath}:`, err.message);
    process.exit(1);
  }
}

function exposeCliTools(): void {
  const { RUNNER_TEMP, GITHUB_ACTION_PATH } = process.env;
  const tempBin = join(RUNNER_TEMP ?? '/tmp', 'unified-deploy-config-bin');
  fs.mkdirSync(tempBin, { recursive: true });

  const actionRoot = GITHUB_ACTION_PATH ?? __dirname;

  // Expose jq-json5 helper
  const jqJson5Wrapper = join(tempBin, 'jq-json5');
  fs.writeFileSync(
    jqJson5Wrapper,
    `#!/usr/bin/env bash
set -eo pipefail
file="$1"; shift
node "${actionRoot}/index.cjs" --parse "$file" | jq "$@"`
  );
  fs.chmodSync(jqJson5Wrapper, 0o755);

  // Expose udc CLI
  const udcWrapper = join(tempBin, 'udc');
  fs.writeFileSync(
    udcWrapper,
    `#!/usr/bin/env bash
exec node "${actionRoot}/../cli/index.cjs" "$@"`
  );
  fs.chmodSync(udcWrapper, 0o755);

  core.addPath(tempBin);
}

try {
  const githubToken = core.getInput('github-token');
  if (githubToken && process.env.GITHUB_ACTION_REPOSITORY) {
    const serverUrl = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
    const repoUrl = `${serverUrl}/${process.env.GITHUB_ACTION_REPOSITORY}.git`;
    const parsedUrl = new URL(repoUrl);
    const insteadOfUrl = `ssh://git@${parsedUrl.hostname}/${process.env.GITHUB_ACTION_REPOSITORY}.git`;
    core.info(`Configuring git for private repository access to '${process.env.GITHUB_ACTION_REPOSITORY}' using '${insteadOfUrl}'`);
    execSync(`git config --global url."https://oauth2:${githubToken}@${parsedUrl.hostname}${parsedUrl.pathname}".insteadOf "${insteadOfUrl}"`);
  }

  const configFile = core.getInput('config', { required: true });
  const target = core.getInput('target');
  const delimiter = core.getInput('delimiter') || '.';
  const ephemeralBranchPrefix = core.getInput('ephemeral-branch-prefix');
  const disableEphemeralBranchCheck = core.getInput('disable-ephemeral-branch-check') === 'true';
  const displayOutputs = core.getInput('display-outputs') === 'true';
  const component = core.getInput('component') || null;

  // Determine env and region from target or individual inputs
  let env: string;
  let region: string | undefined;

  if (target) {
    const parsed = parseTarget(target);
    env = parsed.env;
    region = parsed.region;
    core.info(`Using target '${target}' -> env: '${env}', region: '${region ?? '(none)'}'`);
  } else {
    env = core.getInput('env');
    region = core.getInput('region') || undefined;
    if (!env) {
      throw new Error("Either 'target' or 'env' input is required");
    }
  }

  const flat = mergeConfig({
    configFile,
    env,
    region,
    output: 'flatten',
    delimiter,
    ephemeralBranchPrefix,
    disableEphemeralBranchCheck,
    branchName: process.env.GITHUB_REF_NAME,
    component
  }) as FlattenedConfig;

  if (displayOutputs) {
    console.log('=== Merged Configuration ===');
    console.log(JSON.stringify(flat, null, 2));
    console.log('============================');
  }

  for (const [k, v] of Object.entries(flat)) {
    core.setOutput(k, v);
  }

  const installCli = core.getInput('install-cli') !== 'false';
  if (installCli) {
    exposeCliTools();
  }
} catch (error) {
  const err = error as Error;
  core.setFailed(err.message ?? String(error));
}
