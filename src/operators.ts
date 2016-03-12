/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Position, Selection, Range, TextDocument, TextEditor, TextEditorRevealType} from 'vscode';
import {MotionState, Motion, Motions} from './motions';
import {Mode, IController} from './common';

export abstract class Operator {

	public abstract run(controller: IController, repeatCount: number, args: string): boolean;

	protected doc(controller: IController): TextDocument {
		return controller.editor.document;
	}

	protected pos(controller: IController): Position {
		return controller.editor.selection.active;
	}

	protected setPosReveal(controller: IController, line: number, char: number): void {
		controller.editor.selection = new Selection(new Position(line, char), new Position(line, char));
		controller.editor.revealRange(controller.editor.selection, TextEditorRevealType.Default);
	}
}

class InsertOperator extends Operator {
	public run(ctrl: IController, repeatCount: number, args: string): boolean {
		ctrl.setMode(Mode.INSERT);
		return true;
	}
}

class AppendOperator extends Operator {
	public run(ctrl: IController, repeatCount: number, args: string): boolean {
		let newPos = Motions.Right.run(this.doc(ctrl), this.pos(ctrl), ctrl.motionState);
		this.setPosReveal(ctrl, newPos.line, newPos.character);
		ctrl.setMode(Mode.INSERT);
		return true;
	}
}

class AppendEndOfLineOperator extends Operator {
	public run(ctrl: IController, repeatCount: number, args: string): boolean {
		let newPos = Motions.EndOfLine.run(this.doc(ctrl), this.pos(ctrl), ctrl.motionState);
		this.setPosReveal(ctrl, newPos.line, newPos.character);
		ctrl.setMode(Mode.INSERT);
		return true;
	}
}

class DeleteCharUnderCursorOperator extends Operator {
	public run(ctrl: IController, repeatCount: number, args: string): boolean {
		console.log('TODO: repeatCnt');
		let pos = this.pos(ctrl);
		ctrl.editor.edit((builder) => {
			builder.delete(new Range(pos.line, pos.character, pos.line, pos.character + 1));
		});
		return true;
	}
}

abstract class OperatorWithMotion extends Operator {
	public run(ctrl: IController, repeatCount: number, args: string): boolean {
		let motion = ctrl.findMotion(args);
		if (!motion) {

			// is it motion building
			if (args.length === 0 || /^[1-9]\d*$/.test(args)) {
				return false;
			}

			// INVALID INPUT - beep!!
			return true;
		}

		return this._run(ctrl, motion.repeat(repeatCount));
	}

	protected abstract _run(ctrl: IController, motion: Motion): boolean;
}

class DeleteToOperator extends OperatorWithMotion {

	protected _run(ctrl: IController, motion: Motion): boolean {
		let to = motion.run(this.doc(ctrl), this.pos(ctrl), ctrl.motionState);
		let from = this.pos(ctrl);
		ctrl.editor.edit((builder) => {
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
