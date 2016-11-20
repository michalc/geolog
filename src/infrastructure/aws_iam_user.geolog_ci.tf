resource "aws_iam_user" "geolog_ci" {
  name = "geolog-ci"
}

resource "aws_iam_policy" "geolog_ci" {
  name = "geolog_ci"
  policy = "${data.aws_iam_policy_document.geolog_ci.json}"
}

resource "aws_iam_user_policy_attachment" "geolog_ci" {
  user = "${aws_iam_user.geolog_ci.name}"
  policy_arn = "${aws_iam_policy.geolog_ci.arn}"
}

data "aws_iam_policy_document" "geolog_ci" {
  statement {
    effect = "Allow"
    actions = [
      "s3:ListAllMyBuckets"
    ]
    resources = [
      "arn:aws:s3:::*"
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "s3:Get*",
      "s3:List*"
    ]
    resources = [
      "arn:aws:s3:::geolog-state-production/*"
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "s3:*"
    ]
    resources = [
      "arn:aws:s3:::blue.geolog.co",
      "arn:aws:s3:::blue.geolog.co/*",
      "arn:aws:s3:::green.geolog.co",
      "arn:aws:s3:::green.geolog.co/*",
      "arn:aws:s3:::assets.geolog.co",
      "arn:aws:s3:::assets.geolog.co/*"
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "apigateway:*"
    ]
    resources = [
      "arn:aws:apigateway:*::/*"
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "lambda:*"
    ]
    resources = [
      "${aws_lambda_function.geolog_api.arn}"
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "iam:PassRole"
    ]
    resources = [
      "${aws_iam_role.geolog_apigateway.arn}"
    ]
  }
}
