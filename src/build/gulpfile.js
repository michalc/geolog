'use strict';

const AWS = require('aws-sdk');
const browserify = require('browserify')
const browserifyShim = require('browserify-shim')
const childProcess = require('child_process');
const concurrent = require('concurrent-transform');
const del = require('del');
const gulp = require('gulp');
const awspublish = require('gulp-awspublish');
const concat = require('gulp-concat');
const connect = require('gulp-connect');
const coveralls = require('gulp-coveralls');
const decompress = require('gulp-decompress');
const eslint = require('gulp-eslint');
const filter = require('gulp-filter');
const htmlhint = require("gulp-htmlhint");
const istanbul = require('gulp-istanbul');
const mocha = require('gulp-mocha');
const rename = require('gulp-rename');
const uglify = require('gulp-uglify');
const zip = require('gulp-zip');
const http = require('http');
const mergeStream = require('merge-stream')
const pipe = require('multipipe')
const stream = require('stream');
const Vinyl = require('vinyl');
const buffer = require('vinyl-buffer');
const source = require('vinyl-source-stream');

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

// Slightly horrible that can't find a better (less global)
// way of getting this is the way to get options into the
// AWS SDK builder
process.env.MINIFY = '1'
process.env.AWS_SERVICES ='cognitoidentity'

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

function getApiSdk() {
  const source = stream.Readable({
    objectMode: true,
    read: function() {
    }
  });

  apigateway.getSdk({
    restApiId: API_GATEWAY_ID,
    stageName: API_GATEWAY_STAGE,
    sdkType: 'javascript'
  }).promise().then(function(response) {
    source.push(new Vinyl({
      path: 'api-gateway-client.zip',
      contents: response.body
    }));
    source.push(null);
  }).catch(function(err) {
    source.emit('error', err)
  });

  return pipe(
    source,
    decompress(),
    filter('apiGateway-js-sdk/**/*.js'),
    rename(function (path) {
      path.dirname = path.dirname.replace(/^apiGateway-js-sdk\/?/, '');
    })
  );
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
  const javascript = pipe(
    gulp.src(['src/**/*.js']),
    eslint(),
    eslint.format(),
    eslint.failAfterError()
  );

  const html = pipe(
    gulp.src(['src/**/*.html']),
    htmlhint(),
    htmlhint.failReporter()
  );

  return mergeStream(javascript, html);
});

gulp.task('test-cover', function () {
  return pipe(
    gulp.src(['src/**/*.js', '!src/**/*.spec.js']),
    istanbul(),
    istanbul.hookRequire()
  );
});

gulp.task('test', ['test-cover'], function() {
  return pipe(
    gulp.src('src/**/*.spec.js', {read: false}),
    mocha({reporter: 'nyan'}),
    istanbul.writeReports()
  );
});

gulp.task('test-and-coveralls', ['test'], function() {
  return pipe(
    gulp.src('coverage/lcov.info'),
    coveralls()
  );
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

gulp.task('deploy-back', function() {
  return pipe(
    gulp.src(['src/back/endpoint.js']),
    zip('endpoint.zip'),
    streamIfy(updateFunctionCodeAndAlias)
  );
});

gulp.task('validate-api', function(cb) {
  exec('node_modules/.bin/swagger-tools validate src/api/schema.yaml', function (err) {
    cb(err);
  });
});

gulp.task('deploy-api', function () {
  return pipe(
    gulp.src(['src/api/schema.yaml']),
    streamIfy(putAndDeployApi)
  );
});

gulp.task('clean-download', function() {
  return del(['download/**', '!download']);
});

gulp.task('fetch-api-client', ['clean-download'], function () {
  return pipe(
    getApiSdk(),
    concat('apigClientFactory.js'),
    gulp.dest('download/scripts')
  );
});

gulp.task('clean-front', function() {
  return del(['build/**', '!build']);
});

gulp.task('build-front', ['clean-front', 'fetch-api-client'], function() {
  const script = pipe(
    browserify({
      entries: 'src/front/scripts/app.js',
      transform: [browserifyShim]
    }).bundle(),
    source('app.js'),
    buffer(),
    uglify(),
    gulp.dest('build/scripts')
  );

  const files = pipe(
    gulp.src(['index.html'], {cwd: 'src/front', base: 'src/front'}),
    gulp.dest('build')
  );

  return mergeStream(script, files);
});

gulp.task('watch-front', function () {
  gulp.watch(['package.json', 'src/**/*'], ['build-front']);
});

gulp.task('serve-front', ['watch-front'], function() {
  return connect.server({
    root: 'build'
  });
});

gulp.task('serve-back', function() {
  const endpoint = require('../back/endpoint.js');
  http
    .createServer(function(request, response) {
      const lambdaRequest = {
        httpMethod: request.method,
        body: null, // Need to do something with request stream to get it?
      }
      endpoint.handler(lambdaRequest, null, function(err, json) {
        response.end(json.body);
      });
    })
    .listen(8081);
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
  const index = pipe(
    gulp.src('index.html', {cwd: BUILD_DIR, base: BUILD_DIR}),
    awspublish.gzip(),
    publish({
      'Cache-Control': 'max-age=' + 60 * 5 + ', no-transform, public',
      'Content-Type': 'text/html; charset=utf-8'
    })
  );

  // Cache 5 mins + gzip
  const js = pipe(
    gulp.src('scripts/**/*.js', {cwd: BUILD_DIR, base: BUILD_DIR}),
    awspublish.gzip(),
    publish({
      'Cache-Control': 'max-age=' + 60 * 5 + ', no-transform, public',
      'Content-Type': 'application/javascript; charset=utf-8'
    })
  );

  return pipe(
    mergeStream(index, js),
    publisher.sync()
  );
});

gulp.task('default', ['build-front']);
