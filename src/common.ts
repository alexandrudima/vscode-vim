/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {MotionState, Motion} from './motions';

export enum Mode {
	INSERT,
	NORMAL
}

export interface IController {
	motionState: MotionState;

	setMode(mode: Mode): void;
	findMotion(input: string): Motion;
}
