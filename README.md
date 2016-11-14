# geolog [![Coverage Status](https://coveralls.io/repos/github/michalc/geolog/badge.svg?branch=master)](https://coveralls.io/github/michalc/geolog?branch=master) [![CircleCI](https://circleci.com/gh/michalc/geolog.svg?style=shield)](https://circleci.com/gh/michalc/geolog)


## Generate private key and CSR

openssl genrsa -out private.key 2048
openssl req -new -sha256 -key private.key -out domain.csr

Certificates can be then generated at https://zerossl.com/, and then placed, with the private keys (which should *not* be committed!), in the certificates directory.


## Dashboards

- [Testing](https://www.hostedgraphite.com/560b32d8/ded17519-03d3-4c50-8c86-b7de0c58adb5/grafana/dashboard/db/tests)



-------

Copyright © 2016 Michal Charemza Limited 
