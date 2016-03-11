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
		var defineOperator = (char, run) => {
			this.OPERATORS.push({
				char: char,
				run: run
				// ,
				// canRepeat: canRepeat,
				// takesFurtherArgs: takesFurtherArgs
			});
		};
		var defineOperatorWithMotion = (char, run) => {
			defineOperator(char, (args) => {
				var motion = findMotion(args);
				if (!motion) {
					return false;
				}
				return run(motion);
			});
		};
		
		defineOperator('x', () => {
			this._deleteCharUnderCursor();
			return true;
		});
		defineOperator('i', () => {
			this._setMode(INSERT_MODE);
			return true;
		});
		defineOperator('a', () => {
			var newPos = this._motion_cursor_right(activePosition());
			setPositionAndReveal(newPos.line, newPos.character);
			this._setMode(INSERT_MODE);
			return true;
		});
		defineOperator('A', () => {
			var newPos = this._motion_end_of_line(activePosition());
			setPositionAndReveal(newPos.line, newPos.character);
			this._setMode(INSERT_MODE);
			return true;
		});
		
		defineOperatorWithMotion('d', (motion) => {
			this._deleteTo(motion.run());
			return true;
		});
		
		this.CHAR_TO_OPERATOR = {};
		for (var i = 0; i < this.OPERATORS.length; i++) {
			var operator = this.OPERATORS[i];
			this.CHAR_TO_OPERATOR[operator.char] = operator;
		}
	}
	
	if (!this.MOTIONS) {
		this.MOTIONS = [];
		var defineMotion = (char, run) => {
			this.MOTIONS.push({
				char: char,
				run: run
			});
		};
		
		defineMotion('w', (pos) => this._motion_w(pos));
		defineMotion('e', (pos) => this._motion_e(pos));
		defineMotion('$', (pos) => this._motion_end_of_line(pos));
		defineMotion('0', (pos) => this._motion_start_of_line(pos));
		defineMotion('h', (pos) => this._motion_cursor_left(pos));
		defineMotion('j', (pos) => this._motion_cursor_down(pos));
		defineMotion('k', (pos) => this._motion_cursor_up(pos));
		defineMotion('l', (pos) => this._motion_cursor_right(pos));
		
		this.CHAR_TO_MOTION = {};
		for (var i = 0; i < this.MOTIONS.length; i++) {
			var motion = this.MOTIONS[i];
			this.CHAR_TO_MOTION[motion.char] = motion;
		}
	}
	
	var findMotion = (input) => {
		var repeatCount = 1;
		var stringInputPart = input;

		var repeatCountMatch = stringInputPart.match(/^([1-9]\d*)/);
		if (repeatCountMatch) {
			repeatCount = parseInt(repeatCountMatch[0], 10);
			stringInputPart = stringInputPart.substr(repeatCountMatch[0].length);
		}
		
		var motion = this.CHAR_TO_MOTION[stringInputPart];
		if (!motion) {
			return null;
		}
		return {
			run: () => {
				var newPos = activePosition();
				for (var cnt = 0; cnt < repeatCount; cnt++) {
					newPos = motion.run(newPos);
				}
				return newPos;
			}
		}
	};
	
	var operator = this.CHAR_TO_OPERATOR[this._currentInput[0]];
	if (operator) {
		if (operator.run(this._currentInput.substr(1))) {
			this._currentInput = '';
		}
		return;
	}
	
	var motion = findMotion(this._currentInput);
	if (motion) {
		var newPos = motion.run();
		setPositionAndReveal(newPos.line, newPos.character);
		this._currentInput = '';
		return;
	}
	
	// is it motion building
	if (/^[1-9]\d*$/.test(this._currentInput)) {
		return;
	}
	
	// beep!!
	this._currentInput = '';
};
InputHandler.prototype._motion_cursor_left = function(pos) {
	var doc = activeDocument();
	var line = pos.line;
	
	if (pos.character > 0) {
		this._cursorDesiredCharacter = pos.character - 1;
		return new vscode.Position(line, this._cursorDesiredCharacter);
	}
	return pos;
};
InputHandler.prototype._motion_cursor_down = function(pos) {
	var doc = activeDocument();
	var line = pos.line;
	
	this._cursorDesiredCharacter = (this._cursorDesiredCharacter === -1 ? pos.character : this._cursorDesiredCharacter);
	
	if (line < doc.lineCount - 1) {
		line++;
		return new vscode.Position(line, Math.min(this._cursorDesiredCharacter, doc.lineAt(line).text.length));
	}
	return pos;
};
InputHandler.prototype._motion_cursor_up = function(pos) {
	var doc = activeDocument();
	var line = pos.line;
	
	this._cursorDesiredCharacter = (this._cursorDesiredCharacter === -1 ? pos.character : this._cursorDesiredCharacter);
	
	if (line > 0) {
		line--;
		return new vscode.Position(line, Math.min(this._cursorDesiredCharacter, doc.lineAt(line).text.length));
	}
	return pos;
};
InputHandler.prototype._motion_cursor_right = function(pos) {
	var doc = activeDocument();
	var line = pos.line;
	var maxCharacter = doc.lineAt(line).text.length;
	
	if (pos.character < maxCharacter) {
		this._cursorDesiredCharacter = pos.character + 1;
		return new vscode.Position(line, this._cursorDesiredCharacter);
	}
	return pos;
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
InputHandler.prototype._motion_end_of_line = function(pos) {
	var doc = activeDocument();
	return new vscode.Position(pos.line, doc.lineAt(pos.line).text.length);
};
InputHandler.prototype._motion_start_of_line = function(pos) {
	var doc = activeDocument();
	return new vscode.Position(pos.line, 0);
};
InputHandler.prototype._motion_w = function(pos) {
	var doc = activeDocument();
	var lineContent = doc.lineAt(pos.line).text;
	
	if (pos.character >= lineContent.length - 1) {
		// cursor at end of line
		return ((pos.line + 1 < doc.lineCount) ? new vscode.Position(pos.line + 1, 0) : pos);
	}
	
	var nextWord = findNextWord(pos, this.wordCharacterClass);
	
	if (!nextWord) {
		// return end of the line
		return this._motion_end_of_line(pos);
	}
	
	if (nextWord.start <= pos.character && pos.character < nextWord.end) {
		// Sitting on a word
		var nextNextWord = findNextWord(new vscode.Position(pos.line, nextWord.end), this.wordCharacterClass);
		if (nextNextWord) {
			// return start of the next next word
			return new vscode.Position(pos.line, nextNextWord.start);
		} else {
			// return end of line
			return this._motion_end_of_line(pos);
		}
	} else {
		// return start of the next word
		console.log('_motion_w: returning', new vscode.Position(pos.line, nextWord.start));
		return new vscode.Position(pos.line, nextWord.start);
	}
};
InputHandler.prototype._motion_e = function(pos) {
	var doc = activeDocument();
	var lineContent = doc.lineAt(pos.line).text;
	
	if (pos.character >= lineContent.length - 1) {
		// no content on this line or cursor at end of line
		return ((pos.line + 1 < doc.lineCount) ? new vscode.Position(pos.line + 1, 0) : pos);
	}
	
	var nextWord = findNextWord(pos, this.wordCharacterClass);
	
	if (!nextWord) {
		// return end of the line
		return this._motion_end_of_line(pos);
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