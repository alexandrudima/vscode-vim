/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Position, Selection, Range, TextDocument, TextEditor, TextEditorRevealType} from 'vscode';
import {MotionState, Motion, Motions} from './motions';
import {Mode, IController, DeleteRegister} from './common';

export abstract class Operator {

	public abstract runNormalMode(controller: IController, ed:TextEditor, repeatCount: number, args: string): boolean;

	protected doc(ed:TextEditor): TextDocument {
		return ed.document;
	}

	protected pos(ed:TextEditor): Position {
		return ed.selection.active;
	}

	protected setPosReveal(ed:TextEditor, line: number, char: number): void {
		ed.selection = new Selection(new Position(line, char), new Position(line, char));
		ed.revealRange(ed.selection, TextEditorRevealType.Default);
	}

	protected delete(ctrl:IController, ed:TextEditor, isWholeLine:boolean, range:Range): void {
		ctrl.setDeleteRegister(new DeleteRegister(isWholeLine, ed.document.getText(range)));
		ed.edit((builder) => {
			builder.delete(range);
		});
	}
}

class InsertOperator extends Operator {
	public runNormalMode(ctrl: IController, ed:TextEditor, repeatCount: number, args: string): boolean {
		ctrl.setMode(Mode.INSERT);
		return true;
	}
}

class AppendOperator extends Operator {
	public runNormalMode(ctrl: IController, ed:TextEditor, repeatCount: number, args: string): boolean {
		let newPos = Motions.Right.run(this.doc(ed), this.pos(ed), ctrl.motionState);
		this.setPosReveal(ed, newPos.line, newPos.character);
		ctrl.setMode(Mode.INSERT);
		return true;
	}
}

class VisualOperator extends Operator {
	public runNormalMode(ctrl: IController, ed:TextEditor, repeatCount: number, args: string): boolean {
		ctrl.setMode(Mode.VISUAL);
		return true;
	}
}

class AppendEndOfLineOperator extends Operator {
	public runNormalMode(ctrl: IController, ed:TextEditor, repeatCount: number, args: string): boolean {
		let newPos = Motions.EndOfLine.run(this.doc(ed), this.pos(ed), ctrl.motionState);
		this.setPosReveal(ed, newPos.line, newPos.character);
		ctrl.setMode(Mode.INSERT);
		return true;
	}
}

class DeleteCharUnderCursorOperator extends Operator {
	public runNormalMode(ctrl: IController, ed:TextEditor, repeatCount: number, args: string): boolean {
		let to = Motions.NextCharacter.repeat(repeatCount > 1, repeatCount).run(this.doc(ed), this.pos(ed), ctrl.motionState);
		let from = this.pos(ed);

		this.delete(ctrl, ed, false, new Range(from.line, from.character, to.line, to.character));

		return true;
	}
}

class DeleteLineOperator extends Operator {
	public runNormalMode(ctrl: IController, ed:TextEditor, repeatCount: number, args: string): boolean {
		let pos = this.pos(ed);
		let doc = this.doc(ed);

		let fromLine = pos.line;
		let fromCharacter = 0;

		let toLine = fromLine + repeatCount;
		let toCharacter = 0;

		if (toLine >= doc.lineCount - 1) {
			// Deleting last line
			toLine = doc.lineCount - 1;
			toCharacter = doc.lineAt(toLine).text.length;

			if (fromLine > 0) {
				fromLine = fromLine - 1;
				fromCharacter = doc.lineAt(fromLine).text.length;
			}
		}

		this.delete(ctrl, ed, true, new Range(fromLine, fromCharacter, toLine, toCharacter));

		return true;
	}
}

abstract class OperatorWithMotion extends Operator {
	public runNormalMode(ctrl: IController, ed:TextEditor, repeatCount: number, args: string): boolean {
		let motion = ctrl.findMotion(args);
		if (!motion) {

			// is it motion building
			if (ctrl.isMotionPrefix(args)) {
				return false;
			}

			// INVALID INPUT - beep!!
			return true;
		}

		return this._run(ctrl, ed, motion.repeat(repeatCount > 1, repeatCount));
	}

	protected abstract _run(ctrl: IController, ed:TextEditor, motion: Motion): boolean;
}

class DeleteToOperator extends OperatorWithMotion {

	public runNormalMode(ctrl: IController, ed:TextEditor, repeatCount: number, args: string): boolean {
		if (args === 'd') {
			// dd
			return Operators.DeleteLine.runNormalMode(ctrl, ed, repeatCount, args);
		}
		return super.runNormalMode(ctrl, ed, repeatCount, args);
	}

	protected _run(ctrl: IController, ed:TextEditor, motion: Motion): boolean {
		let to = motion.run(this.doc(ed), this.pos(ed), ctrl.motionState);
		let from = this.pos(ed);

		this.delete(ctrl, ed, false, new Range(from.line, from.character, to.line, to.character));

		return true;
	}

}

class PutOperator extends Operator {

	public runNormalMode(ctrl: IController, ed:TextEditor, repeatCount: number, args: string): boolean {
		let register = ctrl.getDeleteRegister();
		if (!register) {
			// No delete register - beep!!
			return true;
		}

		let str = repeatString(register.content, repeatCount);

		let pos = this.pos(ed);
		if (!register.isWholeLine) {
			ed.edit((builder) => {
				builder.insert(new Position(pos.line, pos.character + 1), str);
			});
			return true;
		}

		let doc = this.doc(ed);
		let insertLine = pos.line + 1;
		let insertCharacter = 0;

		if (insertLine >=  doc.lineCount) {
			// on last line
			insertLine = doc.lineCount - 1;
			insertCharacter = doc.lineAt(insertLine).text.length;
			str = '\n' + str;
		}

		ed.edit((builder) => {
			builder.insert(new Position(insertLine, insertCharacter), str);
		});

		return true;
	}
}

class ReplaceOperator extends Operator {

	public runNormalMode(ctrl: IController, ed:TextEditor, repeatCount: number, args: string): boolean {
		if (args.length === 0) {
			// input not ready
			return false;
		}

		let doc = this.doc(ed);
		let pos = this.pos(ed);
		let toCharacter = pos.character + repeatCount;
		if (toCharacter > doc.lineAt(pos).text.length) {
			// invalid replace (beep!)
			return true;
		}

		ed.edit((builder) => {
			builder.replace(new Range(pos.line, pos.character, pos.line, toCharacter), repeatString(args, repeatCount));
		});

		return true;
	}
}

class ChangeOperator extends OperatorWithMotion {

	protected _run(ctrl: IController, ed:TextEditor, motion: Motion): boolean {
		let to = motion.run(this.doc(ed), this.pos(ed), ctrl.motionState);
		let from = this.pos(ed);

		this.delete(ctrl, ed, false, new Range(from.line, from.character, to.line, to.character));

		ctrl.setMode(Mode.INSERT);

		return true;
	}

}

function repeatString(str:string, repeatCount:number): string {
	let result = '';
	for (let i = 0; i < repeatCount; i++) {
		result += str;
	}
	return result;
}

export const Operators = {
	Insert: new InsertOperator(),
	Visual: new VisualOperator(),
	Append: new AppendOperator(),
	AppendEndOfLine: new AppendEndOfLineOperator(),
	DeleteCharUnderCursor: new DeleteCharUnderCursorOperator(),
	DeleteTo: new DeleteToOperator(),
	DeleteLine: new DeleteLineOperator(),
	Put: new PutOperator(),
	Replace: new ReplaceOperator(),
	Change: new ChangeOperator(),
};
