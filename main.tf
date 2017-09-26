provider "aws" {
  region = "eu-west-1"
}

module "infrastructure" {
  source = "./src/infrastructure"
}

output "aws_s3_bucket.uploads_geolog_co.id" {
  value = "${module.infrastructure.aws_s3_bucket.uploads_geolog_co.id}"
}
