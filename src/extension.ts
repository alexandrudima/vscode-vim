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

export function deactivate() {
}

export function activate(context: vscode.ExtensionContext) {
	console.log('I am activated!');

	vscode.commands.registerCommand('type', function(args) {
		if (!vscode.window.activeTextEditor) {
			return;
		}
		_inputHandler.type(args.text);
	});
	vscode.commands.registerCommand('replacePreviousChar', function(args) {
		if (!vscode.window.activeTextEditor) {
			return;
		}
		_inputHandler.replacePrevChar(args.text, args.replaceCharCnt);
	});
	vscode.commands.registerCommand('vim.goToNormalMode', function(args) {
		_inputHandler.goToNormalMode();
	});
	vscode.commands.registerCommand('vim.clearInput', function(args) {
		_inputHandler.clearInput();
	});
	// vscode.commands.registerCommand('paste', function(args) {
	// 	console.log('paste with: ', args.text, args.pasteOnNewLine);
	// });
	// vscode.commands.registerCommand('cut', function(args) {
	// 	console.log('cut (no args)');
	// });
};

// let NORMAL_MODE = 0, INSERT_MODE = 1;



// vscode.window.activeTextEditor
// {

// }

function getConfiguredWordSeparators(): string {
	let editorConfig = vscode.workspace.getConfiguration('editor');
	return editorConfig['wordSeparators'];
}

class InputHandler /*implements IController*/ {

	// private _currentMode: Mode;
	// private _currentInput: string;
	// private _hasInput: boolean;
	// private _motionState: MotionState;

	// public get motionState(): MotionState { return this._motionState; }
	// public get editor(): vscode.TextEditor { return vscode.window.activeTextEditor; }
	// public findMotion(input:string): Motion { return Mappings.findMotion(input); }

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
		this._controller._ensureNormalModePosition();
		vscode.window.onDidChangeTextEditorSelection((e) => {
			this._controller._ensureNormalModePosition();
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



	// private _updateStatus(): void {

	// 	let hasInput = (this._currentInput.length > 0);
	// 	if (this._hasInput !== hasInput) {
	// 		this._hasInput = hasInput;
	// 		vscode.commands.executeCommand('setContext', 'vim.hasInput', this._hasInput);
	// 	}
	// }




}

let _statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
_statusBar.show();
let _inputHandler = new InputHandler();

// function setPositionAndReveal(line, char) {
// 	vscode.window.activeTextEditor.selection = new vscode.Selection(new vscode.Position(line, char), new vscode.Position(line, char));
// 	vscode.window.activeTextEditor.revealRange(vscode.window.activeTextEditor.selection, vscode.TextEditorRevealType.Default);
// }
// function activePosition() {
// 	return vscode.window.activeTextEditor.selection.active;
// }
// function activeDocument() {
// 	return vscode.window.activeTextEditor.document;
// }
