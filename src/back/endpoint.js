'use strict';

exports.handler = (event, context, callback) => {

  const done = (err, res) => callback(null, {
    statusCode: err ? '400' : '200',
    body: err ? err.message : JSON.stringify(res),
    headers: {
      'Content-Type': 'application/json',
      // Proxy integrations can't transform the response
      'Access-Control-Allow-Headers' : "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
      'Access-Control-Allow-Methods' : "*",
      'Access-Control-Allow-Origin' : "*"
    }
  });

  switch (event.httpMethod) {
    case 'DELETE':
      done(null, {'message': 'Received DELETE'});
      break;  
    case 'GET':
      done(null, {'message': 'Received GET'});
      break;
    case 'POST':
      done(null, {'message': 'Received POST'});
      break;
    case 'PUT':
      done(null, {'message': 'Received PUT'});
      break;
    default:
      done(new Error(`Unsupported method "${event.httpMethod}"`));
  }
};
