/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS104: Avoid inline assignments
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let Install;
const assert = require('assert');
const path = require('path');

const _ = require('underscore-plus');
const async = require('async');
const CSON = require('season');
const yargs = require('yargs');
const Git = require('git-utils');
const semver = require('semver');
const temp = require('temp');
const hostedGitInfo = require('hosted-git-info');

const config = require('./apm');
const Command = require('./command');
const fs = require('./fs');
const RebuildModuleCache = require('./rebuild-module-cache');
const request = require('./request');
const {isDeprecatedPackage} = require('./deprecated-packages');

module.exports =
(Install = (function() {
  Install = class Install extends Command {
    static initClass() {
      this.commandNames = ['install', 'i'];
    }

    constructor() {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.installNode = this.installNode.bind(this);
      this.installModules = this.installModules.bind(this);
      this.installGitPackageDependencies = this.installGitPackageDependencies.bind(this);
      this.atomDirectory = config.getAtomDirectory();
      this.atomPackagesDirectory = path.join(this.atomDirectory, 'packages');
      this.atomNodeDirectory = path.join(this.atomDirectory, '.node-gyp');
      this.atomNpmPath = require.resolve('npm/bin/npm-cli');
    }

    parseOptions(argv) {
      const options = yargs(argv).wrap(100);
      options.usage(`\

Usage: apm install [<package_name>...]
       apm install <package_name>@<package_version>
       apm install <git_remote>
       apm install <github_username>/<github_project>
       apm install --packages-file my-packages.txt
       apm i (with any of the previous argument usage)

Install the given Atom package to ~/.atom/packages/<package_name>.

If no package name is given then all the dependencies in the package.json
file are installed to the node_modules folder in the current working
directory.

A packages file can be specified that is a newline separated list of
package names to install with optional versions using the
\`package-name@version\` syntax.\
`
      );
      options.alias('c', 'compatible').string('compatible').describe('compatible', 'Only install packages/themes compatible with this Atom version');
      options.alias('h', 'help').describe('help', 'Print this usage message');
      options.alias('s', 'silent').boolean('silent').describe('silent', 'Set the npm log level to silent');
      options.alias('q', 'quiet').boolean('quiet').describe('quiet', 'Set the npm log level to warn');
      options.boolean('check').describe('check', 'Check that native build tools are installed');
      options.boolean('verbose').default('verbose', false).describe('verbose', 'Show verbose debug information');
      options.string('packages-file').describe('packages-file', 'A text file containing the packages to install');
      return options.boolean('production').describe('production', 'Do not install dev dependencies');
    }

    installNode(callback) {
      let left;
      const installNodeArgs = ['install'];
      installNodeArgs.push("--runtime=electron");
      installNodeArgs.push(`--target=${this.electronVersion}`);
      installNodeArgs.push(`--dist-url=${config.getElectronUrl()}`);
      installNodeArgs.push(`--arch=${config.getElectronArch()}`);
      installNodeArgs.push("--ensure");
      if (this.verbose) { installNodeArgs.push("--verbose"); }

      const env = _.extend({}, process.env, {HOME: this.atomNodeDirectory, RUSTUP_HOME: config.getRustupHomeDirPath()});
      if (config.isWin32()) { env.USERPROFILE = env.HOME; }

      fs.makeTreeSync(this.atomDirectory);

      // node-gyp doesn't currently have an option for this so just set the
      // environment variable to bypass strict SSL
      // https://github.com/TooTallNate/node-gyp/issues/448
      const useStrictSsl = (left = this.npm.config.get('strict-ssl')) != null ? left : true;
      if (!useStrictSsl) { env.NODE_TLS_REJECT_UNAUTHORIZED = 0; }

      // Pass through configured proxy to node-gyp
      const proxy = this.npm.config.get('https-proxy') || this.npm.config.get('proxy') || env.HTTPS_PROXY || env.HTTP_PROXY;
      if (proxy) { installNodeArgs.push(`--proxy=${proxy}`); }

      const opts = {env, cwd: this.atomDirectory};
      if (this.verbose) { opts.streaming = true; }

      const atomNodeGypPath = process.env.ATOM_NODE_GYP_PATH || require.resolve('node-gyp/bin/node-gyp');
      return this.fork(atomNodeGypPath, installNodeArgs, opts, function(code, stderr, stdout) {
        if (stderr == null) { stderr = ''; }
        if (stdout == null) { stdout = ''; }
        if (code === 0) {
          return callback();
        } else {
          return callback(`${stdout}\n${stderr}`);
        }
      });
    }

    installModule(options, pack, modulePath, callback) {
      let installDirectory, nodeModulesDirectory, vsArgs;
      const installGlobally = options.installGlobally != null ? options.installGlobally : true;

      const installArgs = ['--globalconfig', config.getGlobalConfigPath(), '--userconfig', config.getUserConfigPath(), 'install'];
      installArgs.push(modulePath);
      installArgs.push("--runtime=electron");
      installArgs.push(`--target=${this.electronVersion}`);
      installArgs.push(`--arch=${config.getElectronArch()}`);
      if (installGlobally) { installArgs.push("--global-style"); }
      if (options.argv.silent) { installArgs.push('--silent'); }
      if (options.argv.quiet) { installArgs.push('--quiet'); }
      if (options.argv.production) { installArgs.push('--production'); }

      if (vsArgs = this.getVisualStudioFlags()) {
        installArgs.push(vsArgs);
      }

      const env = _.extend({}, process.env, {HOME: this.atomNodeDirectory, RUSTUP_HOME: config.getRustupHomeDirPath()});
      this.addBuildEnvVars(env);
      const installOptions = {env};
      if (this.verbose) { installOptions.streaming = true; }

      if (installGlobally) {
        installDirectory = temp.mkdirSync('apm-install-dir-');
        nodeModulesDirectory = path.join(installDirectory, 'node_modules');
        fs.makeTreeSync(nodeModulesDirectory);
        installOptions.cwd = installDirectory;
      }

      return this.fork(this.atomNpmPath, installArgs, installOptions, (code, stderr, stdout) => {
        if (stderr == null) { stderr = ''; }
        if (stdout == null) { stdout = ''; }
        if (code === 0) {
          let child, destination;
          if (installGlobally) {
            const commands = [];
            const children = fs.readdirSync(nodeModulesDirectory)
              .filter(dir => dir !== ".bin");
            assert.equal(children.length, 1, "Expected there to only be one child in node_modules");
            child = children[0];
            const source = path.join(nodeModulesDirectory, child);
            destination = path.join(this.atomPackagesDirectory, child);
            commands.push(next => fs.cp(source, destination, next));
            commands.push(next => this.buildModuleCache(pack.name, next));
            commands.push(next => this.warmCompileCache(pack.name, next));

            return async.waterfall(commands, error => {
              if (error != null) {
                this.logFailure();
              } else {
                if (!options.argv.json) { this.logSuccess(); }
              }
              return callback(error, {name: child, installPath: destination});
            });
          } else {
            return callback(null, {name: child, installPath: destination});
          }
        } else {
          if (installGlobally) {
            fs.removeSync(installDirectory);
            this.logFailure();
          }

          let error = `${stdout}\n${stderr}`;
          if (error.indexOf('code ENOGIT') !== -1) { error = this.getGitErrorMessage(pack); }
          return callback(error);
        }
      });
    }

    getGitErrorMessage(pack) {
      let message = `\
Failed to install ${pack.name} because Git was not found.

The ${pack.name} package has module dependencies that cannot be installed without Git.

You need to install Git and add it to your path environment variable in order to install this package.
\
`;

      switch (process.platform) {
        case 'win32':
          message += `\

You can install Git by downloading, installing, and launching GitHub for Windows: https://windows.github.com
\
`;
          break;
        case 'linux':
          message += `\

You can install Git from your OS package manager.
\
`;
          break;
      }

      message += `\

Run apm -v after installing Git to see what version has been detected.\
`;

      return message;
    }

    installModules(options, callback) {
      if (!options.argv.json) { process.stdout.write('Installing modules '); }

      return this.forkInstallCommand(options, (...args) => {
        if (options.argv.json) {
          return this.logCommandResultsIfFail(callback, ...Array.from(args));
        } else {
          return this.logCommandResults(callback, ...Array.from(args));
        }
      });
    }

    forkInstallCommand(options, callback) {
      let vsArgs;
      const installArgs = ['--globalconfig', config.getGlobalConfigPath(), '--userconfig', config.getUserConfigPath(), 'install'];
      installArgs.push("--runtime=electron");
      installArgs.push(`--target=${this.electronVersion}`);
      installArgs.push(`--arch=${config.getElectronArch()}`);
      if (options.argv.silent) { installArgs.push('--silent'); }
      if (options.argv.quiet) { installArgs.push('--quiet'); }
      if (options.argv.production) { installArgs.push('--production'); }

      if (vsArgs = this.getVisualStudioFlags()) {
        installArgs.push(vsArgs);
      }

      const env = _.extend({}, process.env, {HOME: this.atomNodeDirectory, RUSTUP_HOME: config.getRustupHomeDirPath()});
      if (config.isWin32()) { this.updateWindowsEnv(env); }
      this.addNodeBinToEnv(env);
      this.addProxyToEnv(env);
      const installOptions = {env};
      if (options.cwd) { installOptions.cwd = options.cwd; }
      if (this.verbose) { installOptions.streaming = true; }

      return this.fork(this.atomNpmPath, installArgs, installOptions, callback);
    }

    // Request package information from the atom.io API for a given package name.
    //
    // packageName - The string name of the package to request.
    // callback - The function to invoke when the request completes with an error
    //            as the first argument and an object as the second.
    requestPackage(packageName, callback) {
      const requestSettings = {
        url: `${config.getAtomPackagesUrl()}/${packageName}`,
        json: true,
        retries: 4
      };
      return request.get(requestSettings, function(error, response, body) {
        let message;
        if (body == null) { body = {}; }
        if (error != null) {
          message = `Request for package information failed: ${error.message}`;
          if (error.code) { message += ` (${error.code})`; }
          return callback(message);
        } else if (response.statusCode !== 200) {
          message = request.getErrorMessage(response, body);
          return callback(`Request for package information failed: ${message}`);
        } else {
          if (body.releases.latest) {
            return callback(null, body);
          } else {
            return callback(`No releases available for ${packageName}`);
          }
        }
      });
    }

    // Download a package tarball.
    //
    // packageUrl - The string tarball URL to request
    // installGlobally - `true` if this package is being installed globally.
    // callback - The function to invoke when the request completes with an error
    //            as the first argument and a string path to the downloaded file
    //            as the second.
    downloadPackage(packageUrl, installGlobally, callback) {
      const requestSettings = {url: packageUrl};
      return request.createReadStream(requestSettings, readStream => {
        readStream.on('error', error => callback(`Unable to download ${packageUrl}: ${error.message}`));
        return readStream.on('response', response => {
          if (response.statusCode === 200) {
            const filePath = path.join(temp.mkdirSync(), 'package.tgz');
            const writeStream = fs.createWriteStream(filePath);
            readStream.pipe(writeStream);
            writeStream.on('error', error => callback(`Unable to download ${packageUrl}: ${error.message}`));
            return writeStream.on('close', () => callback(null, filePath));
          } else {
            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            return response.on('end', () => {
              try {
                let left;
                const error = JSON.parse(Buffer.concat(chunks));
                const message = (left = error.message != null ? error.message : error.error) != null ? left : error;
                if (installGlobally) { this.logFailure(); }
                return callback(`Unable to download ${packageUrl}: ${response.headers.status != null ? response.headers.status : response.statusCode} ${message}`);
              } catch (parseError) {
                if (installGlobally) { this.logFailure(); }
                return callback(`Unable to download ${packageUrl}: ${response.headers.status != null ? response.headers.status : response.statusCode}`);
              }
            });
          }
        });
      });
    }

    // Get the path to the package from the local cache.
    //
    //  packageName - The string name of the package.
    //  packageVersion - The string version of the package.
    //  callback - The function to call with error and cachePath arguments.
    //
    // Returns a path to the cached tarball or undefined when not in the cache.
    getPackageCachePath(packageName, packageVersion, callback) {
      const cacheDir = config.getCacheDirectory();
      const cachePath = path.join(cacheDir, packageName, packageVersion, 'package.tgz');
      if (fs.isFileSync(cachePath)) {
        const tempPath = path.join(temp.mkdirSync(), path.basename(cachePath));
        return fs.cp(cachePath, tempPath, function(error) {
          if (error != null) {
            return callback(error);
          } else {
            return callback(null, tempPath);
          }
        });
      } else {
        return process.nextTick(() => callback(new Error(`${packageName}@${packageVersion} is not in the cache`)));
      }
    }

    // Is the package at the specified version already installed?
    //
    //  * packageName: The string name of the package.
    //  * packageVersion: The string version of the package.
    isPackageInstalled(packageName, packageVersion) {
      try {
        let left;
        const {version} = (left = CSON.readFileSync(CSON.resolve(path.join('node_modules', packageName, 'package')))) != null ? left : {};
        return packageVersion === version;
      } catch (error) {
        return false;
      }
    }

    // Install the package with the given name and optional version
    //
    // metadata - The package metadata object with at least a name key. A version
    //            key is also supported. The version defaults to the latest if
    //            unspecified.
    // options - The installation options object.
    // callback - The function to invoke when installation completes with an
    //            error as the first argument.
    installRegisteredPackage(metadata, options, callback) {
      const packageName = metadata.name;
      let packageVersion = metadata.version;

      const installGlobally = options.installGlobally != null ? options.installGlobally : true;
      if (!installGlobally) {
        if (packageVersion && this.isPackageInstalled(packageName, packageVersion)) {
          callback(null, {});
          return;
        }
      }

      let label = packageName;
      if (packageVersion) { label += `@${packageVersion}`; }
      if (!options.argv.json) {
        process.stdout.write(`Installing ${label} `);
        if (installGlobally) {
          process.stdout.write(`to ${this.atomPackagesDirectory} `);
        }
      }

      return this.requestPackage(packageName, (error, pack) => {
        if (error != null) {
          this.logFailure();
          return callback(error);
        } else {
          if (packageVersion == null) { packageVersion = this.getLatestCompatibleVersion(pack); }
          if (!packageVersion) {
            this.logFailure();
            callback(`No available version compatible with the installed Atom version: ${this.installedAtomVersion}`);
            return;
          }

          const {tarball} = (pack.versions[packageVersion] != null ? pack.versions[packageVersion].dist : undefined) != null ? (pack.versions[packageVersion] != null ? pack.versions[packageVersion].dist : undefined) : {};
          if (!tarball) {
            this.logFailure();
            callback(`Package version: ${packageVersion} not found`);
            return;
          }

          const commands = [];
          commands.push(next => {
            return this.getPackageCachePath(packageName, packageVersion, (error, packagePath) => {
              if (packagePath) {
                return next(null, packagePath);
              } else {
                return this.downloadPackage(tarball, installGlobally, next);
              }
            });
          });
          const installNode = options.installNode != null ? options.installNode : true;
          if (installNode) {
            commands.push((packagePath, next) => {
              return this.installNode(error => next(error, packagePath));
            });
          }
          commands.push((packagePath, next) => {
            return this.installModule(options, pack, packagePath, next);
          });
          commands.push(function({installPath}, next) {
            if (installPath != null) {
              metadata = JSON.parse(fs.readFileSync(path.join(installPath, 'package.json'), 'utf8'));
              const json = {installPath, metadata};
              return next(null, json);
            } else {
              return next(null, {});
            }
          }); // installed locally, no install path data

          return async.waterfall(commands, (error, json) => {
            if (!installGlobally) {
              if (error != null) {
                this.logFailure();
              } else {
                if (!options.argv.json) { this.logSuccess(); }
              }
            }
            return callback(error, json);
          });
        }
      });
    }

    // Install all the package dependencies found in the package.json file.
    //
    // options - The installation options
    // callback - The callback function to invoke when done with an error as the
    //            first argument.
    installPackageDependencies(options, callback) {
      options = _.extend({}, options, {installGlobally: false, installNode: false});
      const commands = [];
      const object = this.getPackageDependencies();
      for (let name in object) {
        const version = object[name];
        ((name, version) => {
          return commands.push(next => {
            return this.installRegisteredPackage({name, version}, options, next);
          });
        })(name, version);
      }

      return async.series(commands, callback);
    }

    installDependencies(options, callback) {
      options.installGlobally = false;
      const commands = [];
      commands.push(this.installNode);
      commands.push(callback => this.installModules(options, callback));
      commands.push(callback => this.installPackageDependencies(options, callback));

      return async.waterfall(commands, callback);
    }

    // Get all package dependency names and versions from the package.json file.
    getPackageDependencies() {
      try {
        let left;
        const metadata = fs.readFileSync('package.json', 'utf8');
        const {packageDependencies} = (left = JSON.parse(metadata)) != null ? left : {};
        return packageDependencies != null ? packageDependencies : {};
      } catch (error) {
        return {};
      }
    }

    createAtomDirectories() {
      fs.makeTreeSync(this.atomDirectory);
      fs.makeTreeSync(this.atomPackagesDirectory);
      return fs.makeTreeSync(this.atomNodeDirectory);
    }

    // Compile a sample native module to see if a useable native build toolchain
    // is instlalled and successfully detected. This will include both Python
    // and a compiler.
    checkNativeBuildTools(callback) {
      process.stdout.write('Checking for native build tools ');
      return this.installNode(error => {
        let vsArgs;
        if (error != null) {
          this.logFailure();
          return callback(error);
        }

        const buildArgs = ['--globalconfig', config.getGlobalConfigPath(), '--userconfig', config.getUserConfigPath(), 'build'];
        buildArgs.push(path.resolve(__dirname, '..', 'native-module'));
        buildArgs.push("--runtime=electron");
        buildArgs.push(`--target=${this.electronVersion}`);
        buildArgs.push(`--arch=${config.getElectronArch()}`);

        if (vsArgs = this.getVisualStudioFlags()) {
          buildArgs.push(vsArgs);
        }

        const env = _.extend({}, process.env, {HOME: this.atomNodeDirectory, RUSTUP_HOME: config.getRustupHomeDirPath()});
        if (config.isWin32()) { this.updateWindowsEnv(env); }
        this.addNodeBinToEnv(env);
        this.addProxyToEnv(env);
        const buildOptions = {env};
        if (this.verbose) { buildOptions.streaming = true; }

        fs.removeSync(path.resolve(__dirname, '..', 'native-module', 'build'));

        return this.fork(this.atomNpmPath, buildArgs, buildOptions, (...args) => {
          return this.logCommandResults(callback, ...Array.from(args));
        });
      });
    }

    packageNamesFromPath(filePath) {
      filePath = path.resolve(filePath);

      if (!fs.isFileSync(filePath)) {
        throw new Error(`File '${filePath}' does not exist`);
      }

      const packages = fs.readFileSync(filePath, 'utf8');
      return this.sanitizePackageNames(packages.split(/\s/));
    }

    buildModuleCache(packageName, callback) {
      const packageDirectory = path.join(this.atomPackagesDirectory, packageName);
      const rebuildCacheCommand = new RebuildModuleCache();
      return rebuildCacheCommand.rebuild(packageDirectory, () =>
        // Ignore cache errors and just finish the install
        callback()
      );
    }

    warmCompileCache(packageName, callback) {
      const packageDirectory = path.join(this.atomPackagesDirectory, packageName);

      return this.getResourcePath(resourcePath => {
        try {
          const CompileCache = require(path.join(resourcePath, 'src', 'compile-cache'));

          const onDirectory = directoryPath => path.basename(directoryPath) !== 'node_modules';

          const onFile = filePath => {
            try {
              return CompileCache.addPathToCache(filePath, this.atomDirectory);
            } catch (error) {}
          };

          fs.traverseTreeSync(packageDirectory, onFile, onDirectory);
        } catch (error) {}
        return callback(null);
      });
    }

    isBundledPackage(packageName, callback) {
      return this.getResourcePath(function(resourcePath) {
        let atomMetadata;
        try {
          atomMetadata = JSON.parse(fs.readFileSync(path.join(resourcePath, 'package.json')));
        } catch (error) {
          return callback(false);
        }

        return callback(__guard__(atomMetadata != null ? atomMetadata.packageDependencies : undefined, x => x.hasOwnProperty(packageName)));
      });
    }

    getLatestCompatibleVersion(pack) {
      if (!this.installedAtomVersion) {
        if (isDeprecatedPackage(pack.name, pack.releases.latest)) {
          return null;
        } else {
          return pack.releases.latest;
        }
      }

      let latestVersion = null;
      const object = pack.versions != null ? pack.versions : {};
      for (let version in object) {
        const metadata = object[version];
        if (!semver.valid(version)) { continue; }
        if (!metadata) { continue; }
        if (isDeprecatedPackage(pack.name, version)) { continue; }

        const engine = (metadata.engines != null ? metadata.engines.atom : undefined) != null ? (metadata.engines != null ? metadata.engines.atom : undefined) : '*';
        if (!semver.validRange(engine)) { continue; }
        if (!semver.satisfies(this.installedAtomVersion, engine)) { continue; }

        if (latestVersion == null) { latestVersion = version; }
        if (semver.gt(version, latestVersion)) { latestVersion = version; }
      }

      return latestVersion;
    }

    getHostedGitInfo(name) {
      return hostedGitInfo.fromUrl(name);
    }

    installGitPackage(packageUrl, options, callback) {
      const tasks = [];

      const cloneDir = temp.mkdirSync("atom-git-package-clone-");

      tasks.push((data, next) => {
        const urls = this.getNormalizedGitUrls(packageUrl);
        return this.cloneFirstValidGitUrl(urls, cloneDir, options, err => next(err, data));
      });

      tasks.push((data, next) => {
        return this.installGitPackageDependencies(cloneDir, options, err => next(err, data));
      });

      tasks.push((data, next) => {
        return this.getRepositoryHeadSha(cloneDir, function(err, sha) {
          data.sha = sha;
          return next(err, data);
        });
      });

      tasks.push(function(data, next) {
        const metadataFilePath = CSON.resolve(path.join(cloneDir, 'package'));
        return CSON.readFile(metadataFilePath, function(err, metadata) {
          data.metadataFilePath = metadataFilePath;
          data.metadata = metadata;
          return next(err, data);
        });
      });

      tasks.push(function(data, next) {
        data.metadata.apmInstallSource = {
          type: "git",
          source: packageUrl,
          sha: data.sha
        };
        return CSON.writeFile(data.metadataFilePath, data.metadata, err => next(err, data));
      });

      tasks.push((data, next) => {
        const {name} = data.metadata;
        const targetDir = path.join(this.atomPackagesDirectory, name);
        if (!options.argv.json) { process.stdout.write(`Moving ${name} to ${targetDir} `); }
        return fs.cp(cloneDir, targetDir, err => {
          if (err) {
            return next(err);
          } else {
            if (!options.argv.json) { this.logSuccess(); }
            const json = {installPath: targetDir, metadata: data.metadata};
            return next(null, json);
          }
        });
      });

      const iteratee = (currentData, task, next) => task(currentData, next);
      return async.reduce(tasks, {}, iteratee, callback);
    }

    getNormalizedGitUrls(packageUrl) {
      const packageInfo = this.getHostedGitInfo(packageUrl);

      if (packageUrl.indexOf('file://') === 0) {
        return [packageUrl];
      } else if (packageInfo.default === 'sshurl') {
        return [packageInfo.toString()];
      } else if (packageInfo.default === 'https') {
        return [packageInfo.https().replace(/^git\+https:/, "https:")];
      } else if (packageInfo.default === 'shortcut') {
        return [
          packageInfo.https().replace(/^git\+https:/, "https:"),
          packageInfo.sshurl()
        ];
      }
    }

    cloneFirstValidGitUrl(urls, cloneDir, options, callback) {
      return async.detectSeries(urls, (url, next) => {
        return this.cloneNormalizedUrl(url, cloneDir, options, error => next(!error));
      }
      , function(result) {
        if (!result) {
          const invalidUrls = `Couldn't clone ${urls.join(' or ')}`;
          const invalidUrlsError = new Error(invalidUrls);
          return callback(invalidUrlsError);
        } else {
          return callback();
        }
      });
    }

    cloneNormalizedUrl(url, cloneDir, options, callback) {
      // Require here to avoid circular dependency
      const Develop = require('./develop');
      const develop = new Develop();

      return develop.cloneRepository(url, cloneDir, options, err => callback(err));
    }

    installGitPackageDependencies(directory, options, callback) {
      options.cwd = directory;
      return this.installDependencies(options, callback);
    }

    getRepositoryHeadSha(repoDir, callback) {
      try {
        const repo = Git.open(repoDir);
        const sha = repo.getReferenceTarget("HEAD");
        return callback(null, sha);
      } catch (err) {
        return callback(err);
      }
    }

    run(options) {
      let packageNames;
      const {callback} = options;
      options = this.parseOptions(options.commandArgs);
      const packagesFilePath = options.argv['packages-file'];

      this.createAtomDirectories();

      if (options.argv.check) {
        config.loadNpm((error, npm) => {
          this.npm = npm;
          return this.loadInstalledAtomMetadata(() => {
            return this.checkNativeBuildTools(callback);
          });
        });
        return;
      }

      this.verbose = options.argv.verbose;
      if (this.verbose) {
        request.debug(true);
        process.env.NODE_DEBUG = 'request';
      }

      const installPackage = (name, nextInstallStep) => {
        const gitPackageInfo = this.getHostedGitInfo(name);

        if (gitPackageInfo || (name.indexOf('file://') === 0)) {
          return this.installGitPackage(name, options, nextInstallStep);
        } else if (name === '.') {
          return this.installDependencies(options, nextInstallStep);
        } else { // is registered package
          let version;
          const atIndex = name.indexOf('@');
          if (atIndex > 0) {
            version = name.substring(atIndex + 1);
            name = name.substring(0, atIndex);
          }

          return this.isBundledPackage(name, isBundledPackage => {
            if (isBundledPackage) {
              console.error(`\
The ${name} package is bundled with Atom and should not be explicitly installed.
You can run \`apm uninstall ${name}\` to uninstall it and then the version bundled
with Atom will be used.\
`.yellow
              );
            }
            return this.installRegisteredPackage({name, version}, options, nextInstallStep);
          });
        }
      };

      if (packagesFilePath) {
        try {
          packageNames = this.packageNamesFromPath(packagesFilePath);
        } catch (error1) {
          const error = error1;
          return callback(error);
        }
      } else {
        packageNames = this.packageNamesFromArgv(options.argv);
        if (packageNames.length === 0) { packageNames.push('.'); }
      }

      const commands = [];
      commands.push(callback => config.loadNpm((error, npm) => { this.npm = npm; return callback(error); }));
      commands.push(callback => this.loadInstalledAtomMetadata(() => callback()));
      packageNames.forEach(packageName => commands.push(callback => installPackage(packageName, callback)));
      const iteratee = (item, next) => item(next);
      return async.mapSeries(commands, iteratee, function(err, installedPackagesInfo) {
        if (err) { return callback(err); }
        installedPackagesInfo = _.compact(installedPackagesInfo);
        installedPackagesInfo = installedPackagesInfo.filter((item, idx) => packageNames[idx] !== ".");
        if (options.argv.json) { console.log(JSON.stringify(installedPackagesInfo, null, "  ")); }
        return callback(null);
      });
    }
  };
  Install.initClass();
  return Install;
})());

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}