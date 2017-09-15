/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let Rebuild;
const path = require('path');

const _ = require('underscore-plus');
const yargs = require('yargs');

const config = require('./apm');
const Command = require('./command');
const Install = require('./install');

module.exports =
(Rebuild = (function() {
  Rebuild = class Rebuild extends Command {
    static initClass() {
      this.commandNames = ['rebuild'];
    }

    constructor() {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.atomNodeDirectory = path.join(config.getAtomDirectory(), '.node-gyp');
      this.atomNpmPath = require.resolve('npm/bin/npm-cli');
    }

    parseOptions(argv) {
      const options = yargs(argv).wrap(100);
      options.usage(`\

Usage: apm rebuild [<name> [<name> ...]]

Rebuild the given modules currently installed in the node_modules folder
in the current working directory.

All the modules will be rebuilt if no module names are specified.\
`
      );
      return options.alias('h', 'help').describe('help', 'Print this usage message');
    }

    installNode(callback) {
      return config.loadNpm(function(error, npm) {
        const install = new Install();
        install.npm = npm;
        return install.loadInstalledAtomMetadata(() => install.installNode(callback));
      });
    }

    forkNpmRebuild(options, callback) {
      let vsArgs;
      process.stdout.write('Rebuilding modules ');

      let rebuildArgs = [
        '--globalconfig',
        config.getGlobalConfigPath(),
        '--userconfig',
        config.getUserConfigPath(),
        'rebuild',
        '--runtime=electron',
        `--target=${this.electronVersion}`,
        `--arch=${config.getElectronArch()}`
      ];
      rebuildArgs = rebuildArgs.concat(options.argv._);

      if (vsArgs = this.getVisualStudioFlags()) {
        rebuildArgs.push(vsArgs);
      }

      const env = _.extend({}, process.env, {HOME: this.atomNodeDirectory, RUSTUP_HOME: config.getRustupHomeDirPath()});
      if (config.isWin32()) { env.USERPROFILE = env.HOME; }
      this.addBuildEnvVars(env);

      return this.fork(this.atomNpmPath, rebuildArgs, {env}, callback);
    }

    run(options) {
      const {callback} = options;
      options = this.parseOptions(options.commandArgs);

      return config.loadNpm((error, npm) => {
        this.npm = npm;
        return this.loadInstalledAtomMetadata(() => {
          return this.installNode(error => {
            if (error != null) { return callback(error); }

            return this.forkNpmRebuild(options, (code, stderr) => {
              if (stderr == null) { stderr = ''; }
              if (code === 0) {
                this.logSuccess();
                return callback();
              } else {
                this.logFailure();
                return callback(stderr);
              }
            });
          });
        });
      });
    }
  };
  Rebuild.initClass();
  return Rebuild;
})());
