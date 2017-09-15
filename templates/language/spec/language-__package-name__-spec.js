/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
// If you want an example of language specs, check out:
// https://github.com/atom/language-gfm/blob/master/spec/gfm-spec.coffee

describe("PackageName grammar", function() {
  let grammar = null;

  beforeEach(function() {
    waitsForPromise(() => atom.packages.activatePackage("language-__package-name__"));

    return runs(() => grammar = atom.syntax.grammarForScopeName("source.__package-name__"));
  });

  return it("parses the grammar", function() {
    expect(grammar).toBeTruthy();
    return expect(grammar.scopeName).toBe("source.__package-name__");
  });
});
