describe('geolog', () => {
  it('has the title geolog', () => {
    browser.url('/');
    const title = browser.getTitle();
    title.should.be.equal('GeoLog');
  });
});
