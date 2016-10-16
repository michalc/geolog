/* eslint-env node, mocha */

const assert = require('assert');

const endpoint = require('./endpoint.js');

describe('endpoint', function() { 
  describe('GET', function() {
    it('should pass JSON with statusCode of 200', function(done) {
      endpoint.handler({httpMethod: 'GET'}, null, function(err, json) {
        assert.equal(json.statusCode, 200);
        done();
      }); 
    });
  });
});
