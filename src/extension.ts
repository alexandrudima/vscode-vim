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



class InputHandler implements IController {

	private _currentMode: Mode;
	private _currentInput: string;
	private _hasInput: boolean;
	private _motionState: MotionState;

	public get motionState(): MotionState { return this._motionState; }
	public get editor(): vscode.TextEditor { return vscode.window.activeTextEditor; }
	public findMotion(input:string): Motion { return Mappings.findMotion(input); }

	constructor() {
		this._motionState = new MotionState();
		this.setMode(Mode.NORMAL);
		vscode.window.onDidChangeActiveTextEditor((textEditor) => {
			if (!textEditor) {
				return;
			}
			textEditor.options = {
				cursorStyle: this.getCursorStyle()
			};
		});

		vscode.window.onDidChangeTextEditorSelection((e) => {
			this._ensureNormalModePosition();
		});
		this._ensureNormalModePosition();

		vscode.workspace.onDidChangeConfiguration(() => {
			this._readConfig();
		});
		this._readConfig();
	}

	private _ensureNormalModePosition(): void {
		if (!vscode.window.activeTextEditor) {
			return;
		}
		if (this._currentMode !== Mode.NORMAL) {
			return;
		}
		let sel = vscode.window.activeTextEditor.selection;
		if (!sel.isEmpty) {
			return;
		}
		let pos = sel.active;
		let doc = activeDocument();
		let lineContent = doc.lineAt(pos.line).text;
		if (lineContent.length === 0) {
			return;
		}
		let maxCharacter = lineContent.length - 1;
		if (pos.character > maxCharacter) {
			setPositionAndReveal(pos.line, maxCharacter);
		}
	}

	private _readConfig(): void {
		let editorConfig = vscode.workspace.getConfiguration('editor');
		let wordSeparators = editorConfig.wordSeparators;

		this._motionState.wordCharacterClass = Words.createWordCharacters(wordSeparators);
	}

	public goToNormalMode(): void {
		if (this._currentMode === Mode.NORMAL) {
			return;
		}
		this.setMode(Mode.NORMAL);
	}

	public clearInput(): void {
		this._currentInput = '';
		this._updateStatus();
	}

	public setMode(newMode:Mode): void {
		if (newMode !== this._currentMode) {
			this._currentMode = newMode;
			this._motionState.cursorDesiredCharacter = -1; // uninitialized
			this._currentInput = '';

			if (vscode.window.activeTextEditor) {
				vscode.window.activeTextEditor.options = {
					cursorStyle: this.getCursorStyle()
				};
			}

			let inNormalMode = (this._currentMode === Mode.NORMAL);
			vscode.commands.executeCommand('setContext', 'vim.inNormalMode', inNormalMode);
			this._ensureNormalModePosition();
		}
		this._updateStatus();
	}

	public type(text:string): void {
		if (this._currentMode === Mode.NORMAL) {
			this._currentInput += text;
			this._interpretNormalModeInput();
			this._updateStatus();
		} else {
			vscode.commands.executeCommand('default:type', {
				text: text
			});
		}
	}

	private _updateStatus(): void {
		_statusBar.text = this.getStatusText();
		let hasInput = (this._currentInput.length > 0);
		if (this._hasInput !== hasInput) {
			this._hasInput = hasInput;
			vscode.commands.executeCommand('setContext', 'vim.hasInput', this._hasInput);
		}
	}

	public replacePrevChar(text:string, replaceCharCnt:number): void {
		if (this._currentMode === Mode.NORMAL) {
			console.log('TODO: default mode replacePrevChar: ', arguments);
		} else {
			vscode.commands.executeCommand('default:replacePrevChar', {
				text: text,
				replaceCharCnt: replaceCharCnt
			});
		}
	}

	private getCursorStyle(): vscode.TextEditorCursorStyle {
		if (this._currentMode === Mode.NORMAL) {
			return vscode.TextEditorCursorStyle.Block;
		} else {
			return vscode.TextEditorCursorStyle.Line;
		}
	}

	private getStatusText(): string {
		if (this._currentMode === Mode.NORMAL) {
			if (this._currentInput) {
				return 'VIM:>' + this._currentInput;
			} else {
				return 'VIM:> -- NORMAL --';
			}
		} else {
			return 'VIM:> -- INSERT --';
		}
	}

	private _interpretNormalModeInput(): void {
		let operator = Mappings.findOperator(this._currentInput);
		if (operator) {
			if (operator(this)) {
				console.log('OPERATOR CLEARS INPUT');
				this._currentInput = '';
			}
			return;
		}

		let motion = Mappings.findMotion(this._currentInput);
		if (motion) {
			let newPos = motion.run(activeDocument(), activePosition(), this._motionState);
			setPositionAndReveal(newPos.line, newPos.character);
			this._currentInput = '';
			return;
		}

		console.log('FELL THROUGH: ' + this._currentInput);

		// is it motion building
		if (/^[1-9]\d*$/.test(this._currentInput)) {
			return;
		}

		// beep!!
		this._currentInput = '';
	}
}

let _statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
_statusBar.show();
let _inputHandler = new InputHandler();

function setPositionAndReveal(line, char) {
	vscode.window.activeTextEditor.selection = new vscode.Selection(new vscode.Position(line, char), new vscode.Position(line, char));
	vscode.window.activeTextEditor.revealRange(vscode.window.activeTextEditor.selection, vscode.TextEditorRevealType.Default);
}
function activePosition() {
	return vscode.window.activeTextEditor.selection.active;
}
function activeDocument() {
	return vscode.window.activeTextEditor.document;
}
