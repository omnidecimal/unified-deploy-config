data "external" "merged_config" {
  program = concat([
    "env", "TF_DEBUG_DIR=${path.cwd}",
    "node",
    "${path.module}/dist/index.js",
    "--config", var.config_json,
    "--env", var.env,
    "--region", var.region,
    "--output", "json",
    "--terraform"
  ], var.debug ? ["--debug"] : [])
}

locals {
  merged_config = jsondecode(data.external.merged_config.result.mergedConfig)
}

output "merged_config" {
  value = local.merged_config
}
