'use strict';

import * as vscode from 'vscode';

import {Words} from './words';
import {MotionState, Motion, Motions} from './motions';
import {Mode, IController, Operator, Operators} from './operators';

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
	private hasInput: boolean;
	private _motionState: MotionState;

	private CHAR_TO_OPERATOR: {[char:string]:Operator;}
	private CHAR_TO_MOTION: {[char:string]:Motion;}

	public get motionState(): MotionState { return this._motionState; }
	public get editor(): vscode.TextEditor { return vscode.window.activeTextEditor; }

	constructor() {
		this._motionState = new MotionState();
		this.setMode(Mode.NORMAL_MODE);
		vscode.window.onDidChangeActiveTextEditor((textEditor) => {
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
		if (this._currentMode !== Mode.NORMAL_MODE) {
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
		if (this._currentMode === Mode.NORMAL_MODE) {
			return;
		}
		this.setMode(Mode.NORMAL_MODE);
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

			let inNormalMode = (this._currentMode === Mode.NORMAL_MODE);
			vscode.commands.executeCommand('setContext', 'vim.inNormalMode', inNormalMode);
			this._ensureNormalModePosition();
		}
		this._updateStatus();
	}

	public type(text:string): void {
		if (this._currentMode === Mode.NORMAL_MODE) {
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
		if (this.hasInput !== hasInput) {
			this.hasInput = hasInput;
			vscode.commands.executeCommand('setContext', 'vim.hasInput', this.hasInput);
		}
	}

	public replacePrevChar(text:string, replaceCharCnt:number): void {
		if (this._currentMode === Mode.NORMAL_MODE) {
			console.log('TODO: default mode replacePrevChar: ', arguments);
		} else {
			vscode.commands.executeCommand('default:replacePrevChar', {
				text: text,
				replaceCharCnt: replaceCharCnt
			});
		}
	}

	private getCursorStyle(): vscode.TextEditorCursorStyle {
		if (this._currentMode === Mode.NORMAL_MODE) {
			return vscode.TextEditorCursorStyle.Block;
		} else {
			return vscode.TextEditorCursorStyle.Line;
		}
	}

	private getStatusText(): string {
		if (this._currentMode === Mode.NORMAL_MODE) {
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
		if (!this.CHAR_TO_MOTION) {
			this.CHAR_TO_MOTION = {};
			let defineMotion = (char:string, motion:Motion) => {
				this.CHAR_TO_MOTION[char] = motion;
			};

			defineMotion('w', Motions.NextWordStart);
			defineMotion('e', Motions.NextWordEnd);
			defineMotion('$', Motions.EndOfLine);
			defineMotion('0', Motions.StartOfLine);
			defineMotion('h', Motions.Left);
			defineMotion('j', Motions.Down);
			defineMotion('k', Motions.Up);
			defineMotion('l', Motions.Right);
		}

		if (!this.CHAR_TO_OPERATOR) {
			this.CHAR_TO_OPERATOR = {};
			let defineOperator = (char:string, operator:Operator) => {
				this.CHAR_TO_OPERATOR[char] = operator;
			};

			defineOperator('x', Operators.DeleteCharUnderCursor);
			defineOperator('i', Operators.Insert);
			defineOperator('a', Operators.Append);
			defineOperator('A', Operators.AppendEndOfLine);
			defineOperator('d', Operators.DeleteTo);
		}

		let operator = this.findOperator(this._currentInput);
		if (operator) {
			if (operator.run()) {
				console.log('OPERATOR CLEARS INPUT');
				this._currentInput = '';
			}
			return;
		}

		let motion = this.findMotion(this._currentInput);
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

		// // is it operator
		// if (/^[1-9]\d*$/.test(this._currentInput)) {
		// 	return;
		// }

		// beep!!
		this._currentInput = '';
	}

	public findMotion(input:string): Motion {
		let parsed = InputHandler._parseNumberAndString(input);
		let motion = this.CHAR_TO_MOTION[parsed.input];
		if (!motion) {
			return null;
		}
		return motion.repeat(parsed.repeatCount);
	}

	private findOperator(input:string):{run:()=>void;} {
		let parsed = InputHandler._parseNumberAndString(input);
		let operator = this.CHAR_TO_OPERATOR[parsed.input.charAt(0)];
		if (!operator) {
			return null;
		}
		return {
			run: () => {
				let operatorArgs = parsed.input.substr(1);
				return operator.run(this, parsed.repeatCount, operatorArgs);
			}
		};
	}

	private static _parseNumberAndString(input:string): INumberAndString {
		let repeatCountMatch = input.match(/^([1-9]\d*)/);
		if (repeatCountMatch) {
			return {
				repeatCount: parseInt(repeatCountMatch[0], 10),
				input: input.substr(repeatCountMatch[0].length)
			};
		}
		return {
			repeatCount: 1,
			input: input
		}
	}
}

interface INumberAndString {
	repeatCount: number;
	input: string;
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
function activeEditor() {
	return vscode.window.activeTextEditor;
}