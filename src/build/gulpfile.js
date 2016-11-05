'use strict';

const parallelLimit = require('async/parallelLimit');
const AWS = require('aws-sdk');
const browserify = require('browserify')
const browserifyShim = require('browserify-shim')
const childProcess = require('child_process');
const concurrent = require('concurrent-transform');
const del = require('del');
const gulp = require('gulp');
const awspublish = require('gulp-awspublish');
const connect = require('gulp-connect');
const coveralls = require('gulp-coveralls');
const eslint = require('gulp-eslint');
const handlebars = require('gulp-compile-handlebars');
const htmlhint = require("gulp-htmlhint");
const istanbul = require('gulp-istanbul');
const mocha = require('gulp-mocha');
const rev = require('gulp-rev');
const revReplace = require('gulp-rev-replace');
// const uglify = require('gulp-uglify');
const gutil = require('gulp-util');
const webdriver = require('gulp-webdriver');
const zip = require('gulp-zip');
const http = require('http');
const mergeStream = require('merge-stream')
const net = require('net');
const stream = require('stream');
const buffer = require('vinyl-buffer');
const source = require('vinyl-source-stream');

AWS.config.region = 'eu-west-1';
AWS.config.credentials = new AWS.SharedIniFileCredentials({profile: 'default'});
const apigateway = new AWS.APIGateway();
const lambda = new AWS.Lambda();

const exec = childProcess.exec;

const LAMBDA_NAME = 'geolog-api';
// There is no production lambda alias.
// The certification alias is for debugging
const LAMBDA_ALIAS_CERTIFICATION = 'certification';
const BUILD_DIR = 'build';
const API_GATEWAY_ID = '1jxogzz6a3';
const API_GATEWAY_STAGE_CERTIFICATION = 'certification';
const API_GATEWAY_STAGE_PRODUCTION = 'production';

// Slightly horrible that can't find a better (less global)
// way of getting this is the way to get options into the
// AWS SDK builder
process.env.MINIFY = '1'
process.env.AWS_SERVICES ='cognitoidentity'

const RESULTS_DIR = (process.env.CIRCLECI ? process.env.CIRCLE_TEST_REPORTS + '/' : '') + 'results'
const COVERAGE_DIR = RESULTS_DIR + '/coverage'

const HOSTED_GRAPHITE_API_KEY = process.env.HOSTED_GRAPHITE_API_KEY;

const NEXT_DEPLOYMENTS = {
  'blue': 'green',
  'green': 'blue',
};

const BUCKETS = {
  'assets': 'assets.geolog.co',
  'blue': 'blue.geolog.co',
  'green': 'green.geolog.co'
};

function updateLambda(zippedCode) {
  gutil.log('Updating lambda');
  return lambda.updateFunctionCode({
    Publish: true,
    FunctionName: 'geolog-api',
    ZipFile: zippedCode
  }).promise().then((resource) => {
    gutil.log('Lambda updated with version: ' + resource.Version);
    return lambda.updateAlias({
      FunctionName: LAMBDA_NAME,
      FunctionVersion: resource.Version,
      Name: LAMBDA_ALIAS_CERTIFICATION
    }).promise();
  });
}

// Slightly horrible way of getting current deployment,
// but it has the benefit of getting it from the actual
// deployment as AWS sees it (not via Cloud Front), and so
function getCurrentDeployment() {
  return apigateway.getExport({
    restApiId: API_GATEWAY_ID,
    stageName: API_GATEWAY_STAGE_PRODUCTION,
    exportType: 'swagger',
    accepts: 'application/json',
    parameters: {extensions: 'integrations,authorizers'}
  }).promise().then((result) => {
    const swagger = JSON.parse(result.body);
    const deploymentResponse = swagger.paths['/_deployment'].get['x-amazon-apigateway-integration'].responses.default.responseTemplates['application/json'];
    const deployment = JSON.parse(deploymentResponse).deployment;
    return deployment;
  });
}

function getNextDeployment() {
  return getCurrentDeployment().then((deployment) => {
    return NEXT_DEPLOYMENTS[deployment];
  });
}

function apiDeployToCertification(schema) {
  gutil.log('Deploying API to certification');
  return apigateway.putRestApi({
    body: schema,
    restApiId: API_GATEWAY_ID,
    mode: 'overwrite',
    failOnWarnings: true
  }).promise().then(() => {
    return apigateway.createDeployment({
      restApiId: API_GATEWAY_ID,
      stageName: API_GATEWAY_STAGE_CERTIFICATION,
    }).promise();
  }).then((res) => {
    gutil.log('Deployed to certification: ' + res.id);
  });
}

function apiDeployToProduction() {
  return apigateway.getStage({
    restApiId: API_GATEWAY_ID,
    stageName: API_GATEWAY_STAGE_CERTIFICATION,
  }).promise().then((certificationStage) => {
    gutil.log('Deploying to production: ' + certificationStage.deploymentId)
    return apigateway.updateStage({
      restApiId: API_GATEWAY_ID,
      stageName: API_GATEWAY_STAGE_PRODUCTION,
      patchOperations: [{
        op: 'replace',
        path: '/deploymentId',
        value: certificationStage.deploymentId
      }]
    }).promise();
  });
}

// Returns a transform stream that calls the original
// function for each file contents in the stream
function streamIfy(original) {
  return stream.Transform({
    objectMode: true,
    transform: function (file, enc, callback) {
      original(file.contents).then((results) => {
        this.push(results);
        callback();
      }, (error) => {
        this.emit('error', error);
      });
    }
  });
}

function streamToPromise(stream) {
  return new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

function submitMetric(name, value, callback) {
  const socket = net.createConnection(2003, "560b32d8.carbon.hostedgraphite.com", () => {
    socket.write(HOSTED_GRAPHITE_API_KEY + "." + name + " " + value + "\n");
    socket.end();
    callback();
  });
}

function submitMetrics(data, callback) {
  const funcs = data.map((point) => {
    return (callback) => submitMetric(point.name, point.value, callback);
  });
  parallelLimit(funcs, 16, callback)
}

gulp.task('lint', () => {
  const javascript = gulp.src(['src/**/*.js'])
    .pipe(eslint())
    .pipe(eslint.format());

  const html = gulp.src(['src/**/*.html'])
    .pipe(htmlhint())
    .pipe(htmlhint.failReporter());

  return mergeStream(javascript, html);
});

gulp.task('test-unit-coverage-setup', () => {
  return gulp.src(['src/**/*.js', '!src/**/*.spec.js'])
    .pipe(istanbul())
    .pipe(istanbul.hookRequire());
});

gulp.task('test-unit-run', () => {
  return gulp.src(['src/back/**/*.spec.js', 'src/front/**/*.spec.js'], {read: false})
    .pipe(mocha({
    }))
    .pipe(mocha({
      reporter: 'mocha-junit-reporter',
      reporterOptions: {
        mochaFile: RESULTS_DIR + '/unit.xml'
      }
    }))
    .pipe(istanbul.writeReports({
      dir: COVERAGE_DIR
    }));
});

gulp.task('test-unit-coverage-submit-graphana', (cb) => {
  const coverage = istanbul.summarizeCoverage();
  submitMetrics([
    {name: "test.unit.lines.total", value: coverage.lines.total},
    {name: "test.unit.lines.covered", value: coverage.lines.covered},
    {name: "test.unit.lines.skipped", value: coverage.lines.skipped},
    {name: "test.unit.statements.total", value: coverage.statements.total},
    {name: "test.unit.statements.covered", value: coverage.statements.covered},
    {name: "test.unit.statements.skipped", value: coverage.statements.skipped},
    {name: "test.unit.functions.total", value: coverage.functions.total},
    {name: "test.unit.functions.covered", value: coverage.functions.covered},
    {name: "test.unit.functions.skipped", value: coverage.functions.skipped},
    {name: "test.unit.branches.total", value: coverage.branches.total},
    {name: "test.unit.branches.covered", value: coverage.branches.covered},
    {name: "test.unit.branches.skipped", value: coverage.branches.skipped}
  ], cb);
});

gulp.task('test-unit-coverage-submit-coveralls', () => {
  return gulp.src(COVERAGE_DIR + '/lcov.info')
    .pipe(coveralls());
});

gulp.task('static-analysis-run', (cb) => {
  exec('node_modules/.bin/cr --output ' + RESULTS_DIR + '/complexity.json --format json src', (err) => {
    cb(err);
  });
});

gulp.task('static-analysis-submit-graphana', () => {
  return gulp.src([RESULTS_DIR + '/complexity.json'])
    .pipe(stream.Transform({
      objectMode: true,
      transform: function(file, enc, callback) {
        const complexity = JSON.parse(file.contents);
        submitMetrics([
          {name: "analysis.static.firstOrderDensity", value: complexity.firstOrderDensity},
          {name: "analysis.static.changeCost", value: complexity.changeCost},
          {name: "analysis.static.coreSize", value: complexity.coreSize},
          {name: "analysis.static.loc", value: complexity.loc},
          {name: "analysis.static.cyclomatic", value: complexity.cyclomatic},
          {name: "analysis.static.effort", value: complexity.effort},
          {name: "analysis.static.params", value: complexity.params},
          {name: "analysis.static.maintainability", value: complexity.maintainability}
        ], callback);

        // complexity.reports.forEach((report) => {
        //   console.log(report.path);
        // });
      }
    }));
});

// One-time task
gulp.task('permit-lambda', () => {
  return lambda.addPermission({
    Action: 'lambda:InvokeFunction',
    FunctionName: 'geolog-api',
    Principal: 'apigateway.amazonaws.com',
    StatementId: 'api-gateway',
    Qualifier: 'production'
  }).promise();
});

gulp.task('back-deploy', () => {
  return gulp.src(['src/back/index.js'])
    .pipe(zip('index.zip'))
    .pipe(streamIfy(updateLambda))
});

gulp.task('api-validate', (cb) => {
  exec('node_modules/.bin/swagger-tools validate src/api/schema.yml', (err) => {
    cb(err);
  });
});

gulp.task('get-current-deployment', () => {
  return getCurrentDeployment();
});

gulp.task('api-deploy-certification', () => {
  const lambdaPromise = lambda.getAlias({
    FunctionName: LAMBDA_NAME,
    Name: LAMBDA_ALIAS_CERTIFICATION
  }).promise().then((alias) => {
    return alias.FunctionVersion;
  });

  const deploymentPromise = getNextDeployment();

  return Promise.all([lambdaPromise, deploymentPromise]).then((results) => {
    const lambdaVersion = results[0];
    const deployment = results[1];

    gutil.log('Deploying API as \'' + deployment + '\' with lambda version ' + lambdaVersion);

    return streamToPromise(gulp.src(['src/api/schema.yml'])
      .pipe(handlebars({
        deployment: deployment,
        lambdaVersion: lambdaVersion
      }))
      .pipe(streamIfy(apiDeployToCertification))
    )
  });
});

gulp.task('api-deploy-to-production', () => {
  return apiDeployToProduction();
});

gulp.task('front-clean', () => {
  return del(['build/**', '!build']);
});

gulp.task('front-build', () => {
  const scripts = browserify({
      entries: 'src/front/assets/app.js',
      transform: [browserifyShim]
    }).bundle()
    .pipe(source('assets/app.js'))
    .pipe(buffer())
    // uglify(),
    .pipe(rev())
    .pipe(gulp.dest('build'))
    .pipe(rev.manifest());

  const files = gulp.src(['index.html'], {cwd: 'src/front', base: 'src/front'})
    .pipe(revReplace({manifest: scripts}))
    .pipe(gulp.dest('build'));

  return mergeStream(scripts, files);
});

gulp.task('test-e2e-run', () => {
  return gulp.src('wdio.conf.js')
    .pipe(webdriver());
});

gulp.task('front-watch', () => {
  gulp.watch(['package.json', 'src/**/*'], ['front-build']);
});

gulp.task('front-serve', () => {
  return connect.server({
    root: 'build'
  });
});

gulp.task('back-serve', () => {
  const index = require('../back/index.js');
  http
    .createServer((request, response) => {
      const lambdaRequest = {
        httpMethod: request.method,
        body: null, // Need to do something with request stream to get it?
      }
      index.handler(lambdaRequest, null, (err, json) => {
        response.end(json.body);
      });
    })
    .listen(8081);
});

// All assets have MD5-cachebusted names,
// so they can be deployed to live
gulp.task('front-assets-deploy-production', () => {
  const publisher = awspublish.create({
    params: {
      Bucket: BUCKETS.assets
    }
  });

  // All files are forced since gulp-awspublish doesn't
  // sync if there are just http header changes
  function publish(headers) {
    return concurrent(publisher.publish(headers, {force: true}), 8);
  }

  // Cache 1 week
  const js = gulp.src('assets/**/*.js', {cwd: BUILD_DIR, base: BUILD_DIR})
    .pipe(publish({
      'Cache-Control': 'max-age=' + 60 * 60 * 24 * 7 + ', public',
      'Content-Type': 'application/javascript; charset=utf-8'
    }));

  return js;
});

gulp.task('front-html-deploy-certification', () => {
  return getNextDeployment().then((deployment) => {
    const bucket = BUCKETS[deployment];
    gutil.log('Deploying HTML to ' + bucket);
    const publisher = awspublish.create({
      params: {
        Bucket: bucket
      }
    });

    // All files are forced since gulp-awspublish doesn't
    // sync if there are just http header changes
    function publish(headers) {
      return concurrent(publisher.publish(headers, {force: true}), 8);
    }

    // Cache 1 min
    const index = gulp.src('index.html', {cwd: BUILD_DIR, base: BUILD_DIR})
      .pipe(publish({
        'Cache-Control': 'max-age=' + 60 * 1 + ', public',
        'Content-Type': 'text/html; charset=utf-8'
      }));

    return index
      .pipe(publisher.sync());
  });
});

gulp.task('test', gulp.parallel(
  'api-validate',
  gulp.series(
    'lint',
    gulp.parallel(
      gulp.series('static-analysis-run', 'static-analysis-submit-graphana'),
      gulp.series(
        'test-unit-coverage-setup',
        'test-unit-run',
        gulp.parallel(
          'test-unit-coverage-submit-graphana',
          'test-unit-coverage-submit-coveralls'
        )
      ) 
    )
  )
));

gulp.task('deploy', gulp.series(
  gulp.parallel(
    gulp.series(
      'front-clean',
      'front-build',
      gulp.parallel(
        'front-assets-deploy-production',
        'front-html-deploy-certification'
      )
    ),
    gulp.series(
      'back-deploy',
      'api-deploy-certification'
    )
  ),
  'test-e2e-run',
  'api-deploy-to-production'
));

gulp.task('default', gulp.series('test'));
