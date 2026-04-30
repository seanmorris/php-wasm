import js from '@eslint/js';
import globals from 'globals';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import smNoSaccadeStyle from 'sm-no-saccade-style';

const [smRecommended] = smNoSaccadeStyle.configs.recommended;

const appFiles = ['src/**/*.{js,mjs}'];

export default [
	js.configs.recommended
	, {
		ignores: [
			'build/**'
			, 'coverage/**'
			, 'public/**'
		]
	}
	, {
		files: appFiles
		, languageOptions: {
			ecmaVersion: 'latest'
			, sourceType: 'module'
			, parserOptions: {
				ecmaFeatures: {
					jsx: true
				}
			}
			, globals: {
				...globals.browser
				, ...globals.serviceworker
			}
		}
		, plugins: {
			react: reactPlugin
			, 'react-hooks': reactHooks
			, 'jsx-a11y': jsxA11y
		}
		, settings: {
			react: {
				version: 'detect'
			}
		}
		, rules: {
			...reactPlugin.configs.recommended.rules
			, ...reactPlugin.configs['jsx-runtime'].rules
			, ...jsxA11y.configs.recommended.rules
			, 'react-hooks/rules-of-hooks': 'error'
			, 'react-hooks/exhaustive-deps': 'warn'
			, 'no-case-declarations': 'off'
			, 'no-constant-binary-expression': 'off'
			, 'no-empty': 'off'
			, 'no-unused-vars': 'warn'
			, 'react/display-name': 'off'
			, 'react/jsx-no-target-blank': 'warn'
			, 'react/prop-types': 'off'
			, 'jsx-a11y/alt-text': 'warn'
			, 'jsx-a11y/anchor-is-valid': 'off'
			, 'jsx-a11y/click-events-have-key-events': 'off'
			, 'jsx-a11y/label-has-associated-control': 'off'
			, 'jsx-a11y/no-autofocus': 'off'
			, 'jsx-a11y/no-noninteractive-element-interactions': 'off'
			, 'jsx-a11y/no-noninteractive-tabindex': 'off'
			, 'jsx-a11y/no-static-element-interactions': 'off'
		}
	}
	, {
		files: ['src/**/*.test.{js,mjs}']
		, languageOptions: {
			globals: {
				...globals.browser
				, ...globals.vitest
			}
		}
	}
	, {
		files: ['eslint.config.mjs', 'vite.config.mjs', 'vite.worker.config.mjs']
		, languageOptions: {
			ecmaVersion: 'latest'
			, sourceType: 'module'
			, globals: globals.node
		}
	}
	, {
		...smRecommended
		, files: [
			'eslint.config.mjs'
			, 'vite.config.mjs'
			, 'vite.worker.config.mjs'
			, 'src/**/*.{js,mjs}'
			, 'test/**/*.{js,mjs}'
		]
	}
];
