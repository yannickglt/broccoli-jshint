var fs       = require('fs');
var path     = require('path');
var chalk    = require('chalk');
var findup   = require('findup-sync');
var JSHINT   = require('jshint').JSHINT;
var Filter   = require('broccoli-filter');
var walkSync = require('walk-sync');
var Promise  = require('rsvp').Promise;
var mapSeries= require('promise-map-series');

JSHinter.prototype = Object.create(Filter.prototype);
JSHinter.prototype.constructor = JSHinter;
function JSHinter (inputTree, options) {
  if (!(this instanceof JSHinter)) return new JSHinter(inputTree, options);

  options = options || {};

  this.inputTree = inputTree;
  this.log       = true;
  this.console = console;

  for (var key in options) {
    if (options.hasOwnProperty(key)) {
      this[key] = options[key]
    }
  }
};

JSHinter.prototype.extensions = ['js'];
JSHinter.prototype.targetExtension = 'jshint.js';

JSHinter.prototype.write = function (readTree, destDir) {
  var self = this
  self._errors = [];

  return readTree(this.inputTree).then(function (srcDir) {
    if (!self.jshintrc) {
      var jshintPath = self.jshintrcPath || path.join(srcDir, self.jshintrcRoot || '');
      self.jshintrc = self.getConfig(jshintPath);
    }
    var paths = walkSync(srcDir)
    return mapSeries(paths, function (relativePath) {
      if (self.canProcessFile(relativePath)) {
        return self.processFile(srcDir, destDir, relativePath)
      }
    })
  })
  .finally(function() {
    if (self._errors.length > 0) {
      var label = ' JSHint Error' + (self._errors.length > 1 ? 's' : '')
      self.console.log('\n' + self._errors.join('\n'));
      self.console.log(chalk.yellow('===== ' + self._errors.length + label + '\n'));
    }
  })
};

JSHinter.prototype.processFile = function (srcDir, destDir, relativePath) {
  var self = this
  var inputEncoding = (this.inputEncoding === undefined) ? 'utf8' : this.inputEncoding
  var outputEncoding = (this.outputEncoding === undefined) ? 'utf8' : this.outputEncoding
  var string = fs.readFileSync(srcDir + '/' + relativePath, { encoding: inputEncoding })
  return Promise.resolve(self.processString(string, relativePath));
};

JSHinter.prototype.processString = function (content, relativePath) {
  var passed = JSHINT(content, this.jshintrc);
  var errors = this.processErrors(relativePath, JSHINT.errors),
      generalError;

  if (this.failOnAnyError && errors.length > 0){
    generalError = new Error('JSHint failed');
    generalError.jshintErrors = errors;
    throw generalError;
  }
  if (!passed && this.log) {
    this.logError(errors);
  }
};

JSHinter.prototype.processErrors = function (file, errors) {
  if (!errors) { return ''; }

  var len = errors.length,
  str = '',
  error, idx;

  if (len === 0) { return ''; }

  for (idx=0; idx<len; idx++) {
    error = errors[idx];
    if (error !== null) {
      str += file  + ': line ' + error.line + ', col ' +
        error.character + ', ' + error.reason + '\n';
    }
  }

  return str + "\n" + len + ' error' + ((len === 1) ? '' : 's');
};

JSHinter.prototype.logError = function(message, color) {
  color = color || 'red';

  this._errors.push(chalk[color](message) + "\n");
};

JSHinter.prototype.getConfig = function(rootPath) {
  if (!rootPath) { rootPath = process.cwd(); }

  var jshintrcPath = findup('.jshintrc', {cwd: rootPath, nocase: true});

  if (jshintrcPath) {
    var config = fs.readFileSync(jshintrcPath, {encoding: 'utf8'});

    try {
      return JSON.parse(this.stripComments(config));
    } catch (e) {
      this.console.error(chalk.red('Error occured parsing .jshintrc.'));
      this.console.error(e.stack);

      return null;
    }
  }
};

JSHinter.prototype.stripComments = function(string) {
  string = string || "";

  string = string.replace(/\/\*(?:(?!\*\/)[\s\S])*\*\//g, "");
  string = string.replace(/\/\/[^\n\r]*/g, ""); // Everything after '//'

  return string;
};

JSHinter.prototype.escapeErrorString = function(string) {
  string = string.replace(/\n/gi, "\\n");
  string = string.replace(/'/gi, "\\'");

  return string;
};

module.exports = JSHinter;
