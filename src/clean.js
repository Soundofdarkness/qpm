/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let Clean;
const path = require('path');

const async = require('async');
const CSON = require('season');
const yargs = require('yargs');
const _ = require('underscore-plus');

const Command = require('./command');
const config = require('./apm');
const fs = require('./fs');

module.exports =
(Clean = (function() {
  Clean = class Clean extends Command {
    static initClass() {
      this.commandNames = ['clean'];
    }

    constructor() {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.atomNpmPath = require.resolve('npm/bin/npm-cli');
    }

    getDependencies(modulePath, allDependencies) {
      let dependencies;
      try {
        let left, packageDependencies;
        ({dependencies, packageDependencies} = (left = CSON.readFileSync(CSON.resolve(path.join(modulePath, 'package')))) != null ? left : {});
      } catch (error) {
        return;
      }

      _.extend(allDependencies, dependencies);

      const modulesPath = path.join(modulePath, 'node_modules');
      return Array.from(fs.list(modulesPath)).filter((installedModule) => installedModule !== '.bin').map((installedModule) =>
        this.getDependencies(path.join(modulesPath, installedModule), allDependencies));
    }

    getModulesToRemove() {
      let left;
      const packagePath = CSON.resolve('package');
      if (!packagePath) { return []; }

      let {devDependencies, dependencies, packageDependencies} = (left = CSON.readFileSync(packagePath)) != null ? left : {};
      if (devDependencies == null) { devDependencies = {}; }
      if (dependencies == null) { dependencies = {}; }
      if (packageDependencies == null) { packageDependencies = {}; }

      const modulesToRemove = [];
      const modulesPath = path.resolve('node_modules');
      const modulePathFilter = modulePath => (modulePath !== '.bin') && (modulePath !== 'atom-package-manager');
      const installedModules = fs.list(modulesPath).filter(modulePathFilter);

      // Check if the module is a scoped module (starting with an '@')
      // If so, recursively lookup inside this directory
      // and concatenate to the root folder
      //
      // e.g. if you have a dependency @types/atom, modulePath === @types
      // fs.list(@types) === ['atom'], thus this will return ['@types/atom']
      //
      // At the end, flat map, since these scoped packages can return more than 1
      // and normal modules return only 1
      const filteredInstalledModules = [].concat.apply([], installedModules.map(function(modulePath) {
        if (!(modulePath.substring(0, 1) === '@')) {
          return [modulePath];
        } else {
          return fs.list(path.join(modulesPath, modulePath)).filter(modulePathFilter)
            .map(subPath => path.join(modulePath, subPath));
        }
      }));

      // Find all dependencies of all installed modules recursively
      for (var installedModule of Array.from(filteredInstalledModules)) {
        this.getDependencies(path.join(modulesPath, installedModule), dependencies);
      }

      // Only remove dependencies that aren't referenced by any installed modules
      for (installedModule of Array.from(filteredInstalledModules)) {
        if (dependencies.hasOwnProperty(installedModule)) { continue; }
        if (devDependencies.hasOwnProperty(installedModule)) { continue; }
        if (packageDependencies.hasOwnProperty(installedModule)) { continue; }
        modulesToRemove.push(installedModule);
      }

      return modulesToRemove;
    }

    parseOptions(argv) {
      const options = yargs(argv).wrap(100);

      options.usage(`\
Usage: apm clean

Deletes all packages in the node_modules folder that are not referenced
as a dependency in the package.json file.\
`
      );
      return options.alias('h', 'help').describe('help', 'Print this usage message');
    }

    removeModule(module, callback) {
      process.stdout.write(`Removing ${module} `);
      return this.fork(this.atomNpmPath, ['uninstall', module], (...args) => {
        return this.logCommandResults(callback, ...Array.from(args));
      });
    }

    run(options) {
      let doneCallback;
      const uninstallCommands = [];
      this.getModulesToRemove().forEach(module => {
        return uninstallCommands.push(callback => this.removeModule(module, callback));
      });

      if (uninstallCommands.length > 0) {
        doneCallback = error => {
          if (error != null) {
            return options.callback(error);
          } else {
            return this.run(options);
          }
        };
      } else {
        doneCallback = options.callback;
      }
      return async.waterfall(uninstallCommands, doneCallback);
    }
  };
  Clean.initClass();
  return Clean;
})());
