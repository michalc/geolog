resource "aws_s3_bucket" "green_geolog_co" {
  bucket = "green.geolog.co"
  website {
    index_document = "index.html"
  }
}

# We don't need DNS records. All access goes via the APIGateway
