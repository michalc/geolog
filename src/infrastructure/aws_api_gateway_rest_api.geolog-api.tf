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

# Permissions

resource "aws_iam_policy" "geolog_s3_blue_green_get" {
  name = "geolog_s3_blue_green_get"
  policy = "${data.aws_iam_policy_document.geolog_blue_green_s3_get.json}"
}

resource "aws_iam_role_policy_attachment" "geolog_apigateway_s3_blue_green_get" {
  role = "${aws_iam_role.geolog_apigateway.name}"
  policy_arn = "${aws_iam_policy.geolog_s3_blue_green_get.arn}"
}

resource "aws_iam_role" "geolog_apigateway" {
  name = "geolog_apigateway"
  assume_role_policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "sts:AssumeRole",
      "Principal": {
        "Service": "apigateway.amazonaws.com"
      },
      "Effect": "Allow",
      "Sid": "",
      "SourceArn": "arn:aws:execute-api:*:*:${aws_api_gateway_rest_api.geolog.id}/*"
    }
  ]
}
EOF
}

data "aws_iam_policy_document" "geolog_blue_green_s3_get" {
  statement {
    sid = "ListBucket"
    effect = "Allow"
    actions = [
      "s3:ListBucket"
    ]
    resources = [
      "arn:aws:s3:::blue.geolog.co",
      "arn:aws:s3:::green.geolog.co",
    ]
  }

  statement {
    sid = "GetObject"
    effect = "Allow"
    actions = [
      "s3:GetObject"
    ]
    resources = [
      "arn:aws:s3:::blue.geolog.co/*",
      "arn:aws:s3:::green.geolog.co/*"
    ]
  }
}

resource "aws_lambda_permission" "geolog_invoke_lambda" {
  statement_id = "geolog_invoke_lambda"
  action = "lambda:InvokeFunction"
  function_name = "${aws_lambda_function.geolog_api.arn}"
  principal = "apigateway.amazonaws.com"
  source_arn = "arn:aws:execute-api:eu-west-1:772663561820:${aws_api_gateway_rest_api.geolog.id}/*/GET/*"
}
