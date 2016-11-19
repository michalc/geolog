# Can't actually setup cognito, but can setup permissions / roles
# After pool is created, must select the authenticated and
# unauthenticaed roles manually in the console

# Are this minimum set of permissions for cognito to do stuff?
data "aws_iam_policy_document" "geolog_cognito_minimum" {
  statement {
    sid = ""
    effect = "Allow"
    actions = [
      "mobileanalytics:PutEvents",
      "cognito-sync:*"
    ]
    resources = [
      "*"
    ]
  }
}

resource "aws_iam_policy" "geolog_cognito_minimum" {
  name = "geolog_cognito_minimum"
  policy = "${data.aws_iam_policy_document.geolog_cognito_minimum.json}"
}

data "aws_iam_policy_document" "geolog_invoke_api_gateway" {
  statement {
    sid = ""
    effect = "Allow"
    actions = [
      "execute-api:Invoke"
    ]
    resources = [
      "arn:aws:execute-api:eu-west-1:*:${aws_api_gateway_rest_api.geolog.id}/production/GET/*",
      "arn:aws:execute-api:eu-west-1:*:${aws_api_gateway_rest_api.geolog.id}/certification/GET/*"
    ]
  }
}

resource "aws_iam_policy" "geolog_invoke_api_gateway" {
  name = "geolog_invoke_api_gateway"
  policy = "${data.aws_iam_policy_document.geolog_invoke_api_gateway.json}"
}

resource "aws_iam_role" "geolog_cognito_unauthenticated" {
    name = "geolog_cognito_unauthenticated"
    assume_role_policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "cognito-identity.amazonaws.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "cognito-identity.amazonaws.com:aud": "eu-west-1:fdeb8cdc-38e2-4963-9578-5a4f03efdfed"
        },
        "ForAnyValue:StringLike": {
          "cognito-identity.amazonaws.com:amr": "unauthenticated"
        }
      }
    }
  ]
}
EOF
}

resource "aws_iam_role" "geolog_cognito_authenticated" {
    name = "geolog_cognito_authenticated"
    assume_role_policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "cognito-identity.amazonaws.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "cognito-identity.amazonaws.com:aud": "eu-west-1:fdeb8cdc-38e2-4963-9578-5a4f03efdfed"
        },
        "ForAnyValue:StringLike": {
          "cognito-identity.amazonaws.com:amr": "authenticated"
        }
      }
    }
  ]
}
EOF
}

resource "aws_iam_role_policy_attachment" "geolog_invoke_api_gateway" {
  role = "${aws_iam_role.geolog_cognito_unauthenticated.name}"
  policy_arn = "${aws_iam_policy.geolog_invoke_api_gateway.arn}"
}

resource "aws_iam_role_policy_attachment" "geolog_cognito_minimum" {
  role = "${aws_iam_role.geolog_cognito_unauthenticated.name}"
  policy_arn = "${aws_iam_policy.geolog_cognito_minimum.arn}"
}
