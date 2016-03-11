/// <reference path="../../../../../Alex/src/vscode/src/vs/vscode.d.ts" />

var vscode = require('vscode');

exports.activate = function() {
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

var NORMAL_MODE = 0, INSERT_MODE = 1;

var CHARACTER_CLASS_REGULAR = 0;
var CHARACTER_CLASS_WORD_SEPARATOR = 1;
var CHARACTER_CLASS_WHITESPACE = 2;

function InputHandler() {
	this._setMode(NORMAL_MODE);
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
InputHandler.prototype._ensureNormalModePosition = function() {
	if (!vscode.window.activeTextEditor) {
		return;
	}
	if (this._currentMode !== NORMAL_MODE) {
		return;
	}
	var sel = vscode.window.activeTextEditor.selection;
	if (!sel.isEmpty) {
		return;
	}
	var pos = sel.active;
	var doc = activeDocument();
	var lineContent = doc.lineAt(pos.line).text;
	if (lineContent.length === 0) {
		return;
	}
	var maxCharacter = lineContent.length - 1;
	if (pos.character > maxCharacter) {
		setPositionAndReveal(pos.line, maxCharacter);
	}
};
InputHandler.prototype._readConfig = function() {
	var editorConfig = vscode.workspace.getConfiguration('editor');
	var wordSeparators = editorConfig.wordSeparators;
	
	this.wordCharacterClass = [];
	
	// Make array fast for ASCII text
	for (var chCode = 0; chCode < 256; chCode++) {
		this.wordCharacterClass[chCode] = CHARACTER_CLASS_REGULAR;
	}

	for (var i = 0, len = wordSeparators.length; i < len; i++) {
		this.wordCharacterClass[wordSeparators.charCodeAt(i)] = CHARACTER_CLASS_WORD_SEPARATOR;
	}

	this.wordCharacterClass[' '.charCodeAt(0)] = CHARACTER_CLASS_WHITESPACE;
	this.wordCharacterClass['\t'.charCodeAt(0)] = CHARACTER_CLASS_WHITESPACE;
};
InputHandler.prototype.goToNormalMode = function() {
	if (this._currentMode === NORMAL_MODE) {
		return;
	}
	this._setMode(NORMAL_MODE);
};
InputHandler.prototype.clearInput = function() {
	this._currentInput = '';
	this._updateStatus();
};
InputHandler.prototype._setMode = function(newMode) {
	if (newMode !== this._currentMode) {
		this._currentMode = newMode;
		this._cursorDesiredCharacter = -1; // uninitialized
		this._currentInput = '';

		if (vscode.window.activeTextEditor) {
			vscode.window.activeTextEditor.options = {
				cursorStyle: this.getCursorStyle()
			};
		}
		
		var inNormalMode = (this._currentMode === NORMAL_MODE);
		vscode.commands.executeCommand('setContext', 'vim.inNormalMode', inNormalMode);
		this._ensureNormalModePosition();
	}
	this._updateStatus();
};
/**
 * @param {string} text
 */
InputHandler.prototype.type = function(text) {
	if (this._currentMode === NORMAL_MODE) {
		this._currentInput += text;
		this._interpretNormalModeInput();
		this._updateStatus();
	} else {
		vscode.commands.executeCommand('default:type', {
			text: text
		});
	}
};
InputHandler.prototype._updateStatus = function() {
	_statusBar.text = this.getStatusText();
	var hasInput = (this._currentInput.length > 0);
	if (this.hasInput !== hasInput) {
		this.hasInput = hasInput;
		vscode.commands.executeCommand('setContext', 'vim.hasInput', this.hasInput);
	}
};
/**
 * @param {string} text
 * @param {number} replaceCharCnt
 */
InputHandler.prototype.replacePrevChar = function(text, replaceCharCnt) {
	if (this._currentMode === NORMAL_MODE) {
		console.log('TODO: default mode replacePrevChar: ', arguments);
	} else {
		vscode.commands.executeCommand('default:replacePrevChar', {
			text: text,
			replaceCharCnt: replaceCharCnt
		});
	}
};
InputHandler.prototype.getCursorStyle = function() {
	if (this._currentMode === NORMAL_MODE) {
		return vscode.TextEditorCursorStyle.Block;
	} else {
		return vscode.TextEditorCursorStyle.Line;
	}
};
InputHandler.prototype.getStatusText = function() {
	if (this._currentMode === NORMAL_MODE) {
		if (this._currentInput) {
			return 'VIM:>' + this._currentInput;
		} else {
			return 'VIM:> -- NORMAL --';
		}
	} else {
		return 'VIM:> -- INSERT --';
	}
};
InputHandler.prototype._interpretNormalModeInput = function() {
	if (!this.OPERATORS) {
		this.OPERATORS = [];
		var defineOperator = (char, canRepeat, takesFurtherArgs, run) => {
			this.OPERATORS.push({
				char: char,
				run: run,
				canRepeat: canRepeat,
				takesFurtherArgs: takesFurtherArgs
			});
		};
		
		defineOperator('h', /*canRepeat*/ true, /*takesFurtherArgs*/false, () => {this._cursorLeft(); return true;});
		defineOperator('j', /*canRepeat*/ true, /*takesFurtherArgs*/false, () => {this._cursorDown(); return true;});
		defineOperator('k', /*canRepeat*/ true, /*takesFurtherArgs*/false, () => {this._cursorUp(); return true;});
		defineOperator('l', /*canRepeat*/ true, /*takesFurtherArgs*/false, () => {this._cursorRight(); return true;});
		defineOperator('x', /*canRepeat*/ true, /*takesFurtherArgs*/false, () => {this._deleteCharUnderCursor(); return true;});
		defineOperator('i', /*canRepeat*/false, /*takesFurtherArgs*/false, () => {this._setMode(INSERT_MODE); return true;});
		defineOperator('a', /*canRepeat*/false, /*takesFurtherArgs*/false, () => {this._cursorRight(true); this._setMode(INSERT_MODE); return true;});
		defineOperator('A', /*canRepeat*/false, /*takesFurtherArgs*/false, () => {this._cursorEndOfLine(true); this._setMode(INSERT_MODE); return true;});
		defineOperator('d', /*canRepeat*/ true, /*takesFurtherArgs*/ true, (furtherArgs) => {
			if (furtherArgs.length === 0) {
				// waiting for motion
				return false;
			}
			var motion = findMotion(furtherArgs[0]);
			if (!motion) {
				// invalid input, play (beep) sound :)
				return true;
			}
			this._deleteTo(motion.run());
			return true;
		}, true, true);
	}
	
	if (!this.MOTIONS) {
		this.MOTIONS = [];
		var defineMotion = (char, run) => {
			this.MOTIONS.push({
				char: char,
				run: run
			});
		};
		
		defineMotion('w', () => this._motion_w());
		defineMotion('e', () => this._motion_e());
		defineMotion('$', () => this._motion_$());
	}
	
	var repeatCount = 1;
	var stringInputPart = this._currentInput;

	var repeatCountMatch = stringInputPart.match(/^(\d+)/);
	if (repeatCountMatch) {
		repeatCount = parseInt(repeatCountMatch[0], 10);
		stringInputPart = stringInputPart.substr(repeatCountMatch[0].length);
	}
	
	if (stringInputPart.length === 0) {
		// still building input
		return;
	}
	
	var findMotion = (char) => {
		for (var i = 0; i < this.MOTIONS.length; i++) {
			var motion = this.MOTIONS[i];
			if (char === motion.char) {
				// bingo!
				return motion;
			}
		}
		return null;
	};
	
	var motion = findMotion(stringInputPart[0]);
	if (motion) {
		// it is a motion!
		for (var cnt = 0; cnt < repeatCount; cnt++) {
			var newPos = motion.run();
			setPositionAndReveal(newPos.line, newPos.character);
		}
		this._currentInput = '';
		return;
	}
	
	var findOperator = (char) => {
		for (var i = 0; i < this.OPERATORS.length; i++) {
			var operator = this.OPERATORS[i];
			if (char === operator.char) {
				return operator;
			}
		}
	};
	
	var operator = findOperator(stringInputPart[0]);
	if (!operator) {
		// invalid input, play (beep) sound :)
		this._currentInput = '';
		return;
	}
	
	if (!operator.canRepeat) {
		repeatCount = 1;
	}
	var clearInput = false;
	for (var cnt = 0; cnt < repeatCount; cnt++) {
		clearInput = operator.run(stringInputPart.substr(1)) || clearInput;
	}
	if (clearInput) {
		this._currentInput = '';
	}
	
	
	// // Check if it is an operator
	// for (var i = 0; i < this.OPERATORS.length; i++) {
	// 	var operator = this.OPERATORS[i];
	// 	if (stringInputPart[0] === operator.char) {
	// 		// it is an operator!
	// 		if (operator.takesMotionArg) {
	// 			if (stringInputPart.length === 1) {
	// 				// no motion argument yet, still building input
	// 				return;
	// 			}
	// 			var motion = 
	// 		}
	// 	}
	// }
	// return;
	// console.log('_interpretInput: ', this._currentInput);
	// console.log('repeatCount: ', repeatCount);
	// console.log('stringInputPart: ', stringInputPart);
	// throw new Error('TODO!');

	// var clear = false;
	// switch(this._currentInput) {
	// 	case 'h':
	// 		this._cursorLeft();
	// 		clear = true;
	// 		break;
	// 	case 'j':
	// 		this._cursorDown();
	// 		clear = true;
	// 		break;
	// 	case 'k':
	// 		this._cursorUp();
	// 		clear = true;
	// 		break;
	// 	case 'l':
	// 		this._cursorRight(false);
	// 		clear = true;
	// 		break;
	// 	case 'x':
	// 		this._deleteCharUnderCursor();
	// 		clear = true;
	// 		break;
	// 	case 'i':
	// 		this._setMode(INSERT_MODE);
	// 		return;
	// 	case 'a':
	// 		this._cursorRight(true);
	// 		this._setMode(INSERT_MODE);
	// 		return;
	// 	case 'A':
	// 		this._cursorEndOfLine(true);
	// 		this._setMode(INSERT_MODE);
	// 		return;
	// 	case 'dw':
	// 		this._deleteTo(this._motion_w());
	// 		clear = true;
	// 		break;
	// 	case 'de':
	// 		this._deleteTo(this._motion_e());
	// 		clear = true;
	// 		break;
	// 	case 'd$':
	// 		this._deleteTo(this._motion_$());
	// 		clear = true;
	// 		break;
	// 	case 'w':
	// 		var newPos = this._motion_w();
	// 		setPositionAndReveal(newPos.line, newPos.character);
	// 		clear = true;
	// 		break;
	// 	case 'e':
	// 		var newPos = this._motion_e();
	// 		setPositionAndReveal(newPos.line, newPos.character);
	// 		clear = true;
	// 		break;
	// 	case '$':
	// 		var newPos = this._motion_$();
	// 		setPositionAndReveal(newPos.line, newPos.character);
	// 		clear = true;
	// 		break;
	// }
	
	// if (clear) {
	// 	this._currentInput = '';
	// } else {
		
	// }
};
InputHandler.prototype._cursorLeft = function() {
	var pos = activePosition();
	var doc = activeDocument();
	var line = pos.line;
	
	if (pos.character > 0) {
		this._cursorDesiredCharacter = pos.character - 1;
		setPositionAndReveal(line, this._cursorDesiredCharacter);
	}
};
InputHandler.prototype._cursorDown = function() {
	var pos = activePosition();
	var doc = activeDocument();
	var line = pos.line;
	
	this._cursorDesiredCharacter = (this._cursorDesiredCharacter === -1 ? pos.character : this._cursorDesiredCharacter);
	
	if (line < doc.lineCount - 1) {
		line++;
		setPositionAndReveal(line, Math.min(this._cursorDesiredCharacter, doc.lineAt(line).text.length));
	}
};
InputHandler.prototype._cursorUp = function() {
	var pos = activePosition();
	var doc = activeDocument();
	var line = pos.line;
	
	this._cursorDesiredCharacter = (this._cursorDesiredCharacter === -1 ? pos.character : this._cursorDesiredCharacter);
	
	if (line > 0) {
		line--;
		setPositionAndReveal(line, Math.min(this._cursorDesiredCharacter, doc.lineAt(line).text.length));
	}
};
InputHandler.prototype._cursorEndOfLine = function(allowLastPositionOnLine) {
	var pos = activePosition();
	var doc = activeDocument();
	var line = pos.line;
	var maxCharacter = (allowLastPositionOnLine ? doc.lineAt(line).text.length : doc.lineAt(line).text.length - 1);
	
	if (pos.character !== maxCharacter) {
		this._cursorDesiredCharacter = maxCharacter;
		setPositionAndReveal(line, this._cursorDesiredCharacter);
	}
};
InputHandler.prototype._cursorRight = function(allowLastPositionOnLine) {
	var pos = activePosition();
	var doc = activeDocument();
	var line = pos.line;
	var maxCharacter = (allowLastPositionOnLine ? doc.lineAt(line).text.length : doc.lineAt(line).text.length - 1);
	
	if (pos.character < maxCharacter) {
		this._cursorDesiredCharacter = pos.character + 1;
		setPositionAndReveal(line, this._cursorDesiredCharacter);
	}
};
InputHandler.prototype._deleteCharUnderCursor = function() {
	var pos = activePosition();
	activeEditor().edit((builder) => {
		builder.delete(new vscode.Range(pos.line, pos.character, pos.line, pos.character + 1));
	});
};
InputHandler.prototype._deleteTo = function(toPos) {
	var pos = activePosition();
	activeEditor().edit((builder) => {
		builder.delete(new vscode.Range(pos.line, pos.character, toPos.line, toPos.character));
	});
};
InputHandler.prototype._motion_$ = function() {
	var pos = activePosition();
	var doc = activeDocument();
	return new vscode.Position(pos.line, doc.lineAt(pos.line).text.length);
};
InputHandler.prototype._motion_w = function() {
	var pos = activePosition();
	var doc = activeDocument();
	var lineContent = doc.lineAt(pos.line).text;
	
	if (pos.character >= lineContent.length - 1) {
		// cursor at end of line
		return ((pos.line + 1 < doc.lineCount) ? new vscode.Position(pos.line + 1, 0) : pos);
	}
	
	var nextWord = findNextWord(pos, this.wordCharacterClass);
	
	if (!nextWord) {
		// return end of the line
		return this._motion_$();
	}
	
	if (nextWord.start <= pos.character && pos.character < nextWord.end) {
		// Sitting on a word
		var nextNextWord = findNextWord(new vscode.Position(pos.line, nextWord.end), this.wordCharacterClass);
		if (nextNextWord) {
			// return start of the next next word
			return new vscode.Position(pos.line, nextNextWord.start);
		} else {
			// return end of line
			return this._motion_$();
		}
	} else {
		// return start of the next word
		return new vscode.Position(pos.line, nextWord.start);
	}
};
InputHandler.prototype._motion_e = function() {
	var pos = activePosition();
	var doc = activeDocument();
	var lineContent = doc.lineAt(pos.line).text;
	
	if (pos.character >= lineContent.length - 1) {
		// no content on this line or cursor at end of line
		return ((pos.line + 1 < doc.lineCount) ? new vscode.Position(pos.line + 1, 0) : pos);
	}
	
	var nextWord = findNextWord(pos, this.wordCharacterClass);
	
	if (!nextWord) {
		// return end of the line
		return this._motion_$();
	}
	
	// return start of the next word
	return new vscode.Position(pos.line, nextWord.end);
};

var WORD_NONE = 0, WORD_SEPARATOR = 1, WORD_REGULAR = 2;
function findNextWord(pos, wordCharacterClass) {
	var doc = activeDocument();
	
	var lineContent = doc.lineAt(pos.line).text;
	var wordType = WORD_NONE;
	var len = lineContent.length;
	
	for (var chIndex = pos.character; chIndex < len; chIndex++) {
		var chCode = lineContent.charCodeAt(chIndex);
		var chClass = (wordCharacterClass[chCode] || CHARACTER_CLASS_REGULAR);
		
		if (chClass === CHARACTER_CLASS_REGULAR) {
			if (wordType === WORD_SEPARATOR) {
				return _createWord(lineContent, wordType, _findStartOfWord(lineContent, wordCharacterClass, wordType, chIndex - 1), chIndex);
			}
			wordType = WORD_REGULAR;
		} else if (chClass === CHARACTER_CLASS_WORD_SEPARATOR) {
			if (wordType === WORD_REGULAR) {
				return _createWord(lineContent, wordType, _findStartOfWord(lineContent, wordCharacterClass, wordType, chIndex - 1), chIndex);
			}
			wordType = WORD_SEPARATOR;
		} else if (chClass === CHARACTER_CLASS_WHITESPACE) {
			if (wordType !== WORD_NONE) {
				return _createWord(lineContent, wordType, _findStartOfWord(lineContent, wordCharacterClass, wordType, chIndex - 1), chIndex);
			}
		}
	}

	if (wordType !== WORD_NONE) {
		return _createWord(lineContent, wordType, _findStartOfWord(lineContent, wordCharacterClass, wordType, len - 1), len);
	}

	return null;
}

function _findStartOfWord(lineContent, wordCharacterClass, wordType, startIndex) {
	for (var chIndex = startIndex; chIndex >= 0; chIndex--) {
		var chCode = lineContent.charCodeAt(chIndex);
		var chClass = (wordCharacterClass[chCode] || CHARACTER_CLASS_REGULAR);

		if (chClass === CHARACTER_CLASS_WHITESPACE) {
			return chIndex + 1;
		}
		if (wordType === WORD_REGULAR && chClass === CHARACTER_CLASS_WORD_SEPARATOR) {
			return chIndex + 1;
		}
		if (wordType === WORD_SEPARATOR && chClass === CHARACTER_CLASS_REGULAR) {
			return chIndex + 1;
		}
	}
	return 0;
}

function _createWord(lineContent, wordType, start, end) {
	// console.log('WORD ==> ' + start + ' => ' + end + ':::: <<<' + lineContent.substring(start, end) + '>>>');
	return { start: start, end: end, wordType: wordType };
}

var _statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
_statusBar.show();
var _inputHandler = new InputHandler();

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