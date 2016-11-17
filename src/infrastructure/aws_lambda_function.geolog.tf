resource "aws_lambda_function" "geolog_api" {
  function_name = "geolog-api"
  role = "${aws_iam_role.geolog_lambda.arn}"
  handler = "index.handler"
  runtime = "nodejs4.3"
}

resource "aws_iam_role" "geolog_lambda" {
    name = "iam_for_lambda"
    assume_role_policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "sts:AssumeRole",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Effect": "Allow",
      "Sid": ""
    }
  ]
}
EOF
}
