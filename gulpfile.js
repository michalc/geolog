var AWS = require('aws-sdk');
var gulp = require('gulp');

var BUILD_DIR = 'build';

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

gulp.task('permit-lambda', function(cb) {
  var lambda = new AWS.Lambda();

  return lambda.addPermission({
    Action: 'lambda:InvokeFunction',
    FunctionName: 'geolog',
    Principal: 'apigateway.amazonaws.com',
    StatementId: 'api-gateway',
    Qualifier: 'prod'
  }).promise();
});

gulp.task('deploy-lambda', function(cb) {
  var stream = require('stream');
  var lambda = new AWS.Lambda();
  var zip = require('gulp-zip');

  function putFunction(contents) {
    return lambda.updateFunctionCode({
      Publish: true,
      FunctionName: 'geolog',
      ZipFile: contents
    }).promise().then(function(resource) {
      return lambda.updateAlias({
        FunctionName: 'geolog',
        FunctionVersion: resource.Version,
        Name: 'prod'
      }).promise();
    });
  }

  var files = gulp.src(['src/back/endpoint.js']);
  return files
    .pipe(zip('endpoint.zip'))
    .pipe(stream.Transform({
      objectMode: true,
      transform: function(file, enc, cb) {
        putFunction(file.contents).then(function() {
          cb();
        }, function(err) {
          cb(err);
        });
      }
    }));
});

gulp.task('deploy-api', function (cb) {
  var stream = require('stream');
  var apigateway = new AWS.APIGateway();

  function putApi(yaml) {
    return apigateway.putRestApi({
      body: yaml,
      restApiId: API_ID,
      mode: 'overwrite',
      failOnWarnings: true
    }).promise().then(function(api) {
      return apigateway.createDeployment({
        restApiId: API_ID,
        stageName: 'prod',
      }).promise();
    });
  }

  var files = gulp.src(['src/api/schema.yaml']);
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

gulp.task('deploy-front', function() {
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

gulp.task('default', ['build-front']);
