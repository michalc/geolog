describe('geolog', () => {
  it('shows no error console logs', () => {
    browser.url('/');
    const logs = browser.log('browser').value;
    const severeMessages = logs.filter((logs) => {
      return logs.level == 'SEVERE';
    }).map((logs) => {
      return message.message;
    });
    expect(severeMessages).to.eql([]);
  })

  it('has the title geolog', () => {
    browser.url('/');
    const title = browser.getTitle();
    title.should.be.equal('GeoLog');
  });

  it('has the text geolog', () => {
    browser.url('/');
    const bodyText = browser.getText('body')
    bodyText.should.be.equal('GeoLog');
  });
});
