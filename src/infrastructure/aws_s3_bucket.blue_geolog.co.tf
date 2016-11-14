resource "aws_s3_bucket" "blue_geolog_co" {
  bucket = "blue.geolog.co"
  acl = "public-read"
  website {
    index_document = "index.html"
  }
}

resource "aws_s3_bucket_policy" "blue_geolog_co" {
  bucket = "${aws_s3_bucket.blue_geolog_co.bucket}"
  policy = "${data.aws_iam_policy_document.blue_geolog_co.json}"
}

data "aws_iam_policy_document" "blue_geolog_co" {
  statement {
    sid = "AddPerm"
    effect = "Allow"
    principals = [{
      type = "AWS"
      identifiers = ["*"]
    }]
    actions = [
      "s3:GetObject"
    ]
    resources = [
      "arn:aws:s3:::${aws_s3_bucket.blue_geolog_co.bucket}/*"
    ]
  }
}

# We don't need DNS records. All access goes via the APIGateway
