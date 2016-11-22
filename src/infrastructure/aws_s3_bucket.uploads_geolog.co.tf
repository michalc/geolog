output "aws_s3_bucket.uploads_geolog_co.id" {
  value = "${aws_s3_bucket.uploads_geolog_co.id}"
}

resource "aws_s3_bucket" "uploads_geolog_co" {
  bucket = "uploads.geolog.co"

  cors_rule {
    allowed_headers = [
      #"x-amz-*",
      "authorization",
      "content-type",
      "x-amz-date",
      "x-amz-security-token",
      "x-amz-user-agent"
    ]
    allowed_methods = [
      "PUT",
    ]
    allowed_origins = [
      "http://localhost:8080",
      "https://certification.geolog.co",
      "https://geolog.co",
    ]
    # Options requests needed every time 
    max_age_seconds = 0
  }
}

data "aws_iam_policy_document" "geolog_cognito_upload" {
  statement {
    sid = ""
    effect = "Allow"
    actions = [
      "s3:PutObject"
    ]
    resources = [
      "${aws_s3_bucket.uploads_geolog_co.arn}/$${cognito-identity.amazonaws.com:sub}/*"
    ]
  }
}

resource "aws_iam_policy" "geolog_cognito_upload" {
  name = "geolog_cognito_upload"
  policy = "${data.aws_iam_policy_document.geolog_cognito_upload.json}"
}

resource "aws_iam_role_policy_attachment" "geolog_cognito_upload" {
  role = "${aws_iam_role.geolog_cognito_unauthenticated.name}"
  policy_arn = "${aws_iam_policy.geolog_cognito_upload.arn}"
}
