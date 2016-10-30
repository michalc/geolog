'use strict';

exports.handler = (event, context, callback) => {
  const resourceHandler = resourceHandlers[event.resource];
  resourceHandler(event, context, callback);
};

const doneJson = (err, res, callback) => {
  callback(null, {
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
};

const doneHtml = (err, res, callback) => {
  callback(null, {
    statusCode: 200,
    body: res,
    headers: {
      'Content-Type': 'text/html; charset=utf-8'
    }
  });
};

// These must match the resources/paths setup in the API definition
// Could have separate lambda functions for all, but would make
// deployment more complex
const resourceHandlers = {
  '/': (event, context, callback) => {
    doneHtml(null, '<html><body><p>This is <strong>some</strong> html</p>' + JSON.stringify(event) + '</body></html>', callback);
  },
  '/api/jobs/{id}': (event, context, callback) => {
    doneJson(null, {'message': 'Received PUT', 'event': event, 'context': context}, callback);
  }
};
