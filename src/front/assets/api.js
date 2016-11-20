'use strict';

class Api {
  constructor(
    AWS,
    apigClientFactory,
    region,
    identityPoolId,
  ) {
    const creds = new AWS.CognitoIdentityCredentials({
      IdentityPoolId: identityPoolId
    });

    AWS.config.update({
      region: region,
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
        region: region
      });    
    });
  }

  getJob() {
    this.apigClient.then((client) => {
      return client.apiJobsIdGet({id:1});
    });
  }
}

module.exports = Api;
