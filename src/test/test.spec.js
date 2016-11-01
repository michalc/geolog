describe('geolog', () => {
  it('has the title geolog', () => {
    browser.url('http://localhost:8080/');
    const title = browser.getTitle();
    title.should.be.equal('GeoLog');
  });
});
