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
import {Mode, IController} from './common';
import {Mappings} from './mappings';

export interface IDriver {
	getActiveTextEditor(): TextEditor;
}

export class Controller implements IController {

	private _currentMode: Mode;
	private _currentInput: string;
	private _motionState: MotionState;

	// Only available while in `type` method
	public editor: TextEditor;
	public get motionState(): MotionState { return this._motionState; }
	public findMotion(input: string): Motion { return Mappings.findMotion(input); }

	constructor() {
		this._motionState = new MotionState();
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

	public type(editor: TextEditor, text: string): boolean {
		if (this._currentMode !== Mode.NORMAL) {
			return false;
		}
		this.editor = editor;
		this._currentInput += text;
		this._interpretNormalModeInput();
		this.editor = null;
		return true;
	}

	public replacePrevChar(text: string, replaceCharCnt: number): boolean {
		if (this._currentMode !== Mode.NORMAL) {
			return false;
		}
		// Not supporting IME building at this time
		return true;
	}

	private _interpretNormalModeInput(): void {
		let operator = Mappings.findOperator(this._currentInput);
		if (operator) {
			if (operator(this)) {
				this._currentInput = '';
			}
			return;
		}

		let motion = Mappings.findMotion(this._currentInput);
		if (motion) {
			let newPos = motion.run(this.editor.document, this.editor.selection.active, this._motionState);
			setPositionAndReveal(this.editor, newPos.line, newPos.character);
			this._currentInput = '';
			return;
		}

		// is it motion building
		if (/^[1-9]\d*$/.test(this._currentInput)) {
			return;
		}

		// INVALID INPUT - beep!!
		this._currentInput = '';
	}
}

function setPositionAndReveal(editor: TextEditor, line: number, char: number): void {
	editor.selection = new Selection(new Position(line, char), new Position(line, char));
	editor.revealRange(editor.selection, TextEditorRevealType.Default);
}
