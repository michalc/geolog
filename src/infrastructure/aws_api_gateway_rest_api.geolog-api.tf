resource "aws_api_gateway_rest_api" "geolog" {
  name = "geolog"
}

output "aws_api_gateway_rest_api.geolog.id" {
  value = "${aws_api_gateway_rest_api.geolog.id}"
}

# Slightly annoying, but to create stages we need a resourse + method
# We need a "_deployment" as part of code deployment, so we use that
resource "aws_api_gateway_resource" "geolog_deployment" {
  rest_api_id = "${aws_api_gateway_rest_api.geolog.id}"
  parent_id = "${aws_api_gateway_rest_api.geolog.root_resource_id}"
  path_part = "_deployment"
}

resource "aws_api_gateway_method" "geolog_deployment_GET" {
  rest_api_id = "${aws_api_gateway_rest_api.geolog.id}"
  resource_id = "${aws_api_gateway_resource.geolog_deployment.id}"
  http_method = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_deployment" "geolog_deployment_certification" {
  depends_on = ["aws_api_gateway_method.geolog_deployment_GET"]
  rest_api_id = "${aws_api_gateway_rest_api.geolog.id}"
  stage_name = "certification"
}

resource "aws_api_gateway_deployment" "geolog_deployment_production" {
  depends_on = ["aws_api_gateway_method.geolog_deployment_GET"]
  rest_api_id = "${aws_api_gateway_rest_api.geolog.id}"
  stage_name = "production"
}

resource "aws_api_gateway_integration" "geolog_deployment_GET" {
  rest_api_id = "${aws_api_gateway_rest_api.geolog.id}"
  resource_id = "${aws_api_gateway_resource.geolog_deployment.id}"
  http_method = "${aws_api_gateway_method.geolog_deployment_GET.http_method}"
  type = "MOCK"

  # Code deployment changes the integration
  lifecycle {
    ignore_changes = [
      "request_templates"
    ]
  }
}
