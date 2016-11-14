resource "aws_api_gateway_domain_name" "geolog_co" {
  domain_name = "geolog.co"

  certificate_name = "geolog.co"
  certificate_body = "${file("${path.root}/certificates/geolog.co/body.crt")}"
  certificate_chain = "${file("${path.root}/certificates/geolog.co/chain.crt")}"
  certificate_private_key = "${file("${path.root}/certificates/geolog.co/private.key")}"
}

resource "aws_route53_record" "geolog_co" {
  zone_id = "${aws_route53_zone.geolog-co.zone_id}"
  name = "geolog.co."
  type = "A"

  alias {
    zone_id = "${aws_api_gateway_domain_name.geolog_co.cloudfront_zone_id}"
    name = "${aws_api_gateway_domain_name.geolog_co.cloudfront_domain_name}"
    evaluate_target_health = false
  }
}

resource "aws_api_gateway_domain_name" "certification_geolog_co" {
  domain_name = "certification.geolog.co"

  certificate_name = "certification.geolog.co"
  certificate_body = "${file("${path.root}/certificates/certification.geolog.co/body.crt")}"
  certificate_chain = "${file("${path.root}/certificates/certification.geolog.co/chain.crt")}"
  certificate_private_key = "${file("${path.root}/certificates/certification.geolog.co/private.key")}"
}

resource "aws_route53_record" "certification_geolog_co" {
  zone_id = "${aws_route53_zone.geolog-co.zone_id}"
  name = "certification.geolog.co."
  type = "A"

  alias {
    zone_id = "${aws_api_gateway_domain_name.certification_geolog_co.cloudfront_zone_id}"
    name = "${aws_api_gateway_domain_name.certification_geolog_co.cloudfront_domain_name}"
    evaluate_target_health = false
  }
}
