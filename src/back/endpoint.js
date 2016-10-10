'use strict';

console.log('Loading function');

exports.handler = (event, context, callback) => {
    console.log('Received event:', JSON.stringify(event, null, 2));

    const done = (err, res) => callback(null, {
        statusCode: err ? '400' : '200',
        body: err ? err.message : JSON.stringify(res),
        headers: {
            'Content-Type': 'application/json',
        },
    });

    switch (event.httpMethod) {
        case 'DELETE':
        	done(null, 'done4!');
            break;  
        case 'GET':
        	done(null, 'done4!');
            break;
        case 'POST':
        	done(null, 'done4!');
            break;
        case 'PUT':
        	done(null, 'done4!');
            break;
        default:
            done(new Error(`Unsupported method "${event.httpMethod}"`));
    }
};
