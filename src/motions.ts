/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Position, TextDocument} from 'vscode';
import {Words, WordCharacters} from './words';

export class MotionState {

	public cursorDesiredCharacter: number;
	public wordCharacterClass: WordCharacters;

	constructor() {
		this.cursorDesiredCharacter = -1;
		this.wordCharacterClass = null;
	}

}

export abstract class Motion {
	public abstract run(doc: TextDocument, pos: Position, state: MotionState): Position;

	public repeat(count: number): Motion {
		if (count === 1) {
			return this;
		}
		return new RepeatingMotion(this, count);
	}
}

class RepeatingMotion extends Motion {

	private _actual: Motion;
	private _repeatCount: number;

	constructor(actual: Motion, repeatCount: number) {
		super();
		this._actual = actual;
		this._repeatCount = repeatCount;
	}

	public run(doc: TextDocument, pos: Position, state: MotionState): Position {
		for (var cnt = 0; cnt < this._repeatCount; cnt++) {
			pos = this._actual.run(doc, pos, state);
		}
		return pos;
	}
}

class MotionLeft extends Motion {
	public run(doc: TextDocument, pos: Position, state: MotionState): Position {
		let line = pos.line;

		if (pos.character > 0) {
			state.cursorDesiredCharacter = pos.character - 1;
			return new Position(line, state.cursorDesiredCharacter);
		}

		return pos;
	}
}

class MotionDown extends Motion {
	public run(doc: TextDocument, pos: Position, state: MotionState): Position {
		let line = pos.line;

		state.cursorDesiredCharacter = (state.cursorDesiredCharacter === -1 ? pos.character : state.cursorDesiredCharacter);

		if (line < doc.lineCount - 1) {
			line++;
			return new Position(line, Math.min(state.cursorDesiredCharacter, doc.lineAt(line).text.length));
		}

		return pos;
	}
}

class MotionUp extends Motion {
	public run(doc: TextDocument, pos: Position, state: MotionState): Position {
		let line = pos.line;

		state.cursorDesiredCharacter = (state.cursorDesiredCharacter === -1 ? pos.character : state.cursorDesiredCharacter);

		if (line > 0) {
			line--;
			return new Position(line, Math.min(state.cursorDesiredCharacter, doc.lineAt(line).text.length));
		}

		return pos;
	}
}

class MotionRight extends Motion {
	public run(doc: TextDocument, pos: Position, state: MotionState): Position {
		let line = pos.line;
		let maxCharacter = doc.lineAt(line).text.length;

		if (pos.character < maxCharacter) {
			state.cursorDesiredCharacter = pos.character + 1;
			return new Position(line, state.cursorDesiredCharacter);
		}

		return pos;
	}
}

class MotionEndOfLine extends Motion {
	public run(doc: TextDocument, pos: Position, state: MotionState): Position {
		return new Position(pos.line, doc.lineAt(pos.line).text.length);
	}
}

class MotionStartOfLine extends Motion {
	public run(doc: TextDocument, pos: Position, state: MotionState): Position {
		return new Position(pos.line, 0);
	}
}

class MotionNextWordStart extends Motion {
	public run(doc: TextDocument, pos: Position, state: MotionState): Position {
		let lineContent = doc.lineAt(pos.line).text;

		if (pos.character >= lineContent.length - 1) {
			// cursor at end of line
			return ((pos.line + 1 < doc.lineCount) ? new Position(pos.line + 1, 0) : pos);
		}

		let nextWord = Words.findNextWord(doc, pos, state.wordCharacterClass);

		if (!nextWord) {
			// return end of the line
			return Motions.EndOfLine.run(doc, pos, state);
		}

		if (nextWord.start <= pos.character && pos.character < nextWord.end) {
			// Sitting on a word
			let nextNextWord = Words.findNextWord(doc, new Position(pos.line, nextWord.end), state.wordCharacterClass);
			if (nextNextWord) {
				// return start of the next next word
				return new Position(pos.line, nextNextWord.start);
			} else {
				// return end of line
				return Motions.EndOfLine.run(doc, pos, state);
			}
		} else {
			// return start of the next word
			return new Position(pos.line, nextWord.start);
		}
	}
}

class MotionNextWordEnd extends Motion {
	public run(doc: TextDocument, pos: Position, state: MotionState): Position {
		let lineContent = doc.lineAt(pos.line).text;

		if (pos.character >= lineContent.length - 1) {
			// no content on this line or cursor at end of line
			return ((pos.line + 1 < doc.lineCount) ? new Position(pos.line + 1, 0) : pos);
		}

		let nextWord = Words.findNextWord(doc, pos, state.wordCharacterClass);

		if (!nextWord) {
			// return end of the line
			return Motions.EndOfLine.run(doc, pos, state);
		}

		// return start of the next word
		return new Position(pos.line, nextWord.end);
	}
}


export const Motions = {
	Left: new MotionLeft(),
	Down: new MotionDown(),
	Up: new MotionUp(),
	Right: new MotionRight(),
	EndOfLine: new MotionEndOfLine(),
	StartOfLine: new MotionStartOfLine(),
	NextWordStart: new MotionNextWordStart(),
	NextWordEnd: new MotionNextWordEnd(),
};
