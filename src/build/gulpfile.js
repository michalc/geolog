'use strict';

const parallelLimit = require('async/parallelLimit');
const AWS = require('aws-sdk');
const babelify = require("babelify");
const browserify = require('browserify');
const transformTools = require('browserify-transform-tools');
const browserifyShim = require('browserify-shim');
const childProcess = require('child_process');
const concurrent = require('concurrent-transform');
const cssModulesify = require('css-modulesify')
const del = require('del');
const gulp = require('gulp');
const awspublish = require('gulp-awspublish');
const streamToBuffer = require('gulp-buffer');
const concat = require('gulp-concat');
const connect = require('gulp-connect');
const coveralls = require('gulp-coveralls');
const decompress = require('gulp-decompress');
const download = require("gulp-download-stream");
const eslint = require('gulp-eslint');
const gulpHandlebars = require('gulp-compile-handlebars');
const htmlhint = require("gulp-htmlhint");
const istanbul = require('gulp-istanbul');
const mocha = require('gulp-mocha');
const rev = require('gulp-rev');
const revReplace = require('gulp-rev-replace');
const uglify = require('gulp-uglify');
const gutil = require('gulp-util');
const webdriver = require('gulp-webdriver');
const zip = require('gulp-zip');
const handlebars = require('handlebars');
const os = require('os');
const plato = require('plato');
const http = require('http');
const mergeStream = require('merge-stream');
const net = require('net');
const stream = require('stream');
const buffer = require('vinyl-buffer');
const source = require('vinyl-source-stream');

AWS.config.region = 'eu-west-1';
AWS.config.credentials = new AWS.SharedIniFileCredentials({profile: 'default'});

const exec = childProcess.exec;

const BUILD_DIR = 'build';

// Slightly horrible that can't find a better (less global)
// way of getting this is the way to get options into the
// AWS SDK builder
process.env.MINIFY = '1'
process.env.AWS_SERVICES ='cognitoidentity,s3'

const RESULTS_DIR = (process.env.CIRCLECI ? process.env.CIRCLE_TEST_REPORTS + '/' : '') + 'results'
const COVERAGE_DIR = RESULTS_DIR + '/coverage'
const ANALYSIS_DIR = RESULTS_DIR + '/analysis'

const HOSTED_GRAPHITE_API_KEY = process.env.HOSTED_GRAPHITE_API_KEY;

const TERRAFORM_DIR = 'bin'
const TERRAFORM = 'bin/terraform';

const FIRST_DEPLOYMENT = 'blue';
const NEXT_DEPLOYMENTS = {
  'blue': 'green',
  'green': 'blue',
};

const BUCKETS = {
  'assets': 'assets.geolog.co',
  'blue': 'blue.geolog.co',
  'green': 'green.geolog.co'
};

const UPLOAD_BUCKET = 'uploads.geolog.co'

const DEVELOPMENT_SITE_PORT = '8080';
const DEVELOPMENT_ASSETS_PORT = '8081';

const ENVIRONMENTS = {
  'production': {
    'assetsBase': 'https://assets.geolog.co'
  },
  'development': {
    'assetsBase': 'http://localhost:' + DEVELOPMENT_ASSETS_PORT
  }
}

const IDENTITY_POOL_ID = 'eu-west-1:fdeb8cdc-38e2-4963-9578-5a4f03efdfed';
const REGION = 'eu-west-1';
const MAPS_LOADED_CALLBACK = 'onMapsLoaded';
const MAPS_KEY = 'AIzaSyA0cRx4oUvZkNnVcjr64Q6Xgyu61-ir8qk';

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

gulp.task('lint-javascript', () => {
  return gulp.src(['src/**/*.js'])
    .pipe(eslint())
    .pipe(eslint.format())
    .pipe(eslint.failAfterError());
});

gulp.task('lint-html', () => {
  return gulp.src(['src/**/*.html'])
    .pipe(htmlhint())
    .pipe(htmlhint.failReporter());
});

gulp.task('test-unit-front-run', () => {
  return gulp.src(['src/front/**/*.spec.js'], {read: false})
    .pipe(mocha({
    }));
})

gulp.task('test-unit-back-coverage-setup', () => {
  return gulp.src(['src/back/**/*.js', '!src/back/**/*.spec.js'])
    .pipe(istanbul())
    .pipe(istanbul.hookRequire());
});

gulp.task('test-unit-back-run', () => {
  return gulp.src(['src/back/**/*.spec.js'], {read: false})
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

gulp.task('static-analysis-run', (done) => {
  plato.inspect(['src'], ANALYSIS_DIR, {recurse: true}, () => {
    done()
  });
});

gulp.task('static-analysis-submit-graphana', () => {
  return gulp.src([ANALYSIS_DIR + '/report.json'])
    .pipe(stream.Transform({
      objectMode: true,
      transform: function(file, enc, callback) {
        const complexity = JSON.parse(file.contents);
        submitMetrics([
          {name: "analysis.static.total.sloc", value: complexity.summary.total.sloc},
          {name: "analysis.static.total.maintainability", value: complexity.summary.total.maintainability},
          {name: "analysis.static.average.sloc", value: complexity.summary.average.sloc},
          {name: "analysis.static.average.maintainability", value: complexity.summary.average.maintainability},
        ], callback);

        // complexity.reports.forEach((report) => {
        //   console.log(report.path);
        // });
      }
    }));
});

gulp.task('front-clean', () => {
  return del([BUILD_DIR + '/**', '!' + BUILD_DIR]);
});

const buildDir = (environment) => {
  return BUILD_DIR + '/' + environment
}

const siteBuildDir = (environment) => {
  return buildDir(environment) + '/site'
}

const assetsBuildDir = (environment) => {
  return buildDir(environment) + '/assets'
}

const frontBuild = (environment) => {

  const appStyles = new stream.PassThrough({
    objectMode: true
  });

  const identity = new stream.PassThrough({
    objectMode: true
  });

  const scripts = browserify({
      entries: 'src/front/assets/app.jsx',
      extensions: ['.js', '.jsx']
    })
    .plugin(cssModulesify, {
      rootDir: 'src/front/assets/ui'
    })
    .on('css stream', (css) => {
      // Slightly horrible way to extract
      // out the stream of css to pump through
      // rev/rev-replace
      css
      .pipe(source('ui.css'))
      .pipe(buffer())
      .pipe(appStyles);
    })
    .transform(transformTools.makeStringTransform("template", {
      includeExtensions: ['config.js']
    }, (content, transformOptions, done) => {
      const template = handlebars.compile(content);
      const data = {
        identityPoolId: IDENTITY_POOL_ID,
        region: REGION,
        uploadBucket: UPLOAD_BUCKET,
        onMapsLoaded: MAPS_LOADED_CALLBACK
      };
      done(null, template(data));
    }))
    .transform(babelify, {presets: ["react", "es2015"]})
    .transform(browserifyShim)
    .bundle()
    .pipe(source('app.js'))
    .pipe(buffer())
    .pipe(environment == 'production' ? uglify() : identity)

  // Slightly dodgy way, but it'll do
  const vendorStyles = gulp.src(['node_modules/purecss/build/pure-min.css'])

  const styles = mergeStream(vendorStyles, appStyles)
    .pipe(concat('app.css'))

  const assets = mergeStream(scripts, styles)
    .pipe(rev())
    .pipe(gulp.dest(assetsBuildDir(environment)))
    .pipe(rev.manifest());

  const files = gulp.src(['index.html'], {cwd: 'src/front/site', base: 'src/front/site'})
    .pipe(gulpHandlebars({
      assetsBase: ENVIRONMENTS[environment].assetsBase,
      onMapsLoaded: MAPS_LOADED_CALLBACK,
      mapsKey: MAPS_KEY,
    }))
    .pipe(revReplace({manifest: assets}))
    .pipe(gulp.dest(siteBuildDir(environment)));

  return streamToPromise(mergeStream(assets, files));
}

gulp.task('front-build-development', () => {
  return frontBuild('development')
});

gulp.task('front-build-production', () => {
  return frontBuild('production')
});

function serveFront() {
  connect.server({
    root: siteBuildDir('development'),
    port: DEVELOPMENT_SITE_PORT
  });
  connect.server({
    root: assetsBuildDir('development'),
    port: DEVELOPMENT_ASSETS_PORT
  });
}

gulp.task('test-e2e-run-local', () => {
  // There is a race condition here, but
  // starting the server seems to be much
  // quicker than starting the tests
  serveFront()

  return gulp.src('wdio.conf.js')
    .pipe(webdriver({
      baseUrl: 'http://localhost:8080'
    }))
    .on('finish', () => {
      connect.serverClose()
    });
});

gulp.task('test-e2e-run-certification', () => {
  return gulp.src('wdio.conf.js')
    .pipe(webdriver({
      baseUrl: 'https://certification.geolog.co'
    }));
});

gulp.task('front-watch', () => {
  gulp.watch(['package.json', 'src/**/*'], gulp.series('front-build-development'));
});

gulp.task('front-serve', () => {
  serveFront()
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
  const js = gulp.src('**/*.js', {cwd: assetsBuildDir('production'), base: assetsBuildDir('production')})
    .pipe(publish({
      'Cache-Control': 'max-age=' + 60 * 60 * 24 * 7 + ', public',
      'Content-Type': 'application/javascript; charset=utf-8'
    }));
  const css = gulp.src('**/*.css', {cwd: assetsBuildDir('production'), base: assetsBuildDir('production')})
    .pipe(publish({
      'Cache-Control': 'max-age=' + 60 * 60 * 24 * 7 + ', public',
      'Content-Type': 'text/css; charset=utf-8'
    }));

  return mergeStream(js, css);
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
    const index = gulp.src('index.html', {cwd: siteBuildDir('production'), base: siteBuildDir('production')})
      .pipe(publish({
        'Cache-Control': 'max-age=' + 60 * 1 + ', public',
        'Content-Type': 'text/html; charset=utf-8'
      }));

    return index
      .pipe(publisher.sync());
  });
});

gulp.task('terraform-install', () => {
  const platform = os.platform();
  const version = '0.10.6';

  gutil.log(`Terraform installing to ${TERRAFORM}...`);
  return streamToPromise(
    download(`https://releases.hashicorp.com/terraform/${version}/terraform_${version}_${platform}_amd64.zip`)
      .pipe(streamToBuffer()) // decompress does not support streams
      .pipe(decompress())
      .pipe(gulp.dest(TERRAFORM_DIR)
    )
  ).then(() => gutil.log(`Terraform installed to ${TERRAFORM}`));
});

gulp.task('terraform-init', (cb) => {
  exec(TERRAFORM + ' init', (err) => {
    cb(err);
  });
});

gulp.task('develop', 
  gulp.parallel(
    'front-build-development',
    'front-serve',
    'front-watch'
  )
)

gulp.task('test-run', gulp.parallel(
  'lint-javascript',
  'lint-html',
  'static-analysis-run',
  'test-unit-front-run',
  gulp.series('test-unit-back-coverage-setup', 'test-unit-back-run')
));

gulp.task('test-submit', gulp.parallel(
  'static-analysis-submit-graphana',
  'test-unit-coverage-submit-graphana',
  'test-unit-coverage-submit-coveralls'
))

gulp.task('test-pr', gulp.series(
  'test-run'
));

gulp.task('test-master', gulp.series(
  'test-run',
  'test-submit'
));

gulp.task('deploy-master', gulp.series(
  // Need IDs of resources to deploy to
  'terraform-install',
  'terraform-init',
  gulp.parallel(
    gulp.series(
      'front-clean',
      'front-build-production',
      gulp.parallel(
        'front-assets-deploy-production',
        'front-html-deploy-certification'
      )
    )
  ),
  'test-e2e-run-certification'
));

gulp.task('default', gulp.series('test-run'));
