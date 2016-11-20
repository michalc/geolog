describe('geolog', () => {
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
