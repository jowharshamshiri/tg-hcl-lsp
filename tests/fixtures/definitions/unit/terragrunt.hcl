include "root" {
  path = find_in_parent_folders("root.hcl")
}

locals {
  name   = "unit"
  prefix = "app"
}

inputs = {
  label   = local.name
  title   = "${local.prefix}-unit"
  bucket  = include.root.locals.bucket
  region  = include.root.inputs.region
  network = dependency.network.outputs.id
}
