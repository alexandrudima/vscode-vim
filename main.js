/// <reference path="../../../../../Alex/src/vscode/src/vs/vscode.d.ts" />

var vscode = require('vscode');

exports.activate = function() {
	console.log('I am activated!');
	
	vscode.commands.registerCommand('dispatchType', function(args) {
		if (!vscode.window.activeTextEditor) {
			return;
		}
		_inputHandler.type(args.text);
	});
	vscode.commands.registerCommand('dispatchReplacePreviousChar', function(args) {
		if (!vscode.window.activeTextEditor) {
			return;
		}
		_inputHandler.replacePrevChar(args.text, args.replaceCharCnt);
	});
	// vscode.commands.registerCommand('dispatchPaste', function(args) {
	// 	console.log('paste with: ', args.text, args.pasteOnNewLine);
	// });
	// vscode.commands.registerCommand('dispatchCut', function(args) {
	// 	console.log('cut (no args)');
	// });
};

function InputHandler() {
	this._currentMode = new NormalMode();
	vscode.window.onDidChangeActiveTextEditor((textEditor) => {
		textEditor.options = {
			cursorStyle: this._currentMode.getCursorStyle()
		};
	});
	if (vscode.window.activeTextEditor) {
		vscode.window.activeTextEditor.options = {
			cursorStyle: this._currentMode.getCursorStyle()
		};
	}
}
/**
 * @param {string} text
 */
InputHandler.prototype.type = function(text) {
	this._currentMode = this._currentMode.type(text);
};
/**
 * @param {string} text
 * @param {number} replaceCharCnt
 */
InputHandler.prototype.replacePrevChar = function(text, replaceCharCnt) {
	this._currentMode = this._currentMode.replacePrevChar(text);
};

function NormalMode() {
	this._cursorDesiredCharacter = -1; // uninitialized
	this._currentInput = '';
}
NormalMode.prototype.getCursorStyle = function() {
	return vscode.TextEditorCursorStyle.Block;
}
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
			this._cursorRight();
			clear = true;
			break;
		case 'x':
			this._deleteCharUnderCursor();
			clear = true;
			break;
	}
	
	if (clear) {
		this._currentInput = '';
		_statusBar.text = 'VIM:> -- NORMAL --';
	} else {
		_statusBar.text = 'VIM:>' + this._currentInput;
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
NormalMode.prototype._cursorRight = function() {
	var pos = activePosition();
	var doc = activeDocument();
	var line = pos.line;
	
	if (pos.character < doc.lineAt(line).text.length - 1) {
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