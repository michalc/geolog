'use strict';

const AWS = require('aws-sdk');
const Api = require('./api')
const apigClientFactory = require('./apigClientFactory');

const identityPoolId = 'eu-west-1:fdeb8cdc-38e2-4963-9578-5a4f03efdfed'
const region = 'eu-west-1';
const api = new Api(AWS, apigClientFactory, region, identityPoolId);

const React = require('react');
const ReactDOM = require('react-dom');

// For testing
api.getJob()

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
        files: prevState.files.concat([e])
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