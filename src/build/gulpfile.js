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
const handlebars = require('gulp-compile-handlebars');
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
const net = require('net');
const stream = require('stream');
const Vinyl = require('vinyl');
const buffer = require('vinyl-buffer');
const source = require('vinyl-source-stream');

AWS.config.region = 'eu-west-1';
AWS.config.credentials = new AWS.SharedIniFileCredentials({profile: 'default'});
const apigateway = new AWS.APIGateway();
const lambda = new AWS.Lambda();

const exec = childProcess.exec;

const LAMBDA_NAME = 'geolog-api'
const LAMBDA_ALIAS = 'production'
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

function updateFunctionCodeAndAlias(zippedCode) {
  return lambda.updateFunctionCode({
    Publish: true,
    FunctionName: 'geolog-api',
    ZipFile: zippedCode
  }).promise().then((resource) => {
    gutil.log('Latest version is ' + resource.Version);
    return lambda.updateAlias({
      FunctionName: LAMBDA_NAME,
      FunctionVersion: resource.Version,
      Name: LAMBDA_ALIAS
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

function deployApiToCertification(schema) {
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
  });
}

function deployApiFromCertificationToProduction() {
  return apigateway.getStage({
    restApiId: API_GATEWAY_ID,
    stageName: API_GATEWAY_STAGE_CERTIFICATION,
  }).promise().then((certificationStage) => {
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

function submitMetric(name, value) {
  return new Promise((resolve/*, reject*/) => {
    const socket = net.createConnection(2003, "560b32d8.carbon.hostedgraphite.com", () => {
      socket.write(HOSTED_GRAPHITE_API_KEY + "." + name + " " + value + "\n");
      socket.end();
      resolve();
    });
  });
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

gulp.task('test', gulp.series('test-cover', () => {
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
    istanbul.writeReports({
      dir: COVERAGE_DIR
    })
  );
}));

gulp.task('submit-coverage-to-graphana', () => {
  const coverage = istanbul.summarizeCoverage()
  return Promise.all([
    submitMetric("test.unit.lines.total", coverage.lines.total),
    submitMetric("test.unit.lines.covered", coverage.lines.covered),
    submitMetric("test.unit.lines.skipped", coverage.lines.skipped),
    submitMetric("test.unit.statements.total", coverage.statements.total),
    submitMetric("test.unit.statements.covered", coverage.statements.covered),
    submitMetric("test.unit.statements.skipped", coverage.statements.skipped),
    submitMetric("test.unit.functions.total", coverage.functions.total),
    submitMetric("test.unit.functions.covered", coverage.functions.covered),
    submitMetric("test.unit.functions.skipped", coverage.functions.skipped),
    submitMetric("test.unit.branches.total", coverage.branches.total),
    submitMetric("test.unit.branches.covered", coverage.branches.covered),
    submitMetric("test.unit.branches.skipped", coverage.branches.skipped)
  ]);
});

gulp.task('submit-coverage-to-coveralls', () => {
  return pipe(
    gulp.src(COVERAGE_DIR + '/lcov.info'),
    coveralls()
  );
});

gulp.task('test-and-submit',
  gulp.series(
    'test',
    gulp.parallel('submit-coverage-to-graphana', 'submit-coverage-to-coveralls')
  )
);

gulp.task('analyse', (cb) => {
  exec('node_modules/.bin/cr --output ' + RESULTS_DIR + '/complexity.json --format json src', (err) => {
    cb(err);
  });
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

gulp.task('deploy-back-to-new-version', () => {
  return pipe(
    gulp.src(['src/back/index.js']),
    zip('index.zip'),
    streamIfy(updateFunctionCodeAndAlias)
  );
});

gulp.task('validate-api', (cb) => {
  exec('node_modules/.bin/swagger-tools validate src/api/schema.yaml', (err) => {
    cb(err);
  });
});

gulp.task('get-current-deployment', () => {
  return getCurrentDeployment();
});

gulp.task('deploy-api-to-certification', () => {
  return getNextDeployment().then((deployment) => {
    gutil.log('Deploying API as \'' + deployment + '\'');
    return new Promise((resolve, reject) => {
      pipe(
        gulp.src(['src/api/schema.yaml']),
        handlebars({
          deployment: deployment
        }),
        streamIfy(deployApiToCertification)
      ).on('error', reject).on('finish', resolve);
    });
  });
});

gulp.task('deploy-api-from-certification-to-production', () => {
  return deployApiFromCertificationToProduction();
});

gulp.task('clean-download', () => {
  return del(['download/**', '!download']);
});

gulp.task('fetch-api-client', gulp.series('clean-download', () => {
  return pipe(
    getApiSdk(),
    concat('apigClientFactory.js'),
    gulp.dest('download/scripts')
  );
}));

gulp.task('clean-front', () => {
  return del(['build/**', '!build']);
});

gulp.task('build-front', gulp.series(gulp.parallel('clean-front', 'fetch-api-client'), () => {
  const scripts = pipe(
    browserify({
      entries: 'src/front/assets/app.js',
      transform: [browserifyShim]
    }).bundle(),
    source('assets/app.js'),
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
}));

gulp.task('test-e2e', gulp.series('build-front', () => {
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
}));

gulp.task('watch-front', () => {
  gulp.watch(['package.json', 'src/**/*'], ['build-front']);
});

gulp.task('serve-front', () => {
  return connect.server({
    root: 'build'
  });
});

gulp.task('serve-back', () => {
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
gulp.task('deploy-assets-to-production', () => {
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
  const js = pipe(
    gulp.src('assets/**/*.js', {cwd: BUILD_DIR, base: BUILD_DIR}),
    publish({
      'Cache-Control': 'max-age=' + 60 * 60 * 24 * 7 + ', no-transform, public',
      'Content-Type': 'application/javascript; charset=utf-8'
    })
  );

  return js;
});

gulp.task('deploy-html-to-certification', () => {
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
    const index = pipe(
      gulp.src('index.html', {cwd: BUILD_DIR, base: BUILD_DIR}),
      publish({
        'Cache-Control': 'max-age=' + 60 * 1 + ', no-transform, public',
        'Content-Type': 'text/html; charset=utf-8'
      })
    );

    return pipe(
      index,
      publisher.sync()
    );
  });
});

gulp.task('deploy', gulp.series(
  'deploy-back-to-new-version',
  // Must be after back end, since the version of the 
  // lambda function will be merged into the definition
  'deploy-api-to-certification',
  // Must be after deploying API
  // 
  'build-front',
  'deploy-html-to-certification',
  // Here would go E2E tests
  'deploy-api-from-certification-to-production'
));

gulp.task('ci-test', gulp.parallel(
  gulp.series('analyse'),
  gulp.series('test-and-submit')
));

gulp.task('ci-deploy', gulp.series('deploy'));

gulp.task('default', gulp.series('test'));
