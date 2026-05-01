import globals from 'globals';
import { jsdoc } from 'eslint-plugin-jsdoc';
import smNoSaccadeStyle from 'sm-no-saccade-style';

const sourceLintFiles = ['source/**/*.{js,mjs}'];
const packageLintFiles = ['packages/**/8.*.{js,mjs}', 'packages/**/index.{js,mjs}'];
const lintFiles = [...sourceLintFiles, ...packageLintFiles];
const ignores = ['packages/php-wasm/stdlib/**/*'];

export default [
	...smNoSaccadeStyle.configs.recommended.map(
		config => ({
			...config
			, files: lintFiles
			, ignores
		})
	)
	, {
		files: sourceLintFiles
		, ignores
		, languageOptions: {
			sourceType: 'module'
			, ecmaVersion: 'latest'
			, globals: {
				...globals.browser
			}
		}
		, rules: {
			'jsdoc/no-undefined-types': ['warn', {
				definedTypes: [
				]
			}]
			, 'jsdoc/require-jsdoc': ['warn', {
				contexts: [
					'PropertyDefinition'
					, 'ClassProperty'
					, 'FunctionDeclaration'
					, 'MethodDefinition'
					, 'ClassDeclaration'
				]
			}]
		}
	}
	, {
		files: packageLintFiles
		, ignores
		, languageOptions: {
			sourceType: 'module'
			, ecmaVersion: 'latest'
			, globals: {
				...globals.browser
			}
		}
		, rules: {
			'jsdoc/no-undefined-types': ['warn', {
				definedTypes: [
				]
			}]
			, 'jsdoc/require-jsdoc': ['warn', {
				contexts: [
					'PropertyDefinition'
					, 'ClassProperty'
					, 'FunctionDeclaration'
					, 'MethodDefinition'
					, 'ClassDeclaration'
					, 'ArrowFunctionExpression'
				]
			}]
		}
	}
	, {
		...jsdoc({ config: 'flat/recommended' })
		, files: lintFiles
		, ignores
	}
];
