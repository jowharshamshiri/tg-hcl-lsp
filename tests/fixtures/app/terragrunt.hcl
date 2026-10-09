locals {
  env = "dev"
}

dependency "vpc" {
  config_path = "../vpc"
}

inputs = {
  env = local.env
}
