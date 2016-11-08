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

resource "aws_route53_record" "assets-geolog-co" {
  zone_id = "${aws_route53_zone.geolog-co.zone_id}"
  name = "assets.geolog.co."
  type = "A"

  alias {
    zone_id = "${aws_s3_bucket.assets-geolog-co.hosted_zone_id}"
    name = "${aws_s3_bucket.assets-geolog-co.website_domain}"
    evaluate_target_health = false
  }
}