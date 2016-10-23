/* eslint-env node, mocha */

const assert = require('assert');

const endpoint = require('./endpoint.js');

describe('endpoint', () => { 
  describe('GET', () => {
    it('should pass JSON with statusCode of 200', (done) => {
      endpoint.handler({httpMethod: 'GET'}, null, (err, json) => {
        assert.equal(json.statusCode, 200);
        done();
      }); 
    });
  });
});
