'use strict';

const generateProbablyUniqueGuid = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
}

class Api {
  constructor(
    AWS,
    config,
    stateChange
  ) {
    this.AWS = AWS;
    this.config = config;
    this.uploadBucket = config.uploadBucket;
    this.stateChange = stateChange;
    this.loginStatus = 'unknown';
    console.log(stateChange);


    AWS.config.update({
      region: config.region
      //credentials: creds
    });


    // const creds = new this.AWS.CognitoIdentityCredentials({
    //   IdentityPoolId: config.identityPoolId
    // });



    // this.creds = creds.getPromise().then(() => {
    //   return creds;
    // });
  }

  setInitialLoginStatus() {
    FB.getLoginStatus((response) => {
      console.log('initialResponse', response);
      this.handleFbStatusResponse(response);
    });  
  }

  upload(file) {
    this.creds.then((credentials) => {
      // We are only allowed to overwrite keys
      // with the current user's id as a prefix. At
      // worst, a user can mess-up their own previous
      // upload, so a probably unique ID is enough
      const keySuffix = generateProbablyUniqueGuid();

      const s3 = new this.AWS.S3({
        credentials: credentials
      });
      s3.putObject({
        Bucket: this.uploadBucket,
        Key: credentials.identityId + '/' + keySuffix,
        Body: file
      }).promise().then(() => {
      }, () => {
      });  
    })
  }

  getLoginStatus() {
    return this.loginStatus;
  }

  fbLogin() {
    FB.login((response) => {
      return this.handleFbStatusResponse(response);
    });
  }

  fbLogout() {
    FB.logout((response) => {
      return this.handleFbStatusResponse(response);
    });
  }

  handleFbStatusResponse(response) {
    this.fbStatus = response;
    console.log('response', response);
    const creds = (new this.AWS.CognitoIdentityCredentials({
      IdentityPoolId: this.config.identityPoolId,
      Logins: response.authResponse && response.status == 'connected' ? {
        'graph.facebook.com': response.authResponse.accessToken
      } : {}
    }))
    creds.getPromise().then(() =>{
      console.log('new creds', creds);
      this.loginStatus = !creds.expired && creds.params.Logins['graph.facebook.com'] ? 'logged-in' : 'logged-out'
      console.log('loginstatus', this.loginStatus);
      this.stateChange();
      return creds;
    });
  }
}

module.exports = Api;
