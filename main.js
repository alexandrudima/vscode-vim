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
	// vscode.commands.registerCommand('paste', function(args) {
	// 	console.log('paste with: ', args.text, args.pasteOnNewLine);
	// });
	// vscode.commands.registerCommand('cut', function(args) {
	// 	console.log('cut (no args)');
	// });
};

function InputHandler() {
	this._setMode(new NormalMode());
	vscode.window.onDidChangeActiveTextEditor((textEditor) => {
		textEditor.options = {
			cursorStyle: this._currentMode.getCursorStyle()
		};
	});
}
InputHandler.prototype.goToNormalMode = function() {
	if (this._currentMode instanceof NormalMode) {
		return;
	}
	this._setMode(new NormalMode());
};
InputHandler.prototype._setMode = function(newMode) {
	if (newMode !== this._currentMode) {
		this._currentMode = newMode;
		if (vscode.window.activeTextEditor) {
			vscode.window.activeTextEditor.options = {
				cursorStyle: this._currentMode.getCursorStyle()
			};
		}
		
		var inNormalMode = (this._currentMode instanceof NormalMode);
		vscode.commands.executeCommand('setContext', 'vim.inNormalMode', inNormalMode);
	}
	_statusBar.text = this._currentMode.getStatusText();
};
/**
 * @param {string} text
 */
InputHandler.prototype.type = function(text) {
	this._setMode(this._currentMode.type(text));
};
/**
 * @param {string} text
 * @param {number} replaceCharCnt
 */
InputHandler.prototype.replacePrevChar = function(text, replaceCharCnt) {
	this._setMode(this._currentMode.replacePrevChar(text));
};

function NormalMode() {
	this._cursorDesiredCharacter = -1; // uninitialized
	this._currentInput = '';
}
NormalMode.prototype.getCursorStyle = function() {
	return vscode.TextEditorCursorStyle.Block;
};
NormalMode.prototype.getStatusText = function() {
	if (this._currentInput) {
		return 'VIM:>' + this._currentInput;
	} else {
		return 'VIM:> -- NORMAL --';
	}
};
/**
 * @param {string} text
 */
NormalMode.prototype.type = function(text) {
	this._currentInput += text;
	return this._interpretInput();
	
};
/**
 * @param {string} text
 * @param {number} replaceCharCnt
 */
NormalMode.prototype.replacePrevChar = function(text, replaceCharCnt) {
	console.log('default mode replacePrevChar: ', arguments);
	return this;
};
NormalMode.prototype._interpretInput = function() {
	
	console.log('_interpretInput: ', this._currentInput);
	
	var clear = false;
	switch(this._currentInput) {
		case 'h':
			this._cursorLeft();
			clear = true;
			break;
		case 'j':
			this._cursorDown();
			clear = true;
			break;
		case 'k':
			this._cursorUp();
			clear = true;
			break;
		case 'l':
			this._cursorRight(false);
			clear = true;
			break;
		case 'x':
			this._deleteCharUnderCursor();
			clear = true;
			break;
		case 'i':
			return new InsertMode();
		case 'a':
			this._cursorRight(true);
			return new InsertMode();
		case 'A':
			this._cursorEndOfLine(true);
			return new InsertMode();
		case 'dw':
			this._deleteToNextWordStart();
			clear = true;
			break;
	}
	
	if (clear) {
		this._currentInput = '';
	}
	
	return this;
};
NormalMode.prototype._cursorLeft = function() {
	var pos = activePosition();
	var doc = activeDocument();
	var line = pos.line;
	
	if (pos.character > 0) {
		this._cursorDesiredCharacter = pos.character - 1;
		setPositionAndReveal(line, this._cursorDesiredCharacter);
	}
};
NormalMode.prototype._cursorDown = function() {
	var pos = activePosition();
	var doc = activeDocument();
	var line = pos.line;
	
	this._cursorDesiredCharacter = (this._cursorDesiredCharacter === -1 ? pos.character : this._cursorDesiredCharacter);
	
	if (line < doc.lineCount - 1) {
		line++;
		setPositionAndReveal(line, Math.min(this._cursorDesiredCharacter, doc.lineAt(line).text.length));
	}
};
NormalMode.prototype._cursorUp = function() {
	var pos = activePosition();
	var doc = activeDocument();
	var line = pos.line;
	
	this._cursorDesiredCharacter = (this._cursorDesiredCharacter === -1 ? pos.character : this._cursorDesiredCharacter);
	
	if (line > 0) {
		line--;
		setPositionAndReveal(line, Math.min(this._cursorDesiredCharacter, doc.lineAt(line).text.length));
	}
};
NormalMode.prototype._cursorEndOfLine = function(allowLastPositionOnLine) {
	var pos = activePosition();
	var doc = activeDocument();
	var line = pos.line;
	var maxCharacter = (allowLastPositionOnLine ? doc.lineAt(line).text.length : doc.lineAt(line).text.length - 1);
	
	if (pos.character !== maxCharacter) {
		this._cursorDesiredCharacter = maxCharacter;
		setPositionAndReveal(line, this._cursorDesiredCharacter);
	}
};
NormalMode.prototype._cursorRight = function(allowLastPositionOnLine) {
	var pos = activePosition();
	var doc = activeDocument();
	var line = pos.line;
	var maxCharacter = (allowLastPositionOnLine ? doc.lineAt(line).text.length : doc.lineAt(line).text.length - 1);
	
	if (pos.character < maxCharacter) {
		this._cursorDesiredCharacter = pos.character + 1;
		setPositionAndReveal(line, this._cursorDesiredCharacter);
	}
};
NormalMode.prototype._deleteCharUnderCursor = function() {
	var pos = activePosition();
	activeEditor().edit((builder) => {
		builder.delete(new vscode.Range(pos.line, pos.character, pos.line, pos.character + 1));
	});
};
NormalMode.prototype._deleteToNextWordStart = function() {
	
};

function InsertMode() {
}
InsertMode.prototype.getCursorStyle = function() {
	return vscode.TextEditorCursorStyle.Line;
};
InsertMode.prototype.getStatusText = function() {
	return 'VIM:> -- INSERT --';
};
/**
 * @param {string} text
 */
InsertMode.prototype.type = function(text) {
	vscode.commands.executeCommand('default:type', {
		text: text
	});
	return this;
};
/**
 * @param {string} text
 * @param {number} replaceCharCnt
 */
InsertMode.prototype.replacePrevChar = function(text, replaceCharCnt) {
	vscode.commands.executeCommand('default:replacePrevChar', {
		text: text,
		replaceCharCnt: replaceCharCnt
	});
	return this;
};


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