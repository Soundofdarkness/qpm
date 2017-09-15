/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const path = require('path');
const fs = require('fs-plus');
const temp = require('temp');
const apm = require('../lib/apm-cli');

describe('apm uninstall', function() {
  beforeEach(function() {
    silenceOutput();
    spyOnToken();
    return process.env.ATOM_API_URL = 'http://localhost:5432';
  });

  describe('when no package is specified', () =>
    it('logs an error and exits', function() {
      const callback = jasmine.createSpy('callback');
      apm.run(['uninstall'], callback);

      waitsFor('waiting for command to complete', () => callback.callCount > 0);

      return runs(function() {
        expect(console.error.mostRecentCall.args[0].length).toBeGreaterThan(0);
        return expect(callback.mostRecentCall.args[0]).not.toBeUndefined();
      });
    })
  );

  describe('when the package is not installed', () =>
    it('ignores the package', function() {
      const callback = jasmine.createSpy('callback');
      apm.run(['uninstall', 'a-package-that-does-not-exist'], callback);

      waitsFor('waiting for command to complete', () => callback.callCount > 0);

      return runs(() => expect(console.error.callCount).toBe(1));
    })
  );

  return describe('when the package is installed', function() {
    it('deletes the package', function() {
      const atomHome = temp.mkdirSync('apm-home-dir-');
      const packagePath = path.join(atomHome, 'packages', 'test-package');
      fs.makeTreeSync(path.join(packagePath, 'lib'));
      fs.writeFileSync(path.join(packagePath, 'package.json'), "{}");
      process.env.ATOM_HOME = atomHome;

      expect(fs.existsSync(packagePath)).toBeTruthy();
      const callback = jasmine.createSpy('callback');
      apm.run(['uninstall', 'test-package'], callback);

      waitsFor('waiting for command to complete', () => callback.callCount > 0);

      return runs(() => expect(fs.existsSync(packagePath)).toBeFalsy());
    });

    describe("--dev", () =>
      it("deletes the packages from the dev packages folder", function() {
        const atomHome = temp.mkdirSync('apm-home-dir-');
        const packagePath = path.join(atomHome, 'packages', 'test-package');
        fs.makeTreeSync(path.join(packagePath, 'lib'));
        fs.writeFileSync(path.join(packagePath, 'package.json'), "{}");
        const devPackagePath = path.join(atomHome, 'dev', 'packages', 'test-package');
        fs.makeTreeSync(path.join(devPackagePath, 'lib'));
        fs.writeFileSync(path.join(devPackagePath, 'package.json'), "{}");
        process.env.ATOM_HOME = atomHome;

        expect(fs.existsSync(packagePath)).toBeTruthy();
        const callback = jasmine.createSpy('callback');
        apm.run(['uninstall', 'test-package', '--dev'], callback);

        waitsFor('waiting for command to complete', () => callback.callCount > 0);

        return runs(function() {
          expect(fs.existsSync(devPackagePath)).toBeFalsy();
          return expect(fs.existsSync(packagePath)).toBeTruthy();
        });
      })
    );

    return describe("--hard", () =>
      it("deletes the packages from the both packages folders", function() {
        const atomHome = temp.mkdirSync('apm-home-dir-');
        const packagePath = path.join(atomHome, 'packages', 'test-package');
        fs.makeTreeSync(path.join(packagePath, 'lib'));
        fs.writeFileSync(path.join(packagePath, 'package.json'), "{}");
        const devPackagePath = path.join(atomHome, 'dev', 'packages', 'test-package');
        fs.makeTreeSync(path.join(devPackagePath, 'lib'));
        fs.writeFileSync(path.join(devPackagePath, 'package.json'), "{}");
        process.env.ATOM_HOME = atomHome;

        expect(fs.existsSync(packagePath)).toBeTruthy();
        const callback = jasmine.createSpy('callback');
        apm.run(['uninstall', 'test-package', '--hard'], callback);

        waitsFor('waiting for command to complete', () => callback.callCount > 0);

        return runs(function() {
          expect(fs.existsSync(devPackagePath)).toBeFalsy();
          return expect(fs.existsSync(packagePath)).toBeFalsy();
        });
      })
    );
  });
});
