provider "aws" {
  region = "eu-west-1"
}

resource "aws_s3_bucket" "assets-geolog-co" {
  bucket = "assets.geolog.co"
  acl = "public-read"
  website {
    index_document = "index.html"
  }
}

resource "aws_s3_bucket_policy" "assets-geolog-co" {
  bucket = "${aws_s3_bucket.assets-geolog-co.bucket}"
  policy = "${data.aws_iam_policy_document.assets-geolog-co.json}"
}

data "aws_iam_policy_document" "assets-geolog-co" {
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
      "arn:aws:s3:::${aws_s3_bucket.assets-geolog-co.bucket}/*"
    ]
  }
}
