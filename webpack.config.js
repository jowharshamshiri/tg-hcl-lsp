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

// The package resolves to its UMD build by default; webpack needs the ESM one. Its "exports" map exposes only
// the entry point, so walk up from there to the package root rather than resolving the subpath directly.
const languageServerTypesEsm = (from) => {
  let dir = path.dirname(require.resolve('vscode-languageserver-types', {
    paths: [path.resolve(__dirname, from), __dirname]
  }));
  while (!fs.existsSync(path.join(dir, 'package.json'))) {
    dir = path.dirname(dir);
  }
  return path.join(dir, 'lib/esm/main.js');
};

const configureResolve = (languageServerTypesFrom, aliases = {}) => {
  return {
    extensions: [".ts", ".js"],
    symlinks: true,
    alias: {
      'vscode-languageserver-types$': languageServerTypesEsm(languageServerTypesFrom),
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
  resolve: configureResolve('client/node_modules/vscode-languageserver-types'),
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
  resolve: configureResolve('server/node_modules/vscode-languageserver-types', {
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
