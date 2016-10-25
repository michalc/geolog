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
const rev = require('gulp-rev');
const revReplace = require('gulp-rev-replace');
// const uglify = require('gulp-uglify');
const gutil = require('gulp-util');
const webdriver = require('gulp-webdriver');
const zip = require('gulp-zip');
const http = require('http');
const mergeStream = require('merge-stream')
const pipe = require('multipipe');  // multipipe forwards errors, which is good!
const stream = require('stream');
const Vinyl = require('vinyl');
const buffer = require('vinyl-buffer');
const source = require('vinyl-source-stream');

AWS.config.region = 'eu-west-1';
AWS.config.credentials = new AWS.SharedIniFileCredentials({profile: 'default'});
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
  }).promise().then((resource) => {
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
  }).promise().then(() => {
    return apigateway.createDeployment({
      restApiId: API_GATEWAY_ID,
      stageName: API_GATEWAY_STAGE,
    }).promise();
  });
}

function getApiSdk() {
  const source = stream.Readable({
    objectMode: true,
    read: () => {
    }
  });

  apigateway.getSdk({
    restApiId: API_GATEWAY_ID,
    stageName: API_GATEWAY_STAGE,
    sdkType: 'javascript'
  }).promise().then((response) => {
    source.push(new Vinyl({
      path: 'api-gateway-client.zip',
      contents: response.body
    }));
    source.push(null);
  }).catch((err) => {
    source.emit('error', err)
  });

  return pipe(
    source,
    decompress(),
    filter('apiGateway-js-sdk/**/*.js'),
    rename((path) => {
      path.dirname = path.dirname.replace(/^apiGateway-js-sdk\/?/, '');
    })
  );
}

// Returns a function that calls the original,
// calling the cb on promise success/failure as appropriate
function callbackIfy(original, cb) {
  return (...args) => {
    original.apply(this, args).then(() => {
      cb();
    }, (err) => {
      cb(err || true);
    });
  }
}

// Returns a transform stream that calls (a callbackIfied version of)
// the original function for each file contents in the stream
function streamIfy(original) {
  return stream.Transform({
    objectMode: true,
    transform: (file, enc, cb) => {
      callbackIfy(original, cb)(file.contents);
    }
  });
}

// Annoyling mergeStream does not propagate errors
function mergeWithErrors() {
  const merged = mergeStream.apply(null, arguments);
  for (let stream of arguments) {
    stream.on('error', (error) => {
      merged.emit('error', error);
    });
  }
  return merged
}

gulp.task('lint', () => {
  const javascript = pipe(
    gulp.src(['src/**/*.js']),
    eslint(),
    eslint.format(),
    eslint.results((results/*, cb */) => {
      if (results.errorCount) {
        // If using cb, gulp-eslint throws an exception,
        // rather than just emitting an error, which causes
        // an non-helpful stack strace
        javascript.emit('error', new gutil.PluginError('eslint', {
          message: 'Failed linting'
        }));
      }
    })
  );

  const html = pipe(
    gulp.src(['src/**/*.html']),
    htmlhint(),
    htmlhint.failReporter()
  );

  return mergeWithErrors(javascript, html);
});

gulp.task('test-cover', () => {
  return pipe(
    gulp.src(['src/**/*.js', '!src/**/*.spec.js']),
    istanbul(),
    istanbul.hookRequire()
  );
});

gulp.task('test', ['test-cover'], () => {
  const RESULTS_DIR = (process.env.CIRCLECI ? process.env.CIRCLE_TEST_REPORTS + '/' : '') + 'results'
  gutil.log('RESULTS_DIR=' + RESULTS_DIR)

  return pipe(
    gulp.src(['src/back/**/*.spec.js', 'src/front/**/*.spec.js'], {read: false}),
    mocha({
    }),
    mocha({
      reporter: 'mocha-junit-reporter',
      reporterOptions: {
        mochaFile: RESULTS_DIR + '/unit.xml'
      }
    }),
    istanbul.writeReports()
  );
});

gulp.task('test-and-coveralls', ['test'], () => {
  return pipe(
    gulp.src('coverage/lcov.info'),
    coveralls()
  );
});

// One-time task
gulp.task('permit-lambda', () => {
  return lambda.addPermission({
    Action: 'lambda:InvokeFunction',
    FunctionName: 'geolog',
    Principal: 'apigateway.amazonaws.com',
    StatementId: 'api-gateway',
    Qualifier: 'prod'
  }).promise();
});

gulp.task('deploy-back', () => {
  return pipe(
    gulp.src(['src/back/endpoint.js']),
    zip('endpoint.zip'),
    streamIfy(updateFunctionCodeAndAlias)
  );
});

gulp.task('validate-api', (cb) => {
  exec('node_modules/.bin/swagger-tools validate src/api/schema.yaml', (err) => {
    cb(err);
  });
});

gulp.task('deploy-api', () => {
  return pipe(
    gulp.src(['src/api/schema.yaml']),
    streamIfy(putAndDeployApi)
  );
});

gulp.task('clean-download', () => {
  return del(['download/**', '!download']);
});

gulp.task('fetch-api-client', ['clean-download'], () => {
  return pipe(
    getApiSdk(),
    concat('apigClientFactory.js'),
    gulp.dest('download/scripts')
  );
});

gulp.task('clean-front', () => {
  return del(['build/**', '!build']);
});

gulp.task('build-front', ['clean-front', 'fetch-api-client'], () => {
  const scripts = pipe(
    browserify({
      entries: 'src/front/scripts/app.js',
      transform: [browserifyShim]
    }).bundle(),
    source('scripts/app.js'),
    buffer(),
    // uglify(),
    rev(),
    gulp.dest('build'),
    rev.manifest()
  );

  const files = pipe(
    gulp.src(['index.html'], {cwd: 'src/front', base: 'src/front'}),
    revReplace({manifest: scripts}),
    gulp.dest('build')
  );

  return mergeWithErrors(scripts, files);
});

gulp.task('test-e2e', ['build-front'], () => {
  connect.server({
    root: 'build'
  });

  const tests = pipe(
    gulp.src('wdio.conf.js'),
    webdriver()
  );

  tests.on('end', () => {
    connect.serverClose();
  });

  return tests;
});

gulp.task('watch-front', () => {
  gulp.watch(['package.json', 'src/**/*'], ['build-front']);
});

gulp.task('serve-front', () => {
  return connect.server({
    root: 'build'
  });
});

gulp.task('serve-back', () => {
  const endpoint = require('../back/endpoint.js');
  http
    .createServer((request, response) => {
      const lambdaRequest = {
        httpMethod: request.method,
        body: null, // Need to do something with request stream to get it?
      }
      endpoint.handler(lambdaRequest, null, (err, json) => {
        response.end(json.body);
      });
    })
    .listen(8081);
});

gulp.task('deploy-front', ['test-e2e'], () => {
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
    mergeWithErrors(index, js),
    publisher.sync()
  );
});

gulp.task('ci-test', ['test']);

gulp.task('ci-deploy', ['deploy-front']);

gulp.task('default', ['test']);
