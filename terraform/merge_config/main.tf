locals {
  # Build the program arguments based on whether target or env/region is provided
  use_target = var.target != ""

  base_args = [
    "node",
    "${path.module}/../../dist/cli/index.cjs",
    "resolve",
    "--config", var.config_json,
    "--terraform",
  ]

  target_args = local.use_target ? ["--target", var.target] : ["--env", var.env, "--region", var.region]
  debug_args  = var.debug ? ["--debug"] : []
}

data "external" "merged_config" {
  program = concat(local.base_args, local.target_args, local.debug_args)
}

locals {
  merged_config = jsondecode(data.external.merged_config.result.mergedConfig)
}

output "merged_config" {
  value = local.merged_config
}
