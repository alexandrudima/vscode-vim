/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Position, Selection, Range, TextDocument, TextEditor, TextEditorRevealType} from 'vscode';
import {MotionState, Motion, Motions} from './motions';
import {Mode, IController} from './common';

export abstract class Operator {

	public abstract run(controller: IController, ed:TextEditor, repeatCount: number, args: string): boolean;

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
}

class InsertOperator extends Operator {
	public run(ctrl: IController, ed:TextEditor, repeatCount: number, args: string): boolean {
		ctrl.setMode(Mode.INSERT);
		return true;
	}
}

class AppendOperator extends Operator {
	public run(ctrl: IController, ed:TextEditor, repeatCount: number, args: string): boolean {
		let newPos = Motions.Right.run(this.doc(ed), this.pos(ed), ctrl.motionState);
		this.setPosReveal(ed, newPos.line, newPos.character);
		ctrl.setMode(Mode.INSERT);
		return true;
	}
}

class AppendEndOfLineOperator extends Operator {
	public run(ctrl: IController, ed:TextEditor, repeatCount: number, args: string): boolean {
		let newPos = Motions.EndOfLine.run(this.doc(ed), this.pos(ed), ctrl.motionState);
		this.setPosReveal(ed, newPos.line, newPos.character);
		ctrl.setMode(Mode.INSERT);
		return true;
	}
}

class DeleteCharUnderCursorOperator extends Operator {
	public run(ctrl: IController, ed:TextEditor, repeatCount: number, args: string): boolean {
		let to = Motions.NextCharacter.repeat(repeatCount).run(this.doc(ed), this.pos(ed), ctrl.motionState);
		let from = this.pos(ed);
		ed.edit((builder) => {
			builder.delete(new Range(from.line, from.character, to.line, to.character));
		});
		return true;
	}
}

abstract class OperatorWithMotion extends Operator {
	public run(ctrl: IController, ed:TextEditor, repeatCount: number, args: string): boolean {
		let motion = ctrl.findMotion(args);
		if (!motion) {

			// is it motion building
			if (args.length === 0 || /^[1-9]\d*$/.test(args)) {
				return false;
			}

			// INVALID INPUT - beep!!
			return true;
		}

		return this._run(ctrl, ed, motion.repeat(repeatCount));
	}

	protected abstract _run(ctrl: IController, ed:TextEditor, motion: Motion): boolean;
}

class DeleteToOperator extends OperatorWithMotion {

	protected _run(ctrl: IController, ed:TextEditor, motion: Motion): boolean {
		let to = motion.run(this.doc(ed), this.pos(ed), ctrl.motionState);
		let from = this.pos(ed);
		ed.edit((builder) => {
			builder.delete(new Range(from.line, from.character, to.line, to.character));
		});
		return true;
	}

}

export const Operators = {
	Insert: new InsertOperator(),
	Append: new AppendOperator(),
	AppendEndOfLine: new AppendEndOfLineOperator(),
	DeleteCharUnderCursor: new DeleteCharUnderCursorOperator(),
	DeleteTo: new DeleteToOperator(),
};
