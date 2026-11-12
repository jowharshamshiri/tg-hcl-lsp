locals {
  stage_vars = read_terragrunt_config(find_in_parent_folders("stage.hcl"))
}

remote_state {
  bad_property = false
  backend      = "s3"
}
