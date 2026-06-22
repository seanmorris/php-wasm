/**
 * Legacy webpack build for the CGI worker kept alongside the newer Vite pipeline.
 */
const path = require('node:path');
const webpack = require('webpack');

module.exports = (_, argv = {}) => {
	const mode = argv.mode || process.env.NODE_ENV || 'development';
	const libType = process.env.LIB_TYPE
		|| process.env.VITE_LIB_TYPE
		|| process.env.BUILD_TYPE
		|| process.env.VITE_BUILD_TYPE
		|| 'dynamic';

	return {
		mode
		, target: 'webworker'
		, devtool: mode === 'production' ? false : 'source-map'
		, experiments: {
			topLevelAwait: true
		}
		, entry: {
			'cgi-worker': './src/workers/cgi-worker.mjs'
		}
		, output: {
			path: path.resolve(__dirname, 'public')
			, filename: 'cgi-worker.js'
			, chunkFilename: '[name].cgi-worker.js'
			, importMetaName: 'self.__import_meta__'
			, publicPath: 'auto'
			, assetModuleFilename: '[name].[contenthash][ext]'
			, clean: false
		}
		, resolve: {
			extensions: ['.mjs', '.js', '.json']
		}
		, module: {
			rules: [
				{
					test: /\.[mc]?js$/
					, exclude: /node_modules/
					, use: {
						loader: 'babel-loader'
					}
				}
				, {
					test: /\.(so|dat)$/
					, type: 'asset/resource'
					, generator: {
						filename: '[name].[contenthash][ext]'
					}
				}
			]
		}
		, plugins: [
			new webpack.NormalModuleReplacementPlugin(
				/\.\/runtimePaths\.js$/,
				path.resolve(__dirname, 'src/lib/runtimePaths.worker.js')
			)
			,
			new webpack.DefinePlugin({
				__DEMO_LIB_TYPE__: JSON.stringify(libType),
				__DEMO_BUILD_TYPE__: JSON.stringify(libType)
			})
		]
	};
};
