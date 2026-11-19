locals {
  containers = {
    a = { network = { cidr = "10.0.0.0/21" } }
    b = { network = { cidr = "10.1.0.0/21", zone = "b" } }
  }
}

inputs = {
  nested  = [for c in values(local.containers) : [for k, v in c : v.cidr]]
  sizes   = [for s in [{ name = "M10", tier = 1 }, { name = "M20", disk = 40 }] : s.name]
  regions = { for k, r in { eu = { code = "eu-west-2" }, us = { code = "us-east-1", primary = true } } : k => r.code }
}
