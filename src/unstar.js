/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let Unstar;
const async = require('async');
const yargs = require('yargs');

const config = require('./apm');
const Command = require('./command');
const Login = require('./login');
const request = require('./request');

module.exports =
(Unstar = (function() {
  Unstar = class Unstar extends Command {
    static initClass() {
      this.commandNames = ['unstar'];
    }

    parseOptions(argv) {
      const options = yargs(argv).wrap(100);
      options.usage(`\

Usage: apm unstar <package_name>...

Unstar the given packages on https://atom.io

Run \`apm stars\` to see all your starred packages.\
`
      );
      return options.alias('h', 'help').describe('help', 'Print this usage message');
    }

    starPackage(packageName, token, callback) {
      if (process.platform === 'darwin') { process.stdout.write('\uD83D\uDC5F \u2B50  '); }
      process.stdout.write(`Unstarring ${packageName} `);
      const requestSettings = {
        json: true,
        url: `${config.getAtomPackagesUrl()}/${packageName}/star`,
        headers: {
          authorization: token
        }
      };
      return request.del(requestSettings, (error, response, body) => {
        if (body == null) { body = {}; }
        if (error != null) {
          this.logFailure();
          return callback(error);
        } else if (response.statusCode !== 204) {
          let left;
          this.logFailure();
          const message = (left = body.message != null ? body.message : body.error) != null ? left : body;
          return callback(`Unstarring package failed: ${message}`);
        } else {
          this.logSuccess();
          return callback();
        }
      });
    }

    run(options) {
      const {callback} = options;
      options = this.parseOptions(options.commandArgs);
      const packageNames = this.packageNamesFromArgv(options.argv);

      if (packageNames.length === 0) {
        callback("Please specify a package name to unstar");
        return;
      }

      return Login.getTokenOrLogin((error, token) => {
        if (error != null) { return callback(error); }

        const commands = packageNames.map(packageName => {
          return callback => this.starPackage(packageName, token, callback);
        });
        return async.waterfall(commands, callback);
      });
    }
  };
  Unstar.initClass();
  return Unstar;
})());
