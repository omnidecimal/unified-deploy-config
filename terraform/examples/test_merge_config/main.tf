module "merge_config" {
  source      = "../../merge_config"
  config_json = "../../../test-cfg.json5"
  target      = "dev-usw2"  # Can also use separate env/region variables
  debug       = true        # Set to true to see the merged config in console output
}

locals {
  deployment_config = module.merge_config.merged_config
  nat_instance_type = local.deployment_config.network.nat_instance_type
}

# Shows the entire merged configuration
output "deployment_config" {
  value = local.deployment_config
}

# Example for how to access specific values
output "nat_instance_type" {
    value = local.nat_instance_type
}
