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
let Dedupe;
const path = require('path');

const async = require('async');
const _ = require('underscore-plus');
const yargs = require('yargs');

const config = require('./apm');
const Command = require('./command');
const fs = require('./fs');

module.exports =
(Dedupe = (function() {
  Dedupe = class Dedupe extends Command {
    static initClass() {
      this.commandNames = ['dedupe'];
    }

    constructor() {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.atomDirectory = config.getAtomDirectory();
      this.atomPackagesDirectory = path.join(this.atomDirectory, 'packages');
      this.atomNodeDirectory = path.join(this.atomDirectory, '.node-gyp');
      this.atomNpmPath = require.resolve('npm/bin/npm-cli');
      this.atomNodeGypPath = require.resolve('node-gyp/bin/node-gyp');
    }

    parseOptions(argv) {
      const options = yargs(argv).wrap(100);
      options.usage(`\

Usage: apm dedupe [<package_name>...]

Reduce duplication in the node_modules folder in the current directory.

This command is experimental.\
`
      );
      return options.alias('h', 'help').describe('help', 'Print this usage message');
    }

    installNode(callback) {
      const installNodeArgs = ['install'];
      installNodeArgs.push("--runtime=electron");
      installNodeArgs.push(`--target=${this.electronVersion}`);
      installNodeArgs.push(`--dist-url=${config.getElectronUrl()}`);
      installNodeArgs.push(`--arch=${config.getElectronArch()}`);
      installNodeArgs.push('--ensure');

      const env = _.extend({}, process.env, {HOME: this.atomNodeDirectory, RUSTUP_HOME: config.getRustupHomeDirPath()});
      if (config.isWin32()) { env.USERPROFILE = env.HOME; }

      fs.makeTreeSync(this.atomDirectory);
      return config.loadNpm((error, npm) => {
        // node-gyp doesn't currently have an option for this so just set the
        // environment variable to bypass strict SSL
        // https://github.com/TooTallNate/node-gyp/issues/448
        let left;
        const useStrictSsl = (left = npm.config.get('strict-ssl')) != null ? left : true;
        if (!useStrictSsl) { env.NODE_TLS_REJECT_UNAUTHORIZED = 0; }

        // Pass through configured proxy to node-gyp
        const proxy = npm.config.get('https-proxy') || npm.config.get('proxy') || env.HTTPS_PROXY || env.HTTP_PROXY;
        if (proxy) { installNodeArgs.push(`--proxy=${proxy}`); }

        return this.fork(this.atomNodeGypPath, installNodeArgs, {env, cwd: this.atomDirectory}, function(code, stderr, stdout) {
          if (stderr == null) { stderr = ''; }
          if (stdout == null) { stdout = ''; }
          if (code === 0) {
            return callback();
          } else {
            return callback(`${stdout}\n${stderr}`);
          }
        });
      });
    }

    getVisualStudioFlags() {
      let vsVersion;
      if (vsVersion = config.getInstalledVisualStudioFlag()) {
        return `--msvs_version=${vsVersion}`;
      }
    }

    dedupeModules(options, callback) {
      process.stdout.write('Deduping modules ');

      return this.forkDedupeCommand(options, (...args) => {
        return this.logCommandResults(callback, ...Array.from(args));
      });
    }

    forkDedupeCommand(options, callback) {
      let vsArgs;
      const dedupeArgs = ['--globalconfig', config.getGlobalConfigPath(), '--userconfig', config.getUserConfigPath(), 'dedupe'];
      dedupeArgs.push("--runtime=electron");
      dedupeArgs.push(`--target=${this.electronVersion}`);
      dedupeArgs.push(`--arch=${config.getElectronArch()}`);
      if (options.argv.silent) { dedupeArgs.push('--silent'); }
      if (options.argv.quiet) { dedupeArgs.push('--quiet'); }

      if (vsArgs = this.getVisualStudioFlags()) {
        dedupeArgs.push(vsArgs);
      }

      for (let packageName of Array.from(options.argv._)) { dedupeArgs.push(packageName); }

      const env = _.extend({}, process.env, {HOME: this.atomNodeDirectory, RUSTUP_HOME: config.getRustupHomeDirPath()});
      if (config.isWin32()) { env.USERPROFILE = env.HOME; }
      const dedupeOptions = {env};
      if (options.cwd) { dedupeOptions.cwd = options.cwd; }

      return this.fork(this.atomNpmPath, dedupeArgs, dedupeOptions, callback);
    }

    createAtomDirectories() {
      fs.makeTreeSync(this.atomDirectory);
      return fs.makeTreeSync(this.atomNodeDirectory);
    }

    run(options) {
      const {callback, cwd} = options;
      options = this.parseOptions(options.commandArgs);
      options.cwd = cwd;

      this.createAtomDirectories();

      const commands = [];
      commands.push(callback => this.loadInstalledAtomMetadata(callback));
      commands.push(callback => this.installNode(callback));
      commands.push(callback => this.dedupeModules(options, callback));
      return async.waterfall(commands, callback);
    }
  };
  Dedupe.initClass();
  return Dedupe;
})());
