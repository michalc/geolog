'use strict';

const AWS = require('aws-sdk');
const Api = require('./api/api')

const config = require('./config');
const api = new Api(
  AWS,
  config,
);

// For testing
// api.getJob()
(() => {
  const ReactDOM = require('react-dom');
  const React = require('react');
  const GeoLog = require('./ui/geolog');

  var rootDomElement;
  var domLoaded = false;
  var mapsLoaded = false;
  var fbLoaded = false;  

  const render = () => {
    if (!domLoaded) return;
    ReactDOM.render(<GeoLog api={api} mapsLoaded={mapsLoaded} fbLoaded={fbLoaded} />, rootDomElement);
  }

  document.addEventListener('DOMContentLoaded', () => {
    rootDomElement = document.getElementById('app-root');
    domLoaded = true
    render();
  });

  window[config.onMapsLoaded] = () => {
    mapsLoaded = true;
    render();
  };

  window.fbAsyncInit = () => {
    FB.init({
      appId : '1207177242680218',
      xfbml : false,
      version : 'v2.10'
    });
    FB.AppEvents.logPageView();
    fbLoaded = true;
    render();
  }
})();
