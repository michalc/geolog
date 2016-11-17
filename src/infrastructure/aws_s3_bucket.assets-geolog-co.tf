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
    zone_id = "${aws_cloudfront_distribution.assets-geolog-co.hosted_zone_id}"
    name = "${aws_cloudfront_distribution.assets-geolog-co.domain_name}"
    evaluate_target_health = false
  }
}

resource "aws_cloudfront_distribution" "assets-geolog-co" {
  origin {
    domain_name = "assets.geolog.co.s3.amazonaws.com"
    origin_id   = "assets.geolog.co"
  }

  enabled             = true
  default_root_object = "index.html"

  aliases = ["assets.geolog.co"]

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "assets.geolog.co"

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "https-only"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  price_class = "PriceClass_All"

  viewer_certificate {
    ssl_support_method = "sni-only"
    minimum_protocol_version = "TLSv1"

    # Must be manually setup, and aws_acm_certificate data
    # causes a crash of Terraform. Gah!
    acm_certificate_arn = "arn:aws:acm:us-east-1:772663561820:certificate/24f883f9-200f-49cb-8af4-6dff4af36997"
  }
}
