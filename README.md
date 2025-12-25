# Unified Deploy Config

Utilities to define and consume deployment configuration in a reusable, unified manner.

Define a single configuration file in JSON5 format (supports comments, trailing commas, etc.) that defines values for
any number of components that you manage and need to deploy. Each component can have default values for all
environments, as well as environment-specific and region-specific overrides.

At deploy time, specify the environment + region (and optionally a single component), and get back a merged
configuration object containing the active values for that environment/region.

This enables a single source of truth for deployment configuration that can be reused by multiple tools without
duplicating large sets of variables.

**Integration options**

* GitHub Actions
* Terraform
* Node.js / library usage (eg: in an AWS CDK app, custom deployment scripts, etc.)
* Local CLI

**Key features**

* Ephemeral environment support (ephemeral name detection based on a Git branch name prefix)
* Return configuration as either a nested object or flattened key/value map
* Component hoisting (request only one component at root)
* Required field validation (no unresolved `null` values)

---
## Configuration format

### Example (with required fields)

```json5
{
  "defaults": {           // Default values for all environments
    "database": {         // Components are objects at the root
      "host": null,       // Required: must be overridden in env/region
      "port": 5432        // Optional default
    }
  },
  "environments": {       // Environment overrides
    "dev": {
      "database": {
        "host": "dev-db.example.com"
      }
    },
    "prod": {
      "regions": {
        "us-west-2": {
          "database": {
            "host": "prod-db.example.com"
          }
        },
        "us-east-1": {
          "database": {
            // Missing 'host' will trigger a validation error if you request prod + us-east-1
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
## Integration options

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

| Input                            | Description                                                                                              | Required | Default      |
|----------------------------------|----------------------------------------------------------------------------------------------------------|----------|--------------|
| `config`                         | Path to config JSON5 file                                                                                | Yes      | -            |
| `env`                            | Environment (e.g. dev, prod)                                                                             | Yes      | -            |
| `region`                         | Region (us-east-1, us-west-2, etc.)                                                                      | Yes      | -            |
| `ephemeral-branch-prefix`        | Prefix for branches associated with ephemeral environments (set to empty string to disable)              | No       | `ephemeral/` |
| `disable-ephemeral-branch-check` | Disable requirement that the current branch name matches `ephemeral-branch-prefix` for ephemeral envs    | No       | `false`      |
| `delimiter`                      | Delimiter for flattening nested properties                                                               | No       | `.`          |
| `display-outputs`                | Display the merged output for the specified environment/region to the console                            | No       | `true`       |
| `component`                      | Specific component to hoist to root level in the output (e.g. tfState, network)                          | No       | -            |
| `github-token`                   | GitHub token to use for authentication with private repositories                                         | No       | -            |


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

Note that the output from the unified-deploy-config action returns a flattened version of the merged configuration,
where nested properties are represented as keys with dot notation. Because of this, you must use bracket notation to
access these values in from the 'outputs' object, as shown in the example above.

#### Component Hoisting

The `component` parameter allows you to hoist a specific component to the root level of the output, which is useful when
you only need configuration for a particular component (like `service`, `network`, `persistence`, etc.) rather than the
entire merged configuration.

When using component hoisting:
- Only the specified component's properties are included at the root level
- Environment metadata (`env_name`, `env_config_name`, `region`, `region_short`, `is_ephemeral`) is preserved
- Other components are excluded from the output

Because the Action always returns flattened outputs, component hoisting also means the returned keys are no longer
prefixed (e.g. `tfState.bucketName` becomes `bucketName`).

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

After running the unified-deploy-config action, a `jq-json5` utility is made available in the GitHub Actions runner's
PATH. This utility combines JSON5 parsing capabilities with jq's powerful JSON filtering and transformation features,
allowing you to process JSON5 configuration files directly with jq syntax:

```yaml
- name: Process config with jq-json5
  run: |
    # Extract specific values from your JSON5 config file
    jq-json5 './deploy-config.json5' '.network.subnets[] | select(.type == "public")'

    # Transform and filter configuration data
    jq-json5 './deploy-config.json5' '.environments.dev | keys'
```

---

### Terraform Module

This module is designed to handle configuration for the **root** module of a Terraform project. For **child** (shared)
modules, any configuration data should be passed in as normal Terraform variables.

```hcl
module "merge_config" {
  source      = "git@github.com/omnidecimal/unified-deploy-config.git//terraform/merge_config?ref=main"
  config_json = "${path.root}/deploy-config.json5"
  env         = "dev"
  region      = "us-west-2"
}

locals {
  deployment_config = module.merge_config.merged_config
  nat_instance_type = local.deployment_config.network.nat_instance_type
}
```

---

### Node.js / library usage

Install:

```sh
pnpm add unified-deploy-config
```

```js
import { mergeConfig } from 'unified-deploy-config';

const merged = mergeConfig({
  configFile: './deploy-config.json5',
  env: 'dev',
  region: 'us-west-2',
  output: 'flatten', // or 'json'
  delimiter: '.'
});

console.log(merged);
```

CommonJS (`require`) is also supported:

```js
const { mergeConfig } = require('unified-deploy-config');

const merged = mergeConfig({
  configFile: './deploy-config.json5',
  env: 'dev',
  region: 'us-west-2',
  output: 'flatten',
  delimiter: '.'
});

console.log(merged);
```

---

### Local CLI

#### Installation

Install globally:

```sh
pnpm add -g unified-deploy-config
```

Or install from GitHub:
```sh
pnpm add -g github:omnidecimal/unified-deploy-config#main
```

Or run without installing globally:

```sh
pnpm dlx --package unified-deploy-config udc --help
```

#### Commands

The CLI executable installed by this package is `udc`.

The default command is `resolve` (merge/resolve configuration). Other commands include `where` and `convert`.

##### Resolve command

Parse and merge configuration for environments and regions:

```sh
# Merged JSON (resolve is the default command)
udc resolve --config ./test-cfg.json5 --env dev --region us-west-2
udc --config ./test-cfg.json5 --env dev --region us-west-2  # same as above

# Flattened output (equivalent to GitHub Action)
udc resolve --config ./test-cfg.json5 --env dev --region us-west-2 --output flatten

# Target shorthand (environment[-regionshort])
udc resolve --config ./test-cfg.json5 --target dev-usw2

# Terraform mode output
udc resolve --config ./test-cfg.json5 --env dev --region us-west-2 --terraform

# Get specific component only
udc resolve --config ./test-cfg.json5 --env dev --region us-west-2 --component tfState

# Get network configuration flattened
udc resolve --config ./test-cfg.json5 --env dev --region us-west-2 --component network --output flatten
```

##### Where command

Find environments/regions where a component has valid configuration (no nulls):

```sh
udc where --config ./test-cfg.json5 --component network
udc where --config ./test-cfg.json5 --component network --output list
```

##### Convert Command

Convert JSON5 files to standard JSON:

```sh
# Convert to stdout (pretty-printed)
udc convert config.json5

# Convert to file
udc convert config.json5 output.json

# Convert with minified output
udc convert config.json5 --minify

# Convert to file with minified output
udc convert config.json5 output.json --minify
```

#### Library Usage in Code

The core `mergeConfig` function can be imported and used programmatically:

```js
import { mergeConfig } from 'unified-deploy-config';

const result = mergeConfig({
  configFile: './config.json5',
  env: 'dev',
  region: 'us-west-2',
  output: 'json'
});
```


---
## Local Development

Prereqs:

- Node.js (see `engines.node` in package.json; currently `>=18`)
- pnpm

Clone the repo and:

1. Install deps:
  ```sh
  pnpm install
  ```
2. Run tests:
  ```sh
  pnpm test
  ```
3. Build everything:
  ```sh
  pnpm run build
  ```

### Build outputs

The bundles under `dist/` are generated artifacts (Action, Terraform helper, and CJS bundle). They are produced by CI/CD
as part of the build/release process.

For local testing you can generate them with:

- Action bundle: `pnpm run build:gha` → `dist/action/index.cjs`
- Terraform bundle: `pnpm run build:terraform` → `dist/terraform/index.cjs`
- CJS bundle (for `require()` consumers): `pnpm run build:package` → `dist/cjs/index.cjs`



