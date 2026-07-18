const path = require("path");
const crypto = require('crypto');
const fs = require('fs');
const dotenv = require('dotenv');
const webpack = require('webpack');

dotenv.config();
const mode = process.env.BUILD_MODE || 'production';
const isDevelopment = mode === 'development';
const parserBundlePath = path.resolve(__dirname, '../tghclparser/dist/index.cjs');

if (!fs.existsSync(parserBundlePath)) {
  throw new Error(`Parser bundle not found: ${parserBundlePath}. Build tghclparser before bundling the extension.`);
}

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

const configureResolve = (languageServerTypesRoot, aliases = {}) => {
  return {
    extensions: [".ts", ".js"],
    symlinks: true,
    alias: {
      'vscode-languageserver-types$': path.resolve(
        __dirname,
        languageServerTypesRoot,
        'lib/esm/main.js'
      ),
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
