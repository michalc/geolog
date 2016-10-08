var gulp = require('gulp');
var BUILD_DIR = 'build';

var AWS = require('aws-sdk');
AWS.config.region = 'eu-west-1';
AWS.config.credentials = new AWS.SharedIniFileCredentials({profile: 's3-geolog'});

var API_ID = '1jxogzz6a3';

gulp.task('validate-api', function(cb) {
  var exec = require('child_process').exec;
  exec('./node_modules/swagger-tools/bin/swagger-tools validate ./src/api/schema.yaml', function (err, stdout, stderr) {
    cb(err);
  });
});

gulp.task('build-front', function() {
  var files = gulp.src(['src/front/index.html']);
  return files.pipe(gulp.dest('build'))
});

gulp.task('deploy-api', function (cb) {
  var stream = require('stream');
  var apigateway = new AWS.APIGateway();

  function putApi(yaml, cb) {
    apigateway.putRestApi({
      body: yaml,
      restApiId: API_ID,
      mode: 'overwrite',
      failOnWarnings: true
    }, function(err, data) {
      if (err) {
        console.log(err, err.stack);
      }
      cb(err)
    });
  }

  var files = gulp.src(['src/api/schema.yaml']);
  return files.pipe(stream.Transform({
    objectMode: true,
    transform: function(file, enc, cb) {
      putApi(file.contents, cb)
      this.push(file);
      cb();
    }
  }));
});

gulp.task('publish-front', function() {
  var concurrent = require('concurrent-transform');
  var awspublish = require('gulp-awspublish');
  var AWS = require('aws-sdk');

  var publisher = awspublish.create({
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
  var index = gulp.src('index.html', {cwd: BUILD_DIR})
    .pipe(awspublish.gzip())
    .pipe(publish({
      'Cache-Control': 'max-age=' + 60 * 5 + ', no-transform, public'
    }));

  return index
    .pipe(publisher.sync())
    .pipe(awspublish.reporter());
});

gulp.task('default', ['build']);
