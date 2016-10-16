'use strict';

exports.handler = (event, context, callback) => {

  const done = (err, res) => callback(null, {
    statusCode: err ? '400' : '200',
    body: err ? err.message : JSON.stringify(res),
    headers: {
      'Content-Type': 'application/json',
    },
  });

  switch (event.httpMethod) {
    case 'DELETE':
      done(null, 'Received DELETE');
      break;  
    case 'GET':
      done(null, 'Received GET');
      break;
    case 'POST':
      done(null, 'Received POST');
      break;
    case 'PUT':
      done(null, 'Received PUT');
      break;
    default:
      done(new Error(`Unsupported method "${event.httpMethod}"`));
  }
};
