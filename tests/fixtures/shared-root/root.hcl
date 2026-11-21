dependency "nothing" {
  config_path = "../nothing-here"
}

remote_state {
  bad_property = false
  backend      = "s3"
}
