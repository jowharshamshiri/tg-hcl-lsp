const path = require("path");
const crypto = require('crypto');
const fs = require('fs');
const dotenv = require('dotenv');
const webpack = require('webpack');

dotenv.config();
const mode = process.env.BUILD_MODE || 'production';
const isDevelopment = mode === 'development';
const parserBundlePath = require.resolve('tghclparser', {
  paths: [path.resolve(__dirname, 'server')]
});

const parserBundleHash = crypto
  .createHash('sha256')
  .update(fs.readFileSync(parserBundlePath))
  .digest('hex');

const configureExternals = () => {
  return {
    vscode: "commonjs vscode"
  };
};

const commonPlugins = [
  new webpack.DefinePlugin({
    'process.env.BUILD_MODE': JSON.stringify(mode)
  })
];

// The directory holding the package.json of the package that `entry` belongs to. Packages' "exports" maps
// expose only their entry points, so a package root is found by walking up from one.
const packageRoot = (entry) => {
  let dir = path.dirname(entry);
  while (!fs.existsSync(path.join(dir, 'package.json'))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`No package.json above ${entry}`);
    dir = parent;
  }
  return dir;
};

// vscode-languageserver-types resolves to its UMD build by default; webpack needs the ESM one. The client and the
// server each bundle the version their own protocol package depends on -- vscode-languageclient and
// vscode-languageserver pin different ones -- so it is resolved through that protocol package. Resolving it from
// the client or server directory would find whichever version npm hoisted to the root, for both.
const languageServerTypesEsm = (side, library) => {
  const libraryRoot = packageRoot(require.resolve(library, { paths: [path.resolve(__dirname, side)] }));
  const protocolRoot = packageRoot(require.resolve('vscode-languageserver-protocol/node', { paths: [libraryRoot] }));
  const typesRoot = packageRoot(require.resolve('vscode-languageserver-types', { paths: [protocolRoot] }));
  return path.join(typesRoot, 'lib/esm/main.js');
};

const configureResolve = (languageServerTypes, aliases = {}) => {
  return {
    extensions: [".ts", ".js"],
    symlinks: true,
    alias: {
      'vscode-languageserver-types$': languageServerTypes,
      ...aliases
    }
  };
};

/** @type {import('webpack').Configuration} */
const clientConfig = {
  mode,
  target: "node",
  entry: "./client/src/extension.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "extension.js",
    libraryTarget: "commonjs2",
    clean: {
      keep: /^server\//
    }
  },
  devtool: isDevelopment ? 'source-map' : false,
  externals: configureExternals(),
  resolve: configureResolve(languageServerTypesEsm('client', 'vscode-languageclient/node')),
  watchOptions: isDevelopment ? {
    followSymlinks: true,
    ignored: /node_modules/
  } : undefined,
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader",
          },
        ],
      },
    ],
  },
  plugins: commonPlugins,
};

/** @type {import('webpack').Configuration} */
const serverConfig = {
  mode,
  target: "node",
  entry: "./server/src/server.ts",
  output: {
    path: path.resolve(__dirname, "dist/server"),
    filename: "server.js",
    libraryTarget: "commonjs2",
    clean: true,
  },
  devtool: isDevelopment ? 'source-map' : false,
  externals: configureExternals(),
  resolve: configureResolve(languageServerTypesEsm('server', 'vscode-languageserver/node'), {
    'tghclparser$': parserBundlePath
  }),
  watchOptions: isDevelopment ? {
    followSymlinks: true,
    ignored: /node_modules/
  } : undefined,
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader",
          },
        ],
      },
    ],
  },
  plugins: [
    ...commonPlugins,
    new webpack.BannerPlugin(`tghclparser-bundle-sha256:${parserBundleHash}`)
  ],
};

module.exports = [clientConfig, serverConfig];
