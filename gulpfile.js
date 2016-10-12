'use strict';

const AWS = require('aws-sdk');
const childProcess = require('child_process');
const concurrent = require('concurrent-transform');
const gulp = require('gulp');
const awspublish = require('gulp-awspublish');
const stream = require('stream');
const zip = require('gulp-zip');

AWS.config.region = 'eu-west-1';
AWS.config.credentials = new AWS.SharedIniFileCredentials({profile: 's3-geolog'});
const apigateway = new AWS.APIGateway();
const lambda = new AWS.Lambda();

const exec = childProcess.exec;

const LAMBDA_NAME = 'geolog'
const LAMBDA_ALIAS = 'prod'
const BUILD_DIR = 'build';
const API_GATEWAY_ID = '1jxogzz6a3';

function updateFunctionCodeAndAlias(zippedCode, functionName, functionAlias) {
  return lambda.updateFunctionCode({
    Publish: true,
    FunctionName: 'geolog',
    ZipFile: zippedCode
  }).promise().then(function(resource) {
    return lambda.updateAlias({
      FunctionName: functionName,
      FunctionVersion: resource.Version,
      Name: functionAlias
    }).promise();
  });
}

// One-time task
gulp.task('permit-lambda', function() {
  return lambda.addPermission({
    Action: 'lambda:InvokeFunction',
    FunctionName: 'geolog',
    Principal: 'apigateway.amazonaws.com',
    StatementId: 'api-gateway',
    Qualifier: 'prod'
  }).promise();
});

gulp.task('deploy-lambda', function(cb) {
  const files = gulp.src(['src/back/endpoint.js']);
  return files
    .pipe(zip('endpoint.zip'))
    .pipe(stream.Transform({
      objectMode: true,
      transform: function(file, enc, cb) {
        updateFunctionCodeAndAlias(file.contents, LAMBDA_NAME, LAMBDA_ALIAS).then(function() {
          cb();
        }, function(err) {
          cb(err);
        });
      }
    }));
});

gulp.task('validate-api', function(cb) {
  exec('./node_modules/swagger-tools/bin/swagger-tools validate ./src/api/schema.yaml', function (err, stdout, stderr) {
    cb(err);
  });
});

gulp.task('deploy-api', function (cb) {
  function putApi(yaml) {
    return apigateway.putRestApi({
      body: yaml,
      restApiId: API_GATEWAY_ID,
      mode: 'overwrite',
      failOnWarnings: true
    }).promise().then(function(api) {
      return apigateway.createDeployment({
        restApiId: API_GATEWAY_ID,
        stageName: 'prod',
      }).promise();
    });
  }

  const files = gulp.src(['src/api/schema.yaml']);
  return files.pipe(stream.Transform({
    objectMode: true,
    transform: function(file, enc, cb) {
      putApi(file.contents).then(function(res) {
        cb()
      }, function(err) {
        cb(err)
      });
    }
  }));
});


gulp.task('build-front', function() {
  const files = gulp.src(['src/front/index.html']);
  return files.pipe(gulp.dest('build'))
});

gulp.task('deploy-front', function() {
  const publisher = awspublish.create({
    region: 'eu-west-1',
    params: {
      Bucket: 'geolog.co'
    },
    credentials: new AWS.SharedIniFileCredentials({profile: 's3-geolog'})
  });

  // All files are forced since gulp-awspublish doesn't
  // sync if there are just http header changes
  function publish(headers) {
    return concurrent(publisher.publish(headers, {force: true}), 8);
  }

  // Cache 5 mins + gzip
  const index = gulp.src('index.html', {cwd: BUILD_DIR})
    .pipe(awspublish.gzip())
    .pipe(publish({
      'Cache-Control': 'max-age=' + 60 * 5 + ', no-transform, public'
    }));

  return index
    .pipe(publisher.sync())
    .pipe(awspublish.reporter());
});

gulp.task('default', ['build-front']);
