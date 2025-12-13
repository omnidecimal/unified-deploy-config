# Unified Deploy Config

Unified tooling to define and consume reusable deployment configuration across environments and regions. Supports:

* GitHub Actions (as an Action that sets flattened outputs)
* Terraform (module to ingest the merged configuration)
* Direct Node consumption (NPM package)
* Local CLI

Core idea: maintain a single hierarchical JSON5 (comments allowed) config with defaults, environment overrides, and
optional per‑region overrides. The tooling merges and validates the requested environment/region producing:

* Either a nested object or flattened key/value map
* Ephemeral environment support (branch‑based)
* Component hoisting (request only one component at root)
* Required field validation (no unresolved `null` values)

This makes it easy to manage complex deployment configurations in a single source of truth, and trivial to request the
"current" or "active" configuration for any environment/region combination in a way that's compatible across multiple
tools and platforms.

---
## Example Configuration (with required fields)

### Example Configuration with Required Fields

```json5
{
    "defaults": {          // Default values for all environments
        "database": {      // 'Components' are defined by adding child objects to the root
            "host": null,  // Must be defined in environment config
            "port": 5432   // Optional: has default value
        }
    },
    "environments": {      // Environment-specific configurations (will override defaults)
        "dev": {
            "database": {
                "host": "dev-db.example.com"  // Provides environment-level concrete value for required field
            }
        },
        "prod": {
            "regions": {
                "us-west-2": {
                    "database": {
                        "host": "prod-db.example.com"  // Provides concrete value for required field
                    },
                "us-east-1": {
                    "database": {
                        // Missing 'host' field here will trigger validation error when requesting this region since
                        // the 'prod' region does not have an environment-level value defined for 'host'
                    }
                }
            }
        }
    }
}
```

## Required Field Validation

If a field is `null` in `defaults`, it must be overridden by the selected environment or region. Any remaining `null`
triggers an error (path included) so required values are never silently omitted. This applies consistently across
Action, Terraform, CLI, and library usage.

---
## Consumption Methods

### GitHub Action

Add to your workflow to expose flattened outputs (dot‑delimited keys):

```yaml
- name: Read Deployment Configuration
  id: read_deployment_config
  uses: omnidecimal/unified-deploy-config@main
  with:
    config: ./deploy-config.json5
    env: dev
    region: us-west-2

- name: Show merged config value
  run: echo "Deploy with NAT instance type: ${{ steps.read_deployment_config.outputs['network.nat_instance_type'] }}"
```

#### Inputs

| Input                     | Description                                                                                     | Required | Default      |
|---------------------------|-------------------------------------------------------------------------------------------------|----------|--------------|
| `config`                  | Path to config JSON file                                                                        | Yes      | -            |
| `env`                     | Environment (e.g. dev, prod)                                                                    | Yes      | -            |
| `region`                  | Region (us-east-1, us-west-2, etc.)                                                             | Yes      | -            |
| `ephemeral-branch-prefix` | Prefix for branches associated with ephemeral environments (set to empty string to disable)     | No       | `ephemeral/` |
| `delimiter`               | Delimiter for flattening nested properties                                                      | No       | `.`          |
| `display-outputs`         | Display the merged output for the specified environment/region to the console                   | No       | `true`       |
| `component`               | Specific component to hoist to root level in the output (e.g. tfState, network)                 | No       | -            |


#### Full Example

```yaml
- name: Read Deployment Configuration Basic Example
  id: read_deployment_config
  uses: omnidecimal/unified-deploy-config@main
  with:
    config: ./deploy-config.json5
    env: dev
    region: us-west-2

- name: Show Merged Values
  run: |
    echo "NAT Instance Type: ${{ steps.read_deployment_config.outputs['network.nat_instance_type'] }}"
    echo "VPC CIDR: ${{ steps.read_deployment_config.outputs['network.vpc_cidr'] }}"
```

Note that the output from the unified-deploy-config action returns a flattened version of the merged configuration, where
nested properties are represented as keys with dot notation. Because of this, you must use bracket notation to access
these values in from the 'outputs' object, as shown in the example above.

#### Component Hoisting

The `component` parameter allows you to hoist a specific component to the root level of the output, which is useful when
you only need configuration for a particular component (like `service`, `network`, `persistence`, etc.) rather than the
entire merged configuration.

When using component hoisting:
- Only the specified component's properties are included at the root level
- Environment metadata (`env_name`, `env_config_name`, `region`, `region_short`, `is_ephemeral`) is preserved
- Other components are excluded from the output

Example (hoisting terraform state component):

```yaml
- name: Get TF State Configuration
  id: tf_state_config
  uses: omnidecimal/unified-deploy-config@main
  with:
    config: ./deploy-config.json5
    env: dev
    region: us-west-2
    component: tfState

- name: Configure Terraform Backend
  run: |
    echo "bucket=${{ steps.tf_state_config.outputs.bucketName }}" >> $GITHUB_OUTPUT
    echo "region=${{ steps.tf_state_config.outputs.region }}" >> $GITHUB_OUTPUT
```

#### jq-json5 Utility

After running the unified-deploy-config action, a `jq-json5` utility is made available in the GitHub Actions runner's PATH.
This utility combines JSON5 parsing capabilities with jq's powerful JSON filtering and transformation features, allowing
you to process JSON5 configuration files directly with jq syntax:

```yaml
- name: Process config with jq-json5
  run: |
    # Extract specific values from your JSON5 config file
    jq-json5 './deployment-config.json5' '.network.subnets[] | select(.type == "public")'

    # Transform and filter configuration data
    jq-json5 './deployment-config.json5' '.environments.dev | keys'
```

---

### Terraform Module

This module is designed to handle configuration for the **root** module of a Terraform project. For **child** (shared)
modules, any configuration data should be passed in as normal Terraform variables.

```hcl
module "merge_config" {
  source      = "git@github.com/omnidecimal/unified-deploy-config.git//terraform/merge_config?ref=main"
  config_json = "${path.root}/deploy-config.json"
  env         = "dev"
  region      = "us-west-2"
}

locals {
  deployment_config = module.merge_config.merged_config
  nat_instance_type = local.deployment_config.network.nat_instance_type
}
```

---

### NPM / Node Package Consumption

Install with any manager:

pnpm:
```sh
pnpm add unified-deploy-config
```
npm:
```sh
npm install unified-deploy-config
```
Yarn:
```sh
yarn add unified-deploy-config
```

Direct Git reference (optional):
```sh
# Latest main (not pinned)
pnpm add github:omnidecimal/unified-deploy-config#main
# Specific tag (recommended)
pnpm add github:omnidecimal/unified-deploy-config#v1.0.0
# Specific commit
pnpm add omnidecimal/unified-deploy-config#<commit-sha>
```

Because tagged releases (and main) include `dist/index.js`, no build step is required after install. Just import:

```js
const mergeConfig = require('unified-deploy-config');

const merged = mergeConfig({
  configFile: './deploy-config.json5',
  env: 'dev',
  region: 'us-west-2',
  output: 'flatten', // or 'json'
  delimiter: '.'
});

console.log(merged);
```

If you fork and modify source, regenerate the bundle with `pnpm run build:package` before consuming your fork reference.

---

### Local CLI

#### Installation

Install from npm registry (when published):
```sh
npm install -g unified-deploy-config
```

Or install from GitHub:
```sh
pnpm add -g github:omnidecimal/unified-deploy-config#main
```

Or use via npx (no installation required):
```sh
npx unified-deploy-config --help
```

#### Commands

The CLI provides two main commands: `parse` (for merging configurations) and `convert` (for converting JSON5 to JSON).

##### Parse Command

Parse and merge configuration for environments and regions:

```sh
# Merged JSON (parse is the default command)
unified-deploy-config parse --config ./test-cfg.json5 --env dev --region us-west-2
unified-deploy-config --config ./test-cfg.json5 --env dev --region us-west-2  # same as above

# Flattened output (equivalent to GitHub Action)
unified-deploy-config parse --config ./test-cfg.json5 --env dev --region us-west-2 --output flatten

# Terraform mode output
unified-deploy-config parse --config ./test-cfg.json5 --env dev --region us-west-2 --terraform

# Get specific component only
unified-deploy-config parse --config ./test-cfg.json5 --env dev --region us-west-2 --component tfState

# Get network configuration flattened
unified-deploy-config parse --config ./test-cfg.json5 --env dev --region us-west-2 --component network --output flatten
```

##### Convert Command

Convert JSON5 files to standard JSON:

```sh
# Convert to stdout (pretty-printed)
unified-deploy-config convert config.json5

# Convert to file
unified-deploy-config convert config.json5 output.json

# Convert with minified output
unified-deploy-config convert config.json5 --minify

# Convert to file with minified output
unified-deploy-config convert config.json5 output.json --minify
```

#### Direct Script Usage

You can also run the CLI script directly without installation:

```sh
node cli.js parse --config ./test-cfg.json5 --env dev --region us-west-2
node cli.js convert config.json5 output.json
```

#### Library Usage in Code

The core `mergeConfig` function can be imported and used programmatically:

```js
const mergeConfig = require('unified-deploy-config');
// or if running locally: const mergeConfig = require('./merge-config');

const result = mergeConfig({
  configFile: './config.json5',
  env: 'dev',
  region: 'us-west-2',
  output: 'json'
});
```


---
## Local Development

Clone the repo and:

1. Enable Corepack & pin pnpm:
  ```sh
  corepack enable
  corepack prepare pnpm@9.0.0 --activate
  ```
2. Install deps: `pnpm install`
3. Run tests: `pnpm test`
4. Build everything: `pnpm run build`
5. Action bundle only: `pnpm run build:gha` (outputs to `action/dist/`)
6. Library bundle only: `pnpm run build:package` (outputs to `dist/`)

Commit the generated bundles (`action/dist/index.js`, `dist/index.js`) when logic changes so consumers and the Action remain self‑contained.



