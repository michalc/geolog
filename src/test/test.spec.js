
describe('geolog', function() {
  it('has the title geolog', function() {
    browser.url('http://localhost:8080/');
    var title = browser.getTitle();
    title.should.be.equal('GeoLog');
  });
});
