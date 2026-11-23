locals {
  region = "eu" +
}

terraform {
  source = "../modules/app"
}

inputs = {
  smile = "\uD83D\uDE00"
}
