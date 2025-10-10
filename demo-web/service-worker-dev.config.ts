import path from 'path';
import webpack from 'webpack';
// in case you run into any typescript error when configuring `devServer`
import 'webpack-dev-server';

const config: webpack.Configuration = {
  mode: 'development',
  module: {
    rules: [
      {
		test: /\.mjs$/,
		exclude: /node_modules/,
		use: { loader: "babel-loader" }
      },
    ]
  },
  entry: {'service-worker': './src/cgi-worker.mjs'},
  output: {
    path: path.resolve(__dirname, 'public'),
    filename: 'cgi-worker.js',
    publicPath: '/',
  },
  target: 'webworker',
  devtool: 'source-map'
};

export default config;
