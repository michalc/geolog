resource "aws_s3_bucket" "blue_geolog_co" {
  bucket = "blue.geolog.co"
  website {
    index_document = "index.html"
  }
}

# We don't need DNS records. All access goes via the APIGateway
