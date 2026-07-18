const path = require("path");
const dotenv = require('dotenv');
const webpack = require('webpack');

dotenv.config();
const mode = process.env.BUILD_MODE || 'production';
const isDevelopment = mode === 'development';

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

const configureResolve = (languageServerTypesRoot) => {
  return {
    extensions: [".ts", ".js"],
    symlinks: true,
    alias: {
      'vscode-languageserver-types$': path.resolve(
        __dirname,
        languageServerTypesRoot,
        'lib/esm/main.js'
      )
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
  resolve: configureResolve('server/node_modules/vscode-languageserver-types'),
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

module.exports = [clientConfig, serverConfig];
