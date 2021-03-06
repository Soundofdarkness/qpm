# qpm - Quarks Package Manager

[![Linux Build Status](https://travis-ci.org/atom/qpm.svg?branch=master)](https://travis-ci.org/atom/qpm)
[![Windows Build Status](https://ci.appveyor.com/api/projects/status/j6ixw374a397ugkb/branch/master?svg=true)](https://ci.appveyor.com/project/Atom/qpm/branch/master)
[![Dependency Status](https://david-dm.org/atom/qpm.svg)](https://david-dm.org/atom/qpm)

Discover and install Atom packages powered by [atom.io](https://atom.io)

You can configure qpm by using the `qpm config` command line option (recommended) or by manually editing the `~/.atom/.qpmrc` file as per the [npm config](https://docs.npmjs.com/misc/config).

## Relation to npm

qpm bundles [npm](https://github.com/npm/npm) with it and spawns `npm` processes to install Atom packages. The major difference is that `qpm` sets multiple command line arguments to `npm` to ensure that native modules are built against Chromium's v8 headers instead of node's v8 headers.

The other major difference is that Atom packages are installed to `~/.atom/packages` instead of a local `node_modules` folder and Atom packages are published to and installed from GitHub repositories instead of [npmjs.com](https://www.npmjs.com/)

Therefore you can think of `qpm` as a simple `npm` wrapper that builds on top of the many strengths of `npm` but is customized and optimized to be used for Atom packages.

## Installing

`qpm` is bundled and installed automatically with Atom. You can run the _Atom > Install Shell Commands_ menu option to install it again if you aren't able to run it from a terminal (macOS only).

## Building

  * Clone the repository
  * :penguin: Install `libsecret-1-dev` (or the relevant `libsecret` development dependency) if you are on Linux
  * Run `npm install`; this will install the dependencies with your built-in version of Node/npm, and then rebuild them with the bundled versions.
  * Run `./bin/npm run build` to compile the CoffeeScript code (or `.\bin\npm.cmd run build` on Windows)
  * Run `./bin/npm test` to run the specs (or `.\bin\npm.cmd test` on Windows)

### Why `bin/npm` / `bin\npm.cmd`?

`qpm` includes `npm`, and spawns it for various processes. It also comes with a bundled version of Node, and this script ensures that npm uses the right version of Node for things like running the tests. If you're using the same version of Node as is listed in `BUNDLED_NODE_VERSION`, you can skip using this script.

## Using

Run `qpm help` to see all the supported commands and `qpm help <command>` to
learn more about a specific command.

The common commands are `qpm install <package_name>` to install a new package,
`qpm featured` to see all the featured packages, and `qpm publish` to publish
a package to [atom.io](https://atom.io).

## Behind a firewall?

If you are behind a firewall and seeing SSL errors when installing packages
you can disable strict SSL by running:

```
qpm config set strict-ssl false
```

## Using a proxy?

If you are using a HTTP(S) proxy you can configure `qpm` to use it by running:

```
qpm config set https-proxy https://9.0.2.1:0
```

You can run `qpm config get https-proxy` to verify it has been set correctly.

## Viewing configuration

You can also run `qpm config list` to see all the custom config settings.
