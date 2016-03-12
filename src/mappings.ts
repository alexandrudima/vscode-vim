/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TextEditor} from 'vscode';
import {Motion, Motions} from './motions';
import {Operator, Operators} from './operators';
import {IController} from './common';


const CHAR_TO_MOTION: { [char: string]: Motion; } = {};
function defineMotion(char: string, motion: Motion): void {
	CHAR_TO_MOTION[char] = motion;
};
defineMotion('w', Motions.NextWordStart);
defineMotion('e', Motions.NextWordEnd);
defineMotion('$', Motions.EndOfLine);
defineMotion('0', Motions.StartOfLine);
defineMotion('h', Motions.Left);
defineMotion('j', Motions.Down);
defineMotion('k', Motions.Up);
defineMotion('l', Motions.Right);


const CHAR_TO_OPERATOR: { [char: string]: Operator; } = {};
function defineOperator(char: string, operator: Operator): void {
	CHAR_TO_OPERATOR[char] = operator;
};
defineOperator('x', Operators.DeleteCharUnderCursor);
defineOperator('i', Operators.Insert);
defineOperator('a', Operators.Append);
defineOperator('A', Operators.AppendEndOfLine);
defineOperator('d', Operators.DeleteTo);
defineOperator('p', Operators.Put);
defineOperator('r', Operators.Replace);
defineOperator('c', Operators.Change);


const CHAR_TO_COMMAND: { [char: string]: string; } = {};
function defineCommand(char: string, commandId: string): void {
	CHAR_TO_COMMAND[char] = commandId;
};
defineCommand('u', 'undo');
defineCommand('U', 'undo');

export interface IFoundOperator {
	(controller: IController, editor:TextEditor): boolean;
}

export class Mappings {

	public static findMotion(input: string): Motion {
		let parsed = _parseNumberAndString(input);
		let motion = CHAR_TO_MOTION[parsed.input];
		if (!motion) {
			return null;
		}
		return motion.repeat(parsed.repeatCount);
	}

	public static findOperator(input: string): IFoundOperator {
		let parsed = _parseNumberAndString(input);
		let operator = CHAR_TO_OPERATOR[parsed.input.charAt(0)];
		if (!operator) {
			return null;
		}
		return (controller: IController, editor:TextEditor) => {
			let operatorArgs = parsed.input.substr(1);
			return operator.run(controller, editor, parsed.repeatCount, operatorArgs);
		};
	}

	public static findCommand(input: string): string {
		return CHAR_TO_COMMAND[input] || null;
	}
}

function _parseNumberAndString(input: string): INumberAndString {
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

interface INumberAndString {
	repeatCount: number;
	input: string;
}
