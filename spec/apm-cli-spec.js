/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const fs = require('fs');
const apm = require('../lib/apm-cli');

describe('apm command line interface', function() {
  beforeEach(function() {
    silenceOutput();
    return spyOnToken();
  });

  describe('when no arguments are present', () =>
    it('prints a usage message', function() {
      apm.run([]);
      expect(console.log).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
      return expect(console.error.argsForCall[0][0].length).toBeGreaterThan(0);
    })
  );

  describe('when the help flag is specified', () =>
    it('prints a usage message', function() {
      apm.run(['-h']);
      expect(console.log).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
      return expect(console.error.argsForCall[0][0].length).toBeGreaterThan(0);
    })
  );

  describe('when the version flag is specified', () =>
    it('prints the version', function() {
      const callback = jasmine.createSpy('callback');
      apm.run(['-v', '--no-color'], callback);

      waitsFor(() => callback.callCount === 1);

      return runs(function() {
        expect(console.error).not.toHaveBeenCalled();
        expect(console.log).toHaveBeenCalled();
        const lines = console.log.argsForCall[0][0].split('\n');
        expect(lines[0]).toBe(`apm  ${require('../package.json').version}`);
        expect(lines[1]).toBe(`npm  ${require('npm/package.json').version}`);
        return expect(lines[2]).toBe(`node ${process.versions.node} ${process.arch}`);
      });
    })
  );

  return describe('when an unrecognized command is specified', () =>
    it('prints an error message and exits', function() {
      const callback = jasmine.createSpy('callback');
      apm.run(['this-will-never-be-a-command'], callback);
      expect(console.log).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
      expect(console.error.argsForCall[0][0].length).toBeGreaterThan(0);
      return expect(callback.mostRecentCall.args[0]).not.toBeUndefined();
    })
  );
});
