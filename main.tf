provider "aws" {
  region = "eu-west-1"
}

module "infrastructure" {
  source = "./src/infrastructure"
}
