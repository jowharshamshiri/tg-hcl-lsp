terraform {
  source = "tfr:///terraform-aws-modules/vpc/aws?version=5.0.0"
}

inputs = {
  cidr = "10.0.0.0/16"
}
