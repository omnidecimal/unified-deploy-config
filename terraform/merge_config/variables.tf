variable "config_json" {
  description = "Path to the hierarchical config JSON file"
  type        = string
}

variable "target" {
  description = "Deployment target in format: env[-region] (e.g., 'dev' or 'dev-usw2'). Use this OR env/region, not both."
  type        = string
  default     = ""
}

variable "env" {
  description = "Environment name (e.g. dev, prod). Ignored if 'target' is provided."
  type        = string
  default     = ""
}

variable "region" {
  description = "Region code (e.g. usw2, use1). Ignored if 'target' is provided."
  type        = string
  default     = ""
}

variable "debug" {
  description = "Enable debug output to stderr for troubleshooting"
  type        = bool
  default     = false
}
