import path from 'path';
import webpack from 'webpack';
// in case you run into any typescript error when configuring `devServer`
import 'webpack-dev-server';

const config: webpack.Configuration = {
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.mjs$/,
        exclude: /node_modules/,
        use: { loader: "babel-loader" }
      },
      {
        test: /\.(so|dat)$/,
        type: 'asset/resource',
        generator: {
          filename: '[name].[contenthash][ext]'
        },
      },
    ]
  },
  entry: {'service-worker': './src/cgi-worker.mjs'},
  output: {
    path: path.resolve(__dirname, 'public'),
    filename: 'cgi-worker.js',
  },
  target: 'webworker',
  plugins: [
    new webpack.DefinePlugin({
      'process.env': JSON.stringify({
        BUILD_TYPE: process.env.BUILD_TYPE ?? 'dynamic'
      })
    })
  ],
};

export default config;
