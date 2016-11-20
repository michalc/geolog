'use strict';

class Api {
  constructor(AWS, apigClientFactory) {
    console.log(AWS)
    const creds = new AWS.CognitoIdentityCredentials({
      IdentityPoolId: 'eu-west-1:fdeb8cdc-38e2-4963-9578-5a4f03efdfed'
    });

    AWS.config.update({
      region: 'eu-west-1',
      credentials: creds
    });

    this.creds = creds.getPromise().then(() => {
      return creds;
    });

    this.apigClient = this.creds.then(() => {
      return apigClientFactory.newClient({
        accessKey: creds.accessKeyId,
        secretKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
        region: 'eu-west-1'
      });    
    });
  }

  getJob() {
    this.apigClient().then((client) => {
      return apigClient.apiJobsIdGet({id:1});
    });
  }
}

module.exports = Api;
