'use strict';

const React = require('react');
const styles = require('./button.css');

class FbLogin extends React.Component {
  constructor(props) {
    super(props);
    this.handleClick = this.handleClick.bind(this);
  }

  handleClick(action) {
    action == 'Login' ? this.props.api.fbLogin() : this.props.api.fbLogout(); 
  }

  render() {
    const status = this.props.api.getLoginStatus();
    const action = status == 'logged-in' ? 'Logout' : 'Login';
    return (
      <div className={styles.button} disabled={status == 'unknown'} role="button" onClick={() => this.handleClick(action)}>
        {action}
      </div>
    );
  }
}

module.exports = FbLogin
