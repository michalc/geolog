/* eslint-env browser */

'use strict';

const AWS = require('aws-sdk');
const apigClientFactory = require('./apigClientFactory');

// Identity pool already configured to use roles
const creds = new AWS.CognitoIdentityCredentials({
  IdentityPoolId: 'eu-west-1:fdeb8cdc-38e2-4963-9578-5a4f03efdfed'
})

AWS.config.update({
  region: 'eu-west-1',
  credentials: creds
});

creds.get(() => {
  const apigClient = apigClientFactory.newClient({
    accessKey: creds.accessKeyId,
    secretKey: creds.secretAccessKey,
    sessionToken: creds.sessionToken,
    region: 'eu-west-1'
  });
  apigClient.apiJobsIdGet({id:1}).then(() => {

  });
});
