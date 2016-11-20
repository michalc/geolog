/* eslint-env browser */

'use strict';

const AWS = require('aws-sdk');
const apigClientFactory = require('./apigClientFactory');

// Identity pool already configured to use roles
const creds = new AWS.CognitoIdentityCredentials({
  IdentityPoolId: 'eu-west-1:fdeb8cdc-38e2-4963-9578-5a4f03efdfed'
})

AWS.config.update({
  region: 'eu-west-1',
  credentials: creds
});

creds.get(() => {
  const apigClient = apigClientFactory.newClient({
    accessKey: creds.accessKeyId,
    secretKey: creds.secretAccessKey,
    sessionToken: creds.sessionToken,
    region: 'eu-west-1'
  });
  apigClient.apiJobsIdGet({id:1}).then(() => {

  });
});

var React = require('react');
var ReactDOM = require('react-dom');

class GeoLog extends React.Component {

  constructor(props) {
    super(props);
    this.handleFileSelect = this.handleFileSelect.bind(this);
    this.state = {
      files: []
    }
  }

  handleFileSelect(e) {
    this.setState(prevState => {
      return {
        files: [e]
      }
    });
  }

  render() {
    return (
      <div>
        <h1>GeoLog</h1>
        <FileButton onFileSelect={this.handleFileSelect} />
        <FileList files={this.state.files} />
      </div>
    );
  }
}

class FileButton extends React.Component {
  constructor(props) {
    super(props);
    this.handleChange = this.handleChange.bind(this);
  }   

  handleChange(e) {
    this.props.onFileSelect(this.input.files[0]);
  }

  render() {
    return (
      <div>
        <input
          onChange={this.handleChange}
          type="file"
          ref={(input) => { this.input = input; }}
        />
      </div>
    );
  }
}

class FileList extends React.Component {
  render() {
    const listItems = this.props.files.map((file, i) =>
      <li key={i}>{ file.name }</li>
    );
    return (
      <ul>
        { listItems }
      </ul>
    );
  }
}

document.addEventListener('DOMContentLoaded', () => {
  ReactDOM.render((
      <GeoLog />
    ),
    document.getElementById('geolog')
  );
});