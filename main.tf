provider "aws" {
  region = "eu-west-1"
}

module "infrastructure" {
  source = "./src/infrastructure"
}

output "aws_api_gateway_rest_api.geolog.id" {
  value = "${module.infrastructure.aws_api_gateway_rest_api.geolog.id}"
}

output "aws_s3_bucket.uploads_geolog_co.arn" {
  value = "${module.infrastructure.aws_s3_bucket.uploads_geolog_co.arn}"
}
