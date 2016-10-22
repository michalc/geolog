/* global apigClientFactory */

var AWS = require('aws-sdk');
var apigClientFactory = require('apig-client-factory');

// Identity pool already configured to use roles
var creds = new AWS.CognitoIdentityCredentials({
  IdentityPoolId: 'eu-west-1:fdeb8cdc-38e2-4963-9578-5a4f03efdfed'
})

AWS.config.update({
  region: 'eu-west-1',
  credentials: creds
});


var apigClient = apigClientFactory.newClient({
  accessKey: creds.accessKeyId,
  secretKey: creds.secretAccessKey,
  sessionToken: creds.sessionToken, //OPTIONAL: If you are using temporary credentials you must include the session token
  region: 'eu-west-1'
});
apigClient.jobsIdGet({id:1}).then(function() {

});

creds.get(function() {
  // var apigClient = apigClientFactory.newClient({
  //   accessKey: creds.accessKeyId,
  //   secretKey: creds.secretAccessKey,
  //   sessionToken: creds.sessionToken, //OPTIONAL: If you are using temporary credentials you must include the session token
  //   region: 'eu-west-1'
  // });
  // apigClient.jobsIdGet({id:1}).then(function() {

  // });
});
