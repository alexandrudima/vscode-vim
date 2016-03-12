/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';

import {Words} from './words';
import {MotionState, Motion, Motions} from './motions';
import {Operator, Operators} from './operators';
import {Mode, IController} from './common';
import {Mappings} from './mappings';
import {Controller} from './controller';

export function activate(context: vscode.ExtensionContext) {
	function registerCommandNice(commandId:string, run:(...args:any[])=>void): void {
		context.subscriptions.push(vscode.commands.registerCommand(commandId, run));
	}

	registerCommandNice('type', function(args) {
		if (!vscode.window.activeTextEditor) {
			return;
		}
		_inputHandler.type(args.text);
	});
	registerCommandNice('replacePreviousChar', function(args) {
		if (!vscode.window.activeTextEditor) {
			return;
		}
		_inputHandler.replacePrevChar(args.text, args.replaceCharCnt);
	});
	registerCommandNice('vim.goToNormalMode', function(args) {
		_inputHandler.goToNormalMode();
	});
	registerCommandNice('vim.clearInput', function(args) {
		_inputHandler.clearInput();
	});
	// registerCommandNice('paste', function(args) {
	// 	console.log('paste with: ', args.text, args.pasteOnNewLine);
	// });
	// registerCommandNice('cut', function(args) {
	// 	console.log('cut (no args)');
	// });
}

export function deactivate() {
	// Everything is nicely registered in context.subscriptions,
	// so nothing to do for now.
}

function getConfiguredWordSeparators(): string {
	let editorConfig = vscode.workspace.getConfiguration('editor');
	return editorConfig['wordSeparators'];
}

class InputHandler {

	private _controller: Controller;

	constructor() {
		this._controller = new Controller({
			getActiveTextEditor: () => {
				return vscode.window.activeTextEditor;
			}
		}, getConfiguredWordSeparators())

		vscode.window.onDidChangeActiveTextEditor((textEditor) => {
			if (!textEditor) {
				return;
			}
			this._ensureState();
		});

		// TODO: do it better!
		this._controller.ensureNormalModePosition();
		vscode.window.onDidChangeTextEditorSelection((e) => {
			this._controller.ensureNormalModePosition();
		});

		vscode.workspace.onDidChangeConfiguration(() => {
			this._controller.setWordSeparators(getConfiguredWordSeparators());
		});

		this._ensureState();
	}

	public goToNormalMode(): void {
		this._controller.setMode(Mode.NORMAL);
		this._ensureState();
	}

	public clearInput(): void {
		this._controller.clearInput();
		this._ensureState();
	}

	public type(text: string): void {
		if (this._controller.type(text)) {
			this._ensureState();
			return;
		}
		vscode.commands.executeCommand('default:type', {
			text: text
		});
	}

	public replacePrevChar(text: string, replaceCharCnt: number): void {
		if (this._controller.replacePrevChar(text, replaceCharCnt)) {
			this._ensureState();
			return;
		}
		vscode.commands.executeCommand('default:replacePrevChar', {
			text: text,
			replaceCharCnt: replaceCharCnt
		});
	}

	private _ensureState(): void {
		// 1. status bar
		this._ensureStatusText(this._controller.getStatusText());

		// 2. cursor style
		this._ensureCursorStyle(this._controller.getCursorStyle());

		// 3. context: vim.inNormalMode
		this._ensureContextInNormalMode(this._controller.getMode() === Mode.NORMAL);

		// 4. context: vim.hasInput
		this._ensureContextHasInput(this._controller.hasInput());
	}

	private _lastStatusText: string;
	private _ensureStatusText(text: string): void {
		if (this._lastStatusText === text) {
			return;
		}
		this._lastStatusText = text;
		_statusBar.text = this._lastStatusText;
	}

	private _ensureCursorStyle(cursorStyle: vscode.TextEditorCursorStyle): void {
		let currentCursorStyle = vscode.window.activeTextEditor.options.cursorStyle;
		if (currentCursorStyle !== cursorStyle) {
			vscode.window.activeTextEditor.options = {
				cursorStyle: cursorStyle
			};
		}
	}

	private _lastInNormalMode: boolean;
	private _ensureContextInNormalMode(inNormalMode: boolean): void {
		if (this._lastInNormalMode === inNormalMode) {
			return;
		}
		this._lastInNormalMode = inNormalMode;
		vscode.commands.executeCommand('setContext', 'vim.inNormalMode', inNormalMode);
	}

	private _lastHasInput: boolean;
	private _ensureContextHasInput(hasInput: boolean): void {
		if (this._lastHasInput === hasInput) {
			return;
		}
		this._lastHasInput = hasInput;
		vscode.commands.executeCommand('setContext', 'vim.hasInput', hasInput);
	}
}

let _statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
_statusBar.show();
let _inputHandler = new InputHandler();

