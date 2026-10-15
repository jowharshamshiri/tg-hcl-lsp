locals {
  bucket = "state"
}

dependency "network" {
  config_path = "../../vpc"
}

inputs = {
  region = "eu-central-1"
}
