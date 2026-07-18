const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const dotenv = require('dotenv');
const webpack = require('webpack');

dotenv.config();
const mode = process.env.BUILD_MODE || 'production';
const isDevelopment = mode === 'development';

// Configure the external handling based on mode
const configureExternals = () => {
  const baseExternals = {
    vscode: "commonjs vscode"
  };

  // In production, treat tghclparser as external
  if (!isDevelopment) {
    baseExternals.tghclparser = "commonjs tghclparser";
  }

  return baseExternals;
};

const commonPlugins = [
  new webpack.DefinePlugin({
    'process.env.BUILD_MODE': JSON.stringify(mode)
  })
];

// Configure module resolution based on mode
const configureResolve = () => {
  const baseResolve = {
    extensions: [".ts", ".js"],
    symlinks: true,
  };

  // In development, add alias for local tghclparser
  if (isDevelopment) {
    baseResolve.alias = {
      'tghclparser': path.resolve(__dirname, '../tghclparser')
    };
  }

  return baseResolve;
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
  },
  devtool: isDevelopment ? 'source-map' : false,
  externals: configureExternals(),
  resolve: configureResolve(),
  watchOptions: isDevelopment ? {
    followSymlinks: true,
    ignored: /node_modules\/(?!tghclparser)/
  } : undefined,
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: isDevelopment ? /node_modules\/(?!tghclparser)/ : /node_modules/,
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
    new CopyPlugin({
      patterns: [{ from: "media", to: "media" }],
    }),
  ],
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
  },
  devtool: isDevelopment ? 'source-map' : false,
  externals: configureExternals(),
  resolve: configureResolve(),
  watchOptions: isDevelopment ? {
    followSymlinks: true,
    ignored: /node_modules\/(?!tghclparser)/
  } : undefined,
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: isDevelopment ? /node_modules\/(?!tghclparser)/ : /node_modules/,
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