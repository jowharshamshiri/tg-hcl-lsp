locals {
  config = { region = "eu-west-2" }
}

inputs = {
  name   = local.missing
  region = local.config.zone
}
