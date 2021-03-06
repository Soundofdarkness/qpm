/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const path = require('path');
const fs = require('fs-plus');
const temp = require('temp');
const express = require('express');
const http = require('http');
const wrench = require('wrench');
const apm = require('../lib/apm-cli');

describe('apm clean', function() {
  let [moduleDirectory, server] = Array.from([]);

  beforeEach(function() {
    silenceOutput();
    spyOnToken();

    const app = express();
    app.get('/node/v0.10.3/node-v0.10.3.tar.gz', (request, response) => response.sendfile(path.join(__dirname, 'fixtures', 'node-v0.10.3.tar.gz')));
    app.get('/node/v0.10.3/node.lib', (request, response) => response.sendfile(path.join(__dirname, 'fixtures', 'node.lib')));
    app.get('/node/v0.10.3/x64/node.lib', (request, response) => response.sendfile(path.join(__dirname, 'fixtures', 'node_x64.lib')));
    app.get('/node/v0.10.3/SHASUMS256.txt', (request, response) => response.sendfile(path.join(__dirname, 'fixtures', 'SHASUMS256.txt')));
    app.get('/tarball/test-module-1.0.0.tgz', (request, response) => response.sendfile(path.join(__dirname, 'fixtures', 'test-module-1.0.0.tgz')));
    server =  http.createServer(app);
    server.listen(3000);

    const atomHome = temp.mkdirSync('apm-home-dir-');
    process.env.ATOM_HOME = atomHome;
    process.env.ATOM_ELECTRON_URL = "http://localhost:3000/node";
    process.env.ATOM_ELECTRON_VERSION = 'v0.10.3';

    moduleDirectory = path.join(temp.mkdirSync('apm-test-module-'), 'test-module-with-dependencies');
    wrench.copyDirSyncRecursive(path.join(__dirname, 'fixtures', 'test-module-with-dependencies'), moduleDirectory);
    return process.chdir(moduleDirectory);
  });

  afterEach(() => server.close());

  it('uninstalls any packages not referenced in the package.json', function() {
    const removedPath = path.join(moduleDirectory, 'node_modules', 'will-be-removed');
    fs.makeTreeSync(removedPath);

    const callback = jasmine.createSpy('callback');
    apm.run(['clean'], callback);

    waitsFor('waiting for command to complete', () => callback.callCount > 0);

    return runs(function() {
      expect(callback.mostRecentCall.args[0]).toBeUndefined();
      return expect(fs.existsSync(removedPath)).toBeFalsy();
    });
  });

  return it('uninstalls a scoped package', function() {
    const removedPath = path.join(moduleDirectory, 'node_modules', '@types/atom');
    fs.makeTreeSync(removedPath);

    const callback = jasmine.createSpy('callback');
    apm.run(['clean'], callback);

    waitsFor('waiting for command to complete', () => callback.callCount > 0);

    return runs(function() {
      expect(callback.mostRecentCall.args[0]).toBeUndefined();
      return expect(fs.existsSync(removedPath)).toBeFalsy();
    });
  });
});
