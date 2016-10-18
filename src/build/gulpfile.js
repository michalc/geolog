'use strict';

const AWS = require('aws-sdk');
const childProcess = require('child_process');
const concurrent = require('concurrent-transform');
const gulp = require('gulp');
const awspublish = require('gulp-awspublish');
const connect = require('gulp-connect');
const coveralls = require('gulp-coveralls');
const eslint = require('gulp-eslint');
const htmlhint = require("gulp-htmlhint");
const istanbul = require('gulp-istanbul');
const mocha = require('gulp-mocha');
const zip = require('gulp-zip');
const mergeStream = require('merge-stream')
const stream = require('stream');


AWS.config.region = 'eu-west-1';
AWS.config.credentials = new AWS.SharedIniFileCredentials({profile: 's3-geolog'});
const apigateway = new AWS.APIGateway();
const lambda = new AWS.Lambda();

const exec = childProcess.exec;

const LAMBDA_NAME = 'geolog'
const LAMBDA_ALIAS = 'prod'
const BUILD_DIR = 'build';
const API_GATEWAY_ID = '1jxogzz6a3';
const API_GATEWAY_STAGE = 'prod';

function updateFunctionCodeAndAlias(zippedCode) {
  return lambda.updateFunctionCode({
    Publish: true,
    FunctionName: 'geolog',
    ZipFile: zippedCode
  }).promise().then(function(resource) {
    return lambda.updateAlias({
      FunctionName: LAMBDA_NAME,
      FunctionVersion: resource.Version,
      Name: LAMBDA_ALIAS
    }).promise();
  });
}

function putAndDeployApi(schema) {
  return apigateway.putRestApi({
    body: schema,
    restApiId: API_GATEWAY_ID,
    mode: 'overwrite',
    failOnWarnings: true
  }).promise().then(function() {
    return apigateway.createDeployment({
      restApiId: API_GATEWAY_ID,
      stageName: API_GATEWAY_STAGE,
    }).promise();
  });
}

// Returns a function that calls the original,
// calling the cb on promise success/failure as appropriate
function callbackIfy(original, cb) {
  return function() {
    original.apply(this, arguments).then(function() {
      cb();
    }, function(err) {
      cb(err || true);
    });
  }
}

// Returns a transform stream that calls (a callbackIfied version of)
// the original function for each file contents in the stream
function streamIfy(original) {
  return stream.Transform({
    objectMode: true,
    transform: function(file, enc, cb) {
      callbackIfy(original, cb)(file.contents);
    }
  });
}

gulp.task('lint', function() {
  const javascript = gulp.src(['src/**/*.js'])
    .pipe(eslint())
    .pipe(eslint.format())
    .pipe(eslint.failAfterError());

  const html = gulp.src(['src/**/*.html'])
    .pipe(htmlhint())
    .pipe(htmlhint.failReporter());

  return mergeStream(javascript, html);
});

gulp.task('pre-test', function () {
  return gulp.src(['src/**/*.js', '!src/**/*.spec.js'])
    .pipe(istanbul())
    .pipe(istanbul.hookRequire());
});

gulp.task('test', ['pre-test'], function() {
  return gulp.src('src/**/*.spec.js', {read: false})
    .pipe(mocha({reporter: 'nyan'}))
    .pipe(istanbul.writeReports());
});

gulp.task('test-and-coveralls', ['test'], function() {
  return gulp.src('coverage/lcov.info')
    .pipe(coveralls());
});

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

gulp.task('deploy-lambda', function() {
  const files = gulp.src(['src/back/endpoint.js']);
  return files
    .pipe(zip('endpoint.zip'))
    .pipe(streamIfy(updateFunctionCodeAndAlias));
});

gulp.task('validate-api', function(cb) {
  exec('npm bin swagger-tools validate src/api/schema.yaml', function (err) {
    cb(err);
  });
});

gulp.task('deploy-api', function () {
  const files = gulp.src(['src/api/schema.yaml']);
  return files.pipe(streamIfy(putAndDeployApi));
});

gulp.task('build-front', function() {
  const files = gulp.src(['src/front/index.html']);
  return files.pipe(gulp.dest('build'))
});

gulp.task('watch-front', function () {
  gulp.watch(['src/front/**/*.html'], ['build-front']);
});

gulp.task('serve-front', ['watch-front'], function() {
  return connect.server({
    root: 'build'
  });
});

gulp.task('deploy-front', function() {
  const publisher = awspublish.create({
    params: {
      Bucket: 'geolog.co'
    }
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
