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

var NORMAL_MODE = 0, INSERT_MODE = 1;

function InputHandler() {
	this._setMode(NORMAL_MODE);
	vscode.window.onDidChangeActiveTextEditor((textEditor) => {
		textEditor.options = {
			cursorStyle: this.getCursorStyle()
		};
	});
}
InputHandler.prototype.goToNormalMode = function() {
	if (this._currentMode === NORMAL_MODE) {
		return;
	}
	this._setMode(NORMAL_MODE);
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
	}
	_statusBar.text = this.getStatusText();
};
/**
 * @param {string} text
 */
InputHandler.prototype.type = function(text) {
	if (this._currentMode === NORMAL_MODE) {
		this._currentInput += text;
		this._interpretNormalModeInput();
	} else {
		vscode.commands.executeCommand('default:type', {
			text: text
		});
	}
	_statusBar.text = this.getStatusText();
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
			this._setMode(INSERT_MODE);
			return;
		case 'a':
			this._cursorRight(true);
			this._setMode(INSERT_MODE);
			return;
		case 'A':
			this._cursorEndOfLine(true);
			this._setMode(INSERT_MODE);
			return;
		case 'dw':
			this._deleteToNextWordStart();
			clear = true;
			break;
	}
	
	if (clear) {
		this._currentInput = '';
	}
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
InputHandler.prototype._deleteToNextWordStart = function() {
	
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