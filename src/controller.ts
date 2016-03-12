/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {
	TextEditorCursorStyle,
	Position,
	Selection,
	TextEditor,
	TextEditorRevealType
} from 'vscode';

import {Words} from './words';
import {MotionState, Motion} from './motions';
import {Mode, IController, DeleteRegister} from './common';
import {Mappings} from './mappings';

export interface ITypeResult {
	hasConsumedInput: boolean;
	executeEditorCommand: string;
}

export class Controller implements IController {

	private _currentMode: Mode;
	private _currentInput: string;
	private _motionState: MotionState;

	public get motionState(): MotionState { return this._motionState; }
	public findMotion(input: string): Motion { return Mappings.findMotion(input); }

	private _deleteRegister:DeleteRegister;
	public setDeleteRegister(register:DeleteRegister): void { this._deleteRegister = register; }
	public getDeleteRegister(): DeleteRegister { return this._deleteRegister; }

	constructor() {
		this._motionState = new MotionState();
		this._deleteRegister = null;
		this.setMode(Mode.NORMAL);
	}

	public setWordSeparators(wordSeparators: string): void {
		this._motionState.wordCharacterClass = Words.createWordCharacters(wordSeparators);
	}

	public ensureNormalModePosition(editor: TextEditor): void {
		if (this._currentMode !== Mode.NORMAL) {
			return;
		}
		let sel = editor.selection;
		if (!sel.isEmpty) {
			return;
		}
		let pos = sel.active;
		let doc = editor.document;
		let lineContent = doc.lineAt(pos.line).text;
		if (lineContent.length === 0) {
			return;
		}
		let maxCharacter = lineContent.length - 1;
		if (pos.character > maxCharacter) {
			setPositionAndReveal(editor, pos.line, maxCharacter);
		}
	}

	public hasInput(): boolean {
		return this._currentInput.length > 0;
	}

	public clearInput(): void {
		this._currentInput = '';
	}

	public getMode(): Mode {
		return this._currentMode;
	}

	public setMode(newMode: Mode): void {
		if (newMode !== this._currentMode) {
			this._currentMode = newMode;
			this._motionState.cursorDesiredCharacter = -1; // uninitialized
			this._currentInput = '';
		}
	}

	public getCursorStyle(): TextEditorCursorStyle {
		if (this._currentMode === Mode.NORMAL) {
			return TextEditorCursorStyle.Block;
		} else {
			return TextEditorCursorStyle.Line;
		}
	}

	public getStatusText(): string {
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

	public type(editor: TextEditor, text: string): ITypeResult {
		if (this._currentMode !== Mode.NORMAL) {
			return {
				hasConsumedInput: false,
				executeEditorCommand: null
			};
		}
		this._currentInput += text;
		return this._interpretNormalModeInput(editor);
	}

	public replacePrevChar(text: string, replaceCharCnt: number): boolean {
		if (this._currentMode !== Mode.NORMAL) {
			return false;
		}
		// Not supporting IME building at this time
		return true;
	}

	private _interpretNormalModeInput(editor: TextEditor): ITypeResult {
		let command = Mappings.findCommand(this._currentInput);
		if (command) {
			return {
				hasConsumedInput: true,
				executeEditorCommand: command
			};
		}

		let operator = Mappings.findOperator(this._currentInput);
		if (operator) {
			if (operator(this, editor)) {
				this._currentInput = '';
			}
			return {
				hasConsumedInput: true,
				executeEditorCommand: null
			};
		}

		let motion = Mappings.findMotion(this._currentInput);
		if (motion) {
			let newPos = motion.run(editor.document, editor.selection.active, this._motionState);
			setPositionAndReveal(editor, newPos.line, newPos.character);
			this._currentInput = '';
			return {
				hasConsumedInput: true,
				executeEditorCommand: null
			};
		}

		// is it motion building
		if (/^[1-9]\d*$/.test(this._currentInput)) {
			return {
				hasConsumedInput: true,
				executeEditorCommand: null
			};
		}

		// INVALID INPUT - beep!!
		this._currentInput = '';

		return {
			hasConsumedInput: true,
			executeEditorCommand: null
		};
	}
}

function setPositionAndReveal(editor: TextEditor, line: number, char: number): void {
	editor.selection = new Selection(new Position(line, char), new Position(line, char));
	editor.revealRange(editor.selection, TextEditorRevealType.Default);
}
