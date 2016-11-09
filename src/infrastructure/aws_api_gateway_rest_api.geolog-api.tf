resource "aws_api_gateway_rest_api" "geolog" {
  name = "geolog"
}

output "aws_api_gateway_rest_api.geolog.id" {
  value = "${aws_api_gateway_rest_api.geolog.id}"
}
