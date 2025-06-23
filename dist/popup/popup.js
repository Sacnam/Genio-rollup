function extend (destination) {
  for (var i = 1; i < arguments.length; i++) {
    var source = arguments[i];
    for (var key in source) {
      if (source.hasOwnProperty(key)) destination[key] = source[key];
    }
  }
  return destination
}

function repeat (character, count) {
  return Array(count + 1).join(character)
}

function trimLeadingNewlines (string) {
  return string.replace(/^\n*/, '')
}

function trimTrailingNewlines (string) {
  // avoid match-at-end regexp bottleneck, see #370
  var indexEnd = string.length;
  while (indexEnd > 0 && string[indexEnd - 1] === '\n') indexEnd--;
  return string.substring(0, indexEnd)
}

var blockElements = [
  'ADDRESS', 'ARTICLE', 'ASIDE', 'AUDIO', 'BLOCKQUOTE', 'BODY', 'CANVAS',
  'CENTER', 'DD', 'DIR', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE',
  'FOOTER', 'FORM', 'FRAMESET', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER',
  'HGROUP', 'HR', 'HTML', 'ISINDEX', 'LI', 'MAIN', 'MENU', 'NAV', 'NOFRAMES',
  'NOSCRIPT', 'OL', 'OUTPUT', 'P', 'PRE', 'SECTION', 'TABLE', 'TBODY', 'TD',
  'TFOOT', 'TH', 'THEAD', 'TR', 'UL'
];

function isBlock (node) {
  return is(node, blockElements)
}

var voidElements = [
  'AREA', 'BASE', 'BR', 'COL', 'COMMAND', 'EMBED', 'HR', 'IMG', 'INPUT',
  'KEYGEN', 'LINK', 'META', 'PARAM', 'SOURCE', 'TRACK', 'WBR'
];

function isVoid (node) {
  return is(node, voidElements)
}

function hasVoid (node) {
  return has(node, voidElements)
}

var meaningfulWhenBlankElements = [
  'A', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TH', 'TD', 'IFRAME', 'SCRIPT',
  'AUDIO', 'VIDEO'
];

function isMeaningfulWhenBlank (node) {
  return is(node, meaningfulWhenBlankElements)
}

function hasMeaningfulWhenBlank (node) {
  return has(node, meaningfulWhenBlankElements)
}

function is (node, tagNames) {
  return tagNames.indexOf(node.nodeName) >= 0
}

function has (node, tagNames) {
  return (
    node.getElementsByTagName &&
    tagNames.some(function (tagName) {
      return node.getElementsByTagName(tagName).length
    })
  )
}

var rules$1 = {};

rules$1.paragraph = {
  filter: 'p',

  replacement: function (content) {
    return '\n\n' + content + '\n\n'
  }
};

rules$1.lineBreak = {
  filter: 'br',

  replacement: function (content, node, options) {
    return options.br + '\n'
  }
};

rules$1.heading = {
  filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],

  replacement: function (content, node, options) {
    var hLevel = Number(node.nodeName.charAt(1));

    if (options.headingStyle === 'setext' && hLevel < 3) {
      var underline = repeat((hLevel === 1 ? '=' : '-'), content.length);
      return (
        '\n\n' + content + '\n' + underline + '\n\n'
      )
    } else {
      return '\n\n' + repeat('#', hLevel) + ' ' + content + '\n\n'
    }
  }
};

rules$1.blockquote = {
  filter: 'blockquote',

  replacement: function (content) {
    content = content.replace(/^\n+|\n+$/g, '');
    content = content.replace(/^/gm, '> ');
    return '\n\n' + content + '\n\n'
  }
};

rules$1.list = {
  filter: ['ul', 'ol'],

  replacement: function (content, node) {
    var parent = node.parentNode;
    if (parent.nodeName === 'LI' && parent.lastElementChild === node) {
      return '\n' + content
    } else {
      return '\n\n' + content + '\n\n'
    }
  }
};

rules$1.listItem = {
  filter: 'li',

  replacement: function (content, node, options) {
    content = content
      .replace(/^\n+/, '') // remove leading newlines
      .replace(/\n+$/, '\n') // replace trailing newlines with just a single one
      .replace(/\n/gm, '\n    '); // indent
    var prefix = options.bulletListMarker + '   ';
    var parent = node.parentNode;
    if (parent.nodeName === 'OL') {
      var start = parent.getAttribute('start');
      var index = Array.prototype.indexOf.call(parent.children, node);
      prefix = (start ? Number(start) + index : index + 1) + '.  ';
    }
    return (
      prefix + content + (node.nextSibling && !/\n$/.test(content) ? '\n' : '')
    )
  }
};

rules$1.indentedCodeBlock = {
  filter: function (node, options) {
    return (
      options.codeBlockStyle === 'indented' &&
      node.nodeName === 'PRE' &&
      node.firstChild &&
      node.firstChild.nodeName === 'CODE'
    )
  },

  replacement: function (content, node, options) {
    return (
      '\n\n    ' +
      node.firstChild.textContent.replace(/\n/g, '\n    ') +
      '\n\n'
    )
  }
};

rules$1.fencedCodeBlock = {
  filter: function (node, options) {
    return (
      options.codeBlockStyle === 'fenced' &&
      node.nodeName === 'PRE' &&
      node.firstChild &&
      node.firstChild.nodeName === 'CODE'
    )
  },

  replacement: function (content, node, options) {
    var className = node.firstChild.getAttribute('class') || '';
    var language = (className.match(/language-(\S+)/) || [null, ''])[1];
    var code = node.firstChild.textContent;

    var fenceChar = options.fence.charAt(0);
    var fenceSize = 3;
    var fenceInCodeRegex = new RegExp('^' + fenceChar + '{3,}', 'gm');

    var match;
    while ((match = fenceInCodeRegex.exec(code))) {
      if (match[0].length >= fenceSize) {
        fenceSize = match[0].length + 1;
      }
    }

    var fence = repeat(fenceChar, fenceSize);

    return (
      '\n\n' + fence + language + '\n' +
      code.replace(/\n$/, '') +
      '\n' + fence + '\n\n'
    )
  }
};

rules$1.horizontalRule = {
  filter: 'hr',

  replacement: function (content, node, options) {
    return '\n\n' + options.hr + '\n\n'
  }
};

rules$1.inlineLink = {
  filter: function (node, options) {
    return (
      options.linkStyle === 'inlined' &&
      node.nodeName === 'A' &&
      node.getAttribute('href')
    )
  },

  replacement: function (content, node) {
    var href = node.getAttribute('href');
    if (href) href = href.replace(/([()])/g, '\\$1');
    var title = cleanAttribute(node.getAttribute('title'));
    if (title) title = ' "' + title.replace(/"/g, '\\"') + '"';
    return '[' + content + '](' + href + title + ')'
  }
};

rules$1.referenceLink = {
  filter: function (node, options) {
    return (
      options.linkStyle === 'referenced' &&
      node.nodeName === 'A' &&
      node.getAttribute('href')
    )
  },

  replacement: function (content, node, options) {
    var href = node.getAttribute('href');
    var title = cleanAttribute(node.getAttribute('title'));
    if (title) title = ' "' + title + '"';
    var replacement;
    var reference;

    switch (options.linkReferenceStyle) {
      case 'collapsed':
        replacement = '[' + content + '][]';
        reference = '[' + content + ']: ' + href + title;
        break
      case 'shortcut':
        replacement = '[' + content + ']';
        reference = '[' + content + ']: ' + href + title;
        break
      default:
        var id = this.references.length + 1;
        replacement = '[' + content + '][' + id + ']';
        reference = '[' + id + ']: ' + href + title;
    }

    this.references.push(reference);
    return replacement
  },

  references: [],

  append: function (options) {
    var references = '';
    if (this.references.length) {
      references = '\n\n' + this.references.join('\n') + '\n\n';
      this.references = []; // Reset references
    }
    return references
  }
};

rules$1.emphasis = {
  filter: ['em', 'i'],

  replacement: function (content, node, options) {
    if (!content.trim()) return ''
    return options.emDelimiter + content + options.emDelimiter
  }
};

rules$1.strong = {
  filter: ['strong', 'b'],

  replacement: function (content, node, options) {
    if (!content.trim()) return ''
    return options.strongDelimiter + content + options.strongDelimiter
  }
};

rules$1.code = {
  filter: function (node) {
    var hasSiblings = node.previousSibling || node.nextSibling;
    var isCodeBlock = node.parentNode.nodeName === 'PRE' && !hasSiblings;

    return node.nodeName === 'CODE' && !isCodeBlock
  },

  replacement: function (content) {
    if (!content) return ''
    content = content.replace(/\r?\n|\r/g, ' ');

    var extraSpace = /^`|^ .*?[^ ].* $|`$/.test(content) ? ' ' : '';
    var delimiter = '`';
    var matches = content.match(/`+/gm) || [];
    while (matches.indexOf(delimiter) !== -1) delimiter = delimiter + '`';

    return delimiter + extraSpace + content + extraSpace + delimiter
  }
};

rules$1.image = {
  filter: 'img',

  replacement: function (content, node) {
    var alt = cleanAttribute(node.getAttribute('alt'));
    var src = node.getAttribute('src') || '';
    var title = cleanAttribute(node.getAttribute('title'));
    var titlePart = title ? ' "' + title + '"' : '';
    return src ? '![' + alt + ']' + '(' + src + titlePart + ')' : ''
  }
};

function cleanAttribute (attribute) {
  return attribute ? attribute.replace(/(\n+\s*)+/g, '\n') : ''
}

/**
 * Manages a collection of rules used to convert HTML to Markdown
 */

function Rules (options) {
  this.options = options;
  this._keep = [];
  this._remove = [];

  this.blankRule = {
    replacement: options.blankReplacement
  };

  this.keepReplacement = options.keepReplacement;

  this.defaultRule = {
    replacement: options.defaultReplacement
  };

  this.array = [];
  for (var key in options.rules) this.array.push(options.rules[key]);
}

Rules.prototype = {
  add: function (key, rule) {
    this.array.unshift(rule);
  },

  keep: function (filter) {
    this._keep.unshift({
      filter: filter,
      replacement: this.keepReplacement
    });
  },

  remove: function (filter) {
    this._remove.unshift({
      filter: filter,
      replacement: function () {
        return ''
      }
    });
  },

  forNode: function (node) {
    if (node.isBlank) return this.blankRule
    var rule;

    if ((rule = findRule(this.array, node, this.options))) return rule
    if ((rule = findRule(this._keep, node, this.options))) return rule
    if ((rule = findRule(this._remove, node, this.options))) return rule

    return this.defaultRule
  },

  forEach: function (fn) {
    for (var i = 0; i < this.array.length; i++) fn(this.array[i], i);
  }
};

function findRule (rules, node, options) {
  for (var i = 0; i < rules.length; i++) {
    var rule = rules[i];
    if (filterValue(rule, node, options)) return rule
  }
  return void 0
}

function filterValue (rule, node, options) {
  var filter = rule.filter;
  if (typeof filter === 'string') {
    if (filter === node.nodeName.toLowerCase()) return true
  } else if (Array.isArray(filter)) {
    if (filter.indexOf(node.nodeName.toLowerCase()) > -1) return true
  } else if (typeof filter === 'function') {
    if (filter.call(rule, node, options)) return true
  } else {
    throw new TypeError('`filter` needs to be a string, array, or function')
  }
}

/**
 * The collapseWhitespace function is adapted from collapse-whitespace
 * by Luc Thevenard.
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2014 Luc Thevenard <lucthevenard@gmail.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

/**
 * collapseWhitespace(options) removes extraneous whitespace from an the given element.
 *
 * @param {Object} options
 */
function collapseWhitespace (options) {
  var element = options.element;
  var isBlock = options.isBlock;
  var isVoid = options.isVoid;
  var isPre = options.isPre || function (node) {
    return node.nodeName === 'PRE'
  };

  if (!element.firstChild || isPre(element)) return

  var prevText = null;
  var keepLeadingWs = false;

  var prev = null;
  var node = next(prev, element, isPre);

  while (node !== element) {
    if (node.nodeType === 3 || node.nodeType === 4) { // Node.TEXT_NODE or Node.CDATA_SECTION_NODE
      var text = node.data.replace(/[ \r\n\t]+/g, ' ');

      if ((!prevText || / $/.test(prevText.data)) &&
          !keepLeadingWs && text[0] === ' ') {
        text = text.substr(1);
      }

      // `text` might be empty at this point.
      if (!text) {
        node = remove(node);
        continue
      }

      node.data = text;

      prevText = node;
    } else if (node.nodeType === 1) { // Node.ELEMENT_NODE
      if (isBlock(node) || node.nodeName === 'BR') {
        if (prevText) {
          prevText.data = prevText.data.replace(/ $/, '');
        }

        prevText = null;
        keepLeadingWs = false;
      } else if (isVoid(node) || isPre(node)) {
        // Avoid trimming space around non-block, non-BR void elements and inline PRE.
        prevText = null;
        keepLeadingWs = true;
      } else if (prevText) {
        // Drop protection if set previously.
        keepLeadingWs = false;
      }
    } else {
      node = remove(node);
      continue
    }

    var nextNode = next(prev, node, isPre);
    prev = node;
    node = nextNode;
  }

  if (prevText) {
    prevText.data = prevText.data.replace(/ $/, '');
    if (!prevText.data) {
      remove(prevText);
    }
  }
}

/**
 * remove(node) removes the given node from the DOM and returns the
 * next node in the sequence.
 *
 * @param {Node} node
 * @return {Node} node
 */
function remove (node) {
  var next = node.nextSibling || node.parentNode;

  node.parentNode.removeChild(node);

  return next
}

/**
 * next(prev, current, isPre) returns the next node in the sequence, given the
 * current and previous nodes.
 *
 * @param {Node} prev
 * @param {Node} current
 * @param {Function} isPre
 * @return {Node}
 */
function next (prev, current, isPre) {
  if ((prev && prev.parentNode === current) || isPre(current)) {
    return current.nextSibling || current.parentNode
  }

  return current.firstChild || current.nextSibling || current.parentNode
}

/*
 * Set up window for Node.js
 */

var root = (typeof window !== 'undefined' ? window : {});

/*
 * Parsing HTML strings
 */

function canParseHTMLNatively () {
  var Parser = root.DOMParser;
  var canParse = false;

  // Adapted from https://gist.github.com/1129031
  // Firefox/Opera/IE throw errors on unsupported types
  try {
    // WebKit returns null on unsupported types
    if (new Parser().parseFromString('', 'text/html')) {
      canParse = true;
    }
  } catch (e) {}

  return canParse
}

function createHTMLParser () {
  var Parser = function () {};

  {
    var domino = require('@mixmark-io/domino');
    Parser.prototype.parseFromString = function (string) {
      return domino.createDocument(string)
    };
  }
  return Parser
}

var HTMLParser = canParseHTMLNatively() ? root.DOMParser : createHTMLParser();

function RootNode (input, options) {
  var root;
  if (typeof input === 'string') {
    var doc = htmlParser().parseFromString(
      // DOM parsers arrange elements in the <head> and <body>.
      // Wrapping in a custom element ensures elements are reliably arranged in
      // a single element.
      '<x-turndown id="turndown-root">' + input + '</x-turndown>',
      'text/html'
    );
    root = doc.getElementById('turndown-root');
  } else {
    root = input.cloneNode(true);
  }
  collapseWhitespace({
    element: root,
    isBlock: isBlock,
    isVoid: isVoid,
    isPre: options.preformattedCode ? isPreOrCode : null
  });

  return root
}

var _htmlParser;
function htmlParser () {
  _htmlParser = _htmlParser || new HTMLParser();
  return _htmlParser
}

function isPreOrCode (node) {
  return node.nodeName === 'PRE' || node.nodeName === 'CODE'
}

function Node (node, options) {
  node.isBlock = isBlock(node);
  node.isCode = node.nodeName === 'CODE' || node.parentNode.isCode;
  node.isBlank = isBlank(node);
  node.flankingWhitespace = flankingWhitespace(node, options);
  return node
}

function isBlank (node) {
  return (
    !isVoid(node) &&
    !isMeaningfulWhenBlank(node) &&
    /^\s*$/i.test(node.textContent) &&
    !hasVoid(node) &&
    !hasMeaningfulWhenBlank(node)
  )
}

function flankingWhitespace (node, options) {
  if (node.isBlock || (options.preformattedCode && node.isCode)) {
    return { leading: '', trailing: '' }
  }

  var edges = edgeWhitespace(node.textContent);

  // abandon leading ASCII WS if left-flanked by ASCII WS
  if (edges.leadingAscii && isFlankedByWhitespace('left', node, options)) {
    edges.leading = edges.leadingNonAscii;
  }

  // abandon trailing ASCII WS if right-flanked by ASCII WS
  if (edges.trailingAscii && isFlankedByWhitespace('right', node, options)) {
    edges.trailing = edges.trailingNonAscii;
  }

  return { leading: edges.leading, trailing: edges.trailing }
}

function edgeWhitespace (string) {
  var m = string.match(/^(([ \t\r\n]*)(\s*))(?:(?=\S)[\s\S]*\S)?((\s*?)([ \t\r\n]*))$/);
  return {
    leading: m[1], // whole string for whitespace-only strings
    leadingAscii: m[2],
    leadingNonAscii: m[3],
    trailing: m[4], // empty for whitespace-only strings
    trailingNonAscii: m[5],
    trailingAscii: m[6]
  }
}

function isFlankedByWhitespace (side, node, options) {
  var sibling;
  var regExp;
  var isFlanked;

  if (side === 'left') {
    sibling = node.previousSibling;
    regExp = / $/;
  } else {
    sibling = node.nextSibling;
    regExp = /^ /;
  }

  if (sibling) {
    if (sibling.nodeType === 3) {
      isFlanked = regExp.test(sibling.nodeValue);
    } else if (options.preformattedCode && sibling.nodeName === 'CODE') {
      isFlanked = false;
    } else if (sibling.nodeType === 1 && !isBlock(sibling)) {
      isFlanked = regExp.test(sibling.textContent);
    }
  }
  return isFlanked
}

var reduce = Array.prototype.reduce;
var escapes = [
  [/\\/g, '\\\\'],
  [/\*/g, '\\*'],
  [/^-/g, '\\-'],
  [/^\+ /g, '\\+ '],
  [/^(=+)/g, '\\$1'],
  [/^(#{1,6}) /g, '\\$1 '],
  [/`/g, '\\`'],
  [/^~~~/g, '\\~~~'],
  [/\[/g, '\\['],
  [/\]/g, '\\]'],
  [/^>/g, '\\>'],
  [/_/g, '\\_'],
  [/^(\d+)\. /g, '$1\\. ']
];

function TurndownService (options) {
  if (!(this instanceof TurndownService)) return new TurndownService(options)

  var defaults = {
    rules: rules$1,
    headingStyle: 'setext',
    hr: '* * *',
    bulletListMarker: '*',
    codeBlockStyle: 'indented',
    fence: '```',
    emDelimiter: '_',
    strongDelimiter: '**',
    linkStyle: 'inlined',
    linkReferenceStyle: 'full',
    br: '  ',
    preformattedCode: false,
    blankReplacement: function (content, node) {
      return node.isBlock ? '\n\n' : ''
    },
    keepReplacement: function (content, node) {
      return node.isBlock ? '\n\n' + node.outerHTML + '\n\n' : node.outerHTML
    },
    defaultReplacement: function (content, node) {
      return node.isBlock ? '\n\n' + content + '\n\n' : content
    }
  };
  this.options = extend({}, defaults, options);
  this.rules = new Rules(this.options);
}

TurndownService.prototype = {
  /**
   * The entry point for converting a string or DOM node to Markdown
   * @public
   * @param {String|HTMLElement} input The string or DOM node to convert
   * @returns A Markdown representation of the input
   * @type String
   */

  turndown: function (input) {
    if (!canConvert(input)) {
      throw new TypeError(
        input + ' is not a string, or an element/document/fragment node.'
      )
    }

    if (input === '') return ''

    var output = process.call(this, new RootNode(input, this.options));
    return postProcess.call(this, output)
  },

  /**
   * Add one or more plugins
   * @public
   * @param {Function|Array} plugin The plugin or array of plugins to add
   * @returns The Turndown instance for chaining
   * @type Object
   */

  use: function (plugin) {
    if (Array.isArray(plugin)) {
      for (var i = 0; i < plugin.length; i++) this.use(plugin[i]);
    } else if (typeof plugin === 'function') {
      plugin(this);
    } else {
      throw new TypeError('plugin must be a Function or an Array of Functions')
    }
    return this
  },

  /**
   * Adds a rule
   * @public
   * @param {String} key The unique key of the rule
   * @param {Object} rule The rule
   * @returns The Turndown instance for chaining
   * @type Object
   */

  addRule: function (key, rule) {
    this.rules.add(key, rule);
    return this
  },

  /**
   * Keep a node (as HTML) that matches the filter
   * @public
   * @param {String|Array|Function} filter The unique key of the rule
   * @returns The Turndown instance for chaining
   * @type Object
   */

  keep: function (filter) {
    this.rules.keep(filter);
    return this
  },

  /**
   * Remove a node that matches the filter
   * @public
   * @param {String|Array|Function} filter The unique key of the rule
   * @returns The Turndown instance for chaining
   * @type Object
   */

  remove: function (filter) {
    this.rules.remove(filter);
    return this
  },

  /**
   * Escapes Markdown syntax
   * @public
   * @param {String} string The string to escape
   * @returns A string with Markdown syntax escaped
   * @type String
   */

  escape: function (string) {
    return escapes.reduce(function (accumulator, escape) {
      return accumulator.replace(escape[0], escape[1])
    }, string)
  }
};

/**
 * Reduces a DOM node down to its Markdown string equivalent
 * @private
 * @param {HTMLElement} parentNode The node to convert
 * @returns A Markdown representation of the node
 * @type String
 */

function process (parentNode) {
  var self = this;
  return reduce.call(parentNode.childNodes, function (output, node) {
    node = new Node(node, self.options);

    var replacement = '';
    if (node.nodeType === 3) {
      replacement = node.isCode ? node.nodeValue : self.escape(node.nodeValue);
    } else if (node.nodeType === 1) {
      replacement = replacementForNode.call(self, node);
    }

    return join(output, replacement)
  }, '')
}

/**
 * Appends strings as each rule requires and trims the output
 * @private
 * @param {String} output The conversion output
 * @returns A trimmed version of the ouput
 * @type String
 */

function postProcess (output) {
  var self = this;
  this.rules.forEach(function (rule) {
    if (typeof rule.append === 'function') {
      output = join(output, rule.append(self.options));
    }
  });

  return output.replace(/^[\t\r\n]+/, '').replace(/[\t\r\n\s]+$/, '')
}

/**
 * Converts an element node to its Markdown equivalent
 * @private
 * @param {HTMLElement} node The node to convert
 * @returns A Markdown representation of the node
 * @type String
 */

function replacementForNode (node) {
  var rule = this.rules.forNode(node);
  var content = process.call(this, node);
  var whitespace = node.flankingWhitespace;
  if (whitespace.leading || whitespace.trailing) content = content.trim();
  return (
    whitespace.leading +
    rule.replacement(content, node, this.options) +
    whitespace.trailing
  )
}

/**
 * Joins replacement to the current output with appropriate number of new lines
 * @private
 * @param {String} output The current conversion output
 * @param {String} replacement The string to append to the output
 * @returns Joined output
 * @type String
 */

function join (output, replacement) {
  var s1 = trimTrailingNewlines(output);
  var s2 = trimLeadingNewlines(replacement);
  var nls = Math.max(output.length - s1.length, replacement.length - s2.length);
  var separator = '\n\n'.substring(0, nls);

  return s1 + separator + s2
}

/**
 * Determines whether an input can be converted
 * @private
 * @param {String|HTMLElement} input Describe this parameter
 * @returns Describe what it returns
 * @type String|Object|Array|Boolean|Number
 */

function canConvert (input) {
  return (
    input != null && (
      typeof input === 'string' ||
      (input.nodeType && (
        input.nodeType === 1 || input.nodeType === 9 || input.nodeType === 11
      ))
    )
  )
}

var highlightRegExp = /highlight-(?:text|source)-([a-z0-9]+)/;

function highlightedCodeBlock (turndownService) {
  turndownService.addRule('highlightedCodeBlock', {
    filter: function (node) {
      var firstChild = node.firstChild;
      return (
        node.nodeName === 'DIV' &&
        highlightRegExp.test(node.className) &&
        firstChild &&
        firstChild.nodeName === 'PRE'
      )
    },
    replacement: function (content, node, options) {
      var className = node.className || '';
      var language = (className.match(highlightRegExp) || [null, ''])[1];

      return (
        '\n\n' + options.fence + language + '\n' +
        node.firstChild.textContent +
        '\n' + options.fence + '\n\n'
      )
    }
  });
}

function strikethrough (turndownService) {
  turndownService.addRule('strikethrough', {
    filter: ['del', 's', 'strike'],
    replacement: function (content) {
      return '~' + content + '~'
    }
  });
}

var indexOf = Array.prototype.indexOf;
var every = Array.prototype.every;
var rules = {};

rules.tableCell = {
  filter: ['th', 'td'],
  replacement: function (content, node) {
    return cell(content, node)
  }
};

rules.tableRow = {
  filter: 'tr',
  replacement: function (content, node) {
    var borderCells = '';
    var alignMap = { left: ':--', right: '--:', center: ':-:' };

    if (isHeadingRow(node)) {
      for (var i = 0; i < node.childNodes.length; i++) {
        var border = '---';
        var align = (
          node.childNodes[i].getAttribute('align') || ''
        ).toLowerCase();

        if (align) border = alignMap[align] || border;

        borderCells += cell(border, node.childNodes[i]);
      }
    }
    return '\n' + content + (borderCells ? '\n' + borderCells : '')
  }
};

rules.table = {
  // Only convert tables with a heading row.
  // Tables with no heading row are kept using `keep` (see below).
  filter: function (node) {
    return node.nodeName === 'TABLE' && isHeadingRow(node.rows[0])
  },

  replacement: function (content) {
    // Ensure there are no blank lines
    content = content.replace('\n\n', '\n');
    return '\n\n' + content + '\n\n'
  }
};

rules.tableSection = {
  filter: ['thead', 'tbody', 'tfoot'],
  replacement: function (content) {
    return content
  }
};

// A tr is a heading row if:
// - the parent is a THEAD
// - or if its the first child of the TABLE or the first TBODY (possibly
//   following a blank THEAD)
// - and every cell is a TH
function isHeadingRow (tr) {
  var parentNode = tr.parentNode;
  return (
    parentNode.nodeName === 'THEAD' ||
    (
      parentNode.firstChild === tr &&
      (parentNode.nodeName === 'TABLE' || isFirstTbody(parentNode)) &&
      every.call(tr.childNodes, function (n) { return n.nodeName === 'TH' })
    )
  )
}

function isFirstTbody (element) {
  var previousSibling = element.previousSibling;
  return (
    element.nodeName === 'TBODY' && (
      !previousSibling ||
      (
        previousSibling.nodeName === 'THEAD' &&
        /^\s*$/i.test(previousSibling.textContent)
      )
    )
  )
}

function cell (content, node) {
  var index = indexOf.call(node.parentNode.childNodes, node);
  var prefix = ' ';
  if (index === 0) prefix = '| ';
  return prefix + content + ' |'
}

function tables (turndownService) {
  turndownService.keep(function (node) {
    return node.nodeName === 'TABLE' && !isHeadingRow(node.rows[0])
  });
  for (var key in rules) turndownService.addRule(key, rules[key]);
}

function taskListItems (turndownService) {
  turndownService.addRule('taskListItems', {
    filter: function (node) {
      return node.type === 'checkbox' && node.parentNode.nodeName === 'LI'
    },
    replacement: function (content, node) {
      return (node.checked ? '[x]' : '[ ]') + ' '
    }
  });
}

function gfm (turndownService) {
  turndownService.use([
    highlightedCodeBlock,
    strikethrough,
    tables,
    taskListItems
  ]);
}

// popup.js (Refactored for Manifest V3 - Message Passing Architecture)

// --- Storage Keys ---
const MARKDOWN_DRAWER_STATE_KEY = 'popupMarkdownDrawerOpen';
const RSS_MANUAL_DRAWER_STATE_KEY = 'popupRssManualDrawerOpen';
const RSSHUB_RADAR_RULES_KEY = 'rsshubRadarRules';
const RSSHUB_RADAR_RULES_TIMESTAMP_KEY = 'rsshubRadarRulesTimestamp';

// --- RSSHub Config ---
const RSSHUB_INSTANCE_URL = 'https://rsshub.app';
const RSSHUB_RULES_SOURCE_URL = 'https://cdn.jsdelivr.net/gh/DIYgod/RSSHub-Radar@master/rules.js';

// --- Variabili di stato globali del popup ---
let currentUser = null;
let currentSubscriptions = {};

// --- Funzione UUID ---
function generateUUID() {
    var d = new Date().getTime();
    var d2 = ((typeof performance !== 'undefined') && performance.now && (performance.now()*1000)) || 0;
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16;
        if(d > 0){
            r = (d + r)%16 | 0;
            d = Math.floor(d/16);
        } else {
            r = (d2 + r)%16 | 0;
            d2 = Math.floor(d2/16);
        }
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

// --- Funzioni UI ---
function updateUIVisibility(isLoggedIn) {
    const authBlock = document.getElementById('auth-block');
    const controlsContainer = document.getElementById('controls-container');
    const saveReaderButton = document.getElementById('save-reader-button');

    if (isLoggedIn) {
        if (authBlock) authBlock.style.display = 'none';
        if (controlsContainer) controlsContainer.style.display = 'flex';
        if (saveReaderButton) saveReaderButton.disabled = false;
    } else {
        if (authBlock) authBlock.style.display = 'block';
        if (controlsContainer) controlsContainer.style.display = 'none';
        if (saveReaderButton) saveReaderButton.disabled = true;
        const pageTitleElement = document.getElementById('page-title');
        const pageUrlElement = document.getElementById('page-url');
        if (pageTitleElement) pageTitleElement.textContent = "Login Required";
        if (pageUrlElement) pageUrlElement.textContent = "Please log in to use features.";
    }
}

// --- Setup Popup ---
async function initializePopup(isLoggedIn) {
    updateUIVisibility(isLoggedIn);

    const pageTitleElement = document.getElementById('page-title');
    const pageUrlElement = document.getElementById('page-url');
    const markdownContentElement = document.getElementById('markdown-content');
    const saveReaderButton = document.getElementById('save-reader-button');
    const downloadMdButton = document.getElementById('download-md-button');
    const openManagerBtn = document.getElementById('open-manager-btn');
    const markdownDrawer = document.getElementById('markdown-drawer');
    const detectedRssOutsideDiv = document.getElementById('detected-rss-outside');
    const rssManualDrawer = document.getElementById('rss-manual-drawer');
    const addCustomFeedBtn = document.getElementById('add-custom-feed');
    const customFeedUrlInput = document.getElementById('custom-feed-url');

    // Gestione stato drawers
    if (markdownDrawer && rssManualDrawer) {
        const result = await chrome.storage.local.get([MARKDOWN_DRAWER_STATE_KEY, RSS_MANUAL_DRAWER_STATE_KEY]);
        if (typeof result[MARKDOWN_DRAWER_STATE_KEY] === 'boolean') markdownDrawer.open = result[MARKDOWN_DRAWER_STATE_KEY];
        if (typeof result[RSS_MANUAL_DRAWER_STATE_KEY] === 'boolean') rssManualDrawer.open = result[RSS_MANUAL_DRAWER_STATE_KEY];
        markdownDrawer.addEventListener('toggle', () => chrome.storage.local.set({ [MARKDOWN_DRAWER_STATE_KEY]: markdownDrawer.open }));
        rssManualDrawer.addEventListener('toggle', () => chrome.storage.local.set({ [RSS_MANUAL_DRAWER_STATE_KEY]: rssManualDrawer.open }));
    }

    if (openManagerBtn) openManagerBtn.addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('reader/reader.html') }));

    if (addCustomFeedBtn && customFeedUrlInput) {
        addCustomFeedBtn.disabled = false;
        customFeedUrlInput.disabled = false;
        addCustomFeedBtn.addEventListener('click', () => {
            const feedUrl = customFeedUrlInput.value.trim();
            if (feedUrl) {
                handleManualFeedSubscription(feedUrl);
            } else {
                showToastNotification('Please enter a feed URL.', 'warning', 2500);
            }
        });
    }

    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs || tabs.length === 0) {
            pageTitleElement.textContent = "No active tab";
            pageUrlElement.textContent = "Open a tab to get started.";
            markdownContentElement.value = '';
            markdownContentElement.placeholder = "No preview available.";
            markdownContentElement.readOnly = true;
            saveReaderButton.disabled = true;
            downloadMdButton.disabled = true;
            detectedRssOutsideDiv.innerHTML = '<p class="info">No active tab. RSS detection unavailable.</p>';
            return;
        }
        const tab = tabs[0];
        const title = tab.title || 'No Title';
        const url = tab.url;

        if (!url || !url.startsWith('http')) {
            pageTitleElement.textContent = title || "Unsupported Page";
            pageUrlElement.textContent = url || "Invalid URL";
            markdownContentElement.value = '';
            markdownContentElement.placeholder = "Preview not available for this page.";
            markdownContentElement.readOnly = true;
            saveReaderButton.disabled = true;
            downloadMdButton.disabled = true;
            detectedRssOutsideDiv.innerHTML = '<p class="info">Automatic RSS detection not available for this page type.</p>';
            return;
        }

        pageTitleElement.textContent = title;
        pageUrlElement.textContent = url;
        markdownContentElement.readOnly = false;
        saveReaderButton.disabled = !isLoggedIn;

        let fullHtmlContent = '';
        let parsedFullHtmlDoc;
        try {
            const injectionResults = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => document.documentElement.outerHTML
            });
            if (injectionResults && injectionResults[0] && injectionResults[0].result) {
                fullHtmlContent = injectionResults[0].result;
                if (fullHtmlContent) parsedFullHtmlDoc = new DOMParser().parseFromString(fullHtmlContent, "text/html");
            }
        } catch (scriptError) {
            console.warn("Failed to get full HTML (catch):", scriptError.message);
        }

        if (fullHtmlContent) {
            const turndownService = new TurndownService();
            turndownService.use(gfm);
            const markdownForDownload = turndownService.turndown(fullHtmlContent);

            markdownContentElement.value = `# ${title}\n\n**URL:** [${url}](${url})\n\n${markdownForDownload}`;
            downloadMdButton.disabled = false;
        } else {
            markdownContentElement.value = `# ${title}\n\n**URL:** [${url}](${url})\n\n${fullHtmlContent ? '_Markdown preview unavailable._' : '_Could not retrieve page content for preview._'}`;
            downloadMdButton.disabled = !fullHtmlContent;
            saveReaderButton.disabled = !fullHtmlContent || !isLoggedIn;
        }

        if (downloadMdButton) {
            downloadMdButton.addEventListener('click', () => {
                const blob = new Blob([markdownContentElement.value], { type: 'text/markdown;charset=utf-8' });
                const objectUrl = URL.createObjectURL(blob);
                chrome.downloads.download({
                    url: objectUrl,
                    filename: `${title.replace(/[\\/:*?"<>|]/g, '_').substring(0, 100)}.md`,
                    saveAs: true
                }, () => URL.revokeObjectURL(objectUrl));
            });
        }
        
        if (saveReaderButton) {
            saveReaderButton.addEventListener('click', () => {
                if (!currentUser) {
                    showToastNotification("Please log in to save articles.", 'warning', 3000);
                    return;
                }
                saveReaderButton.disabled = true;
                saveReaderButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

                const articleData = {
                    title: title,
                    url: url,
                    content: markdownContentElement.value,
                    imageUrl: parsedFullHtmlDoc ? extractBestImage(parsedFullHtmlDoc, fullHtmlContent, url) : '',
                    source: 'manual',
                    id: generateUUID() // Genera un ID unico lato client
                };

                chrome.runtime.sendMessage({ command: 'saveArticle', payload: articleData }, (response) => {
                    if (response && response.success) {
                        showToastNotification(`"${articleData.title.substring(0,30)}..." ${response.operationType} to your articles!`, 'info', 2500);
                    } else {
                        const errorMsg = response ? response.error.message : "Unknown error";
                        console.error("Error saving article:", errorMsg);
                        showToastNotification(`Save error: ${errorMsg}`, 'error', 3000);
                    }
                    saveReaderButton.disabled = false;
                    saveReaderButton.innerHTML = '<i class="fas fa-bookmark"></i> Save';
                });
            });
        }
        await checkForRSSFeeds();
    } catch (error) {
        console.error("Popup error:", error);
        pageTitleElement.textContent = "Error";
        pageUrlElement.textContent = "Could not load data.";
        markdownContentElement.value = `ERROR: ${error.message}`;
        saveReaderButton.disabled = true;
        downloadMdButton.disabled = true;
        detectedRssOutsideDiv.innerHTML = '<p class="info error-text">Error loading feeds.</p>';
    }
}

let toastTimeout;
function showToastNotification(message, type = 'success', duration = 2500) {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        Object.assign(toast.style, {
            position: 'fixed', bottom: '-60px', left: '50%', transform: 'translateX(-50%)',
            padding: type === 'info' || type === 'success' ? '8px 15px' : '10px 20px',
            borderRadius: '5px', color: 'white',
            fontSize: type === 'info' || type === 'success' ? '0.8em' : '0.9em',
            fontWeight: '500', zIndex: '10000', opacity: '0',
            transition: 'opacity 0.25s ease-out, bottom 0.25s ease-out',
            boxShadow: '0 3px 8px rgba(0,0,0,0.15)', textAlign: 'center',
            minWidth: '180px', maxWidth: '85%'
        });
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    if (type === 'info') toast.style.backgroundColor = '#3498db';
    else if (type === 'success') toast.style.backgroundColor = '#2ecc71';
    else if (type === 'error') toast.style.backgroundColor = '#e74c3c';
    else if (type === 'warning') toast.style.backgroundColor = '#f39c12';
    else toast.style.backgroundColor = '#34495e';

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.bottom = '15px';
    });
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.bottom = '-60px';
    }, duration);
}

function extractBestImage(htmlDoc, articleHtmlContent, baseUrl) {
    let imageUrl = '';
    try {
        if (!htmlDoc && !articleHtmlContent) return '';
        const docToParse = htmlDoc || new DOMParser().parseFromString(articleHtmlContent || "", "text/html");

        const normalizeUrl = (urlCandidate) => {
            if (!urlCandidate) return '';
            try { return new URL(urlCandidate, baseUrl).href; }
            catch (e) { console.warn(`extractBestImage: Could not normalize URL "${urlCandidate}" with base "${baseUrl}"`, e); return ''; }
        };
        const isValidImage = (src, imgElement) => {
            if (!src || (src.startsWith('data:image') && !src.startsWith('data:image/svg+xml') && src.length < 1024 )) return false;
            if (imgElement) {
                const width = parseInt(imgElement.getAttribute('width') || imgElement.offsetWidth || '0');
                const height = parseInt(imgElement.getAttribute('height') || imgElement.offsetHeight || '0');
                if ((width > 0 && width < 100) || (height > 0 && height < 100)) return false;
            }
            return true;
        };

        const ogImage = docToParse.querySelector('meta[property="og:image"]');
        if (ogImage && ogImage.content) { imageUrl = normalizeUrl(ogImage.content); if (isValidImage(imageUrl)) return imageUrl; }
        const twitterImage = docToParse.querySelector('meta[name="twitter:image"]');
        if (twitterImage && twitterImage.content) { imageUrl = normalizeUrl(twitterImage.content); if (isValidImage(imageUrl)) return imageUrl; }

        const images = Array.from(docToParse.getElementsByTagName('img'));
        for (const img of images) { if (img.src) { imageUrl = normalizeUrl(img.src); if (isValidImage(imageUrl, img)) return imageUrl; } }

    } catch (e) { console.warn("Image extraction error:", e); }
    return '';
}

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/"/g, "").replace(/'/g, "'");
}

const socialMediaHandlers = {
    'youtube.com': handleYoutubeUrl, 'x.com': handleTwitterUrl, 'twitter.com': handleTwitterUrl,
    'instagram.com': handleInstagramUrl, 'tiktok.com': handleTiktokUrl, 'bsky.app': handleBlueskyUrl,
    'weibo.com': handleWeiboUrl, 'bilibili.com': handleBilibiliUrl, 'zhihu.com': handleZhihuUrl,
    'threads.net': handleThreadsUrl
};
function handleYoutubeUrl(urlObject) {
    const pathname = urlObject.pathname;
    let match = pathname.match(/^\/(@[\w.-]+)/);
    if (match && match[1]) return `${RSSHUB_INSTANCE_URL}/youtube/user/${match[1]}`;
    match = pathname.match(/^\/channel\/([\w-]+)/);
    if (match && match[1]) return `${RSSHUB_INSTANCE_URL}/youtube/channel/${match[1]}`;
    match = pathname.match(/^\/user\/([\w-]+)/);
    if (match && match[1]) return `${RSSHUB_INSTANCE_URL}/youtube/user/@${match[1]}`;
    if (pathname === '/playlist' && urlObject.searchParams.has('list')) return `${RSSHUB_INSTANCE_URL}/youtube/playlist/${urlObject.searchParams.get('list')}`;
    return null;
}
function handleTwitterUrl(urlObject) {
    const match = urlObject.pathname.match(/^\/([\w_]{1,15})(?:\/|$)/);
    if (match && match[1]) {
        const username = match[1];
        const systemPaths = ['home', 'explore', 'notifications', 'messages', 'search', 'i', 'settings', 'tos', 'privacy', 'intent', 'who_to_follow', 'connect_people', 'communities', 'jobs', 'compose', 'bookmarks'];
        if (!systemPaths.includes(username.toLowerCase()) && username.toLowerCase() !== 'hashtag' && username.toLowerCase() !== 'lists') {
            return `${RSSHUB_INSTANCE_URL}/twitter/user/${username}`;
        }
    }
    return null;
}
function handleInstagramUrl(urlObject) {
    const match = urlObject.pathname.match(/^\/([\w.]+)\/?(?:p\/|reels\/|stories\/)?/);
    if (match && match[1]) {
        const username = match[1];
        const systemPaths = ['explore', 'accounts', 'direct', 'reels', 'p', 'stories', 'guides', 'igtv'];
        if (!systemPaths.includes(username.toLowerCase()) && !username.includes('/') && username !== 'www') {
            return `${RSSHUB_INSTANCE_URL}/instagram/user/${username}`;
        }
    }
    return null;
}
function handleTiktokUrl(urlObject) {
    const match = urlObject.pathname.match(/^\/(@[\w.-]+)/);
    if (match && match[1]) return `${RSSHUB_INSTANCE_URL}/tiktok/user/${match[1].substring(1)}`;
    return null;
}
function handleBlueskyUrl(urlObject) {
    let match = urlObject.pathname.match(/^\/profile\/([\w.-]+)\/feed\/([\w:]+)/);
    if (match && match[1] && match[2]) return `${RSSHUB_INSTANCE_URL}/bsky/profile/${match[1]}/feed/${match[2]}`;
    match = urlObject.pathname.match(/^\/profile\/([\w.-]+)/);
    if (match && match[1]) return `${RSSHUB_INSTANCE_URL}/bsky/profile/${match[1]}`;
    return null;
}
function handleWeiboUrl(urlObject) {
    let match = urlObject.pathname.match(/^\/u\/(\d+)/);
    if (match && match[1]) return `${RSSHUB_INSTANCE_URL}/weibo/user/${match[1]}`;
    match = urlObject.pathname.match(/^\/n\/([\S]+)/);
    if (match && match[1]) return `${RSSHUB_INSTANCE_URL}/weibo/user/${match[1]}`;
    match = urlObject.pathname.match(/^\/(\d+)$/);
    if (match && match[1] && urlObject.pathname.split('/').filter(p => p).length === 1) return `${RSSHUB_INSTANCE_URL}/weibo/user/${match[1]}`;
    return null;
}
function handleBilibiliUrl(urlObject) {
    let uid;
    if (urlObject.hostname === 'space.bilibili.com') {
        const matchSpace = urlObject.pathname.match(/^\/(\d+)/);
        if (matchSpace && matchSpace[1]) uid = matchSpace[1];
    } else if (urlObject.hostname === 'www.bilibili.com' || urlObject.hostname === 'bilibili.com') {
        const matchWwwUser = urlObject.pathname.match(/^\/(?:space\/)?(\d+)(?:\/(?:dynamic|video|audio|article|favlist))?/);
        if (matchWwwUser && matchWwwUser[1]) uid = matchWwwUser[1];
    }
    if (uid) return `${RSSHUB_INSTANCE_URL}/bilibili/user/video/${uid}`;
    const matchBangumi = urlObject.pathname.match(/^\/(?:bangumi\/media\/md(\d+)|play\/ss(\d+))/);
    if (matchBangumi) {
        const mediaId = matchBangumi[1] || matchBangumi[2];
        if (mediaId) return `${RSSHUB_INSTANCE_URL}/bilibili/bangumi/media/${mediaId}`;
    }
    return null;
}
function handleZhihuUrl(urlObject) {
    let match = urlObject.pathname.match(/^\/people\/([\w-]+)/);
    if (match && match[1]) return `${RSSHUB_INSTANCE_URL}/zhihu/people/activities/${match[1]}`;
    match = urlObject.pathname.match(/^\/org\/([\w-]+)/);
    if (match && match[1]) return `${RSSHUB_INSTANCE_URL}/zhihu/posts/org/${match[1]}`;
    match = urlObject.pathname.match(/^\/column\/([\w.-]+)/);
    if (match && match[1]) return `${RSSHUB_INSTANCE_URL}/zhihu/zhuanlan/${match[1]}`;
    match = urlObject.pathname.match(/^\/question\/(\d+)/);
    if (match && match[1]) return `${RSSHUB_INSTANCE_URL}/zhihu/question/${match[1]}`;
    return null;
}
function handleThreadsUrl(urlObject) {
    const match = urlObject.pathname.match(/^\/(@[\w._]+)/);
    if (match && match[1]) return `${RSSHUB_INSTANCE_URL}/threads/${match[1].substring(1)}`;
    return null;
}

function attemptSocialMediaConversion(pageUrlString) {
    try {
        const urlObject = new URL(pageUrlString);
        const hostname = urlObject.hostname;
        for (const domainKey in socialMediaHandlers) {
            if (hostname.endsWith(domainKey) || hostname === domainKey) {
                const handler = socialMediaHandlers[domainKey];
                const rssHubUrl = handler(urlObject);
                if (rssHubUrl) {
                    return [{ title: `RSSHub: ${new URL(rssHubUrl).pathname.split('/')[1] || domainKey} (handled)`, url: rssHubUrl, type: 'rsshub-handled' }];
                }
            }
        }
    } catch (error) {
        console.warn("Popup (attemptSocialMediaConversion): Errore durante la conversione social:", error);
    }
    return [];
}

async function checkForRSSFeeds() {
    const detectedRssDiv = document.getElementById('detected-rss-outside');
    if (!detectedRssDiv) return;
    detectedRssDiv.innerHTML = '<p class="info">Searching for feeds on this page...</p>';
    let foundFeeds = [];

    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs && tabs.length > 0) {
            const tab = tabs[0];
            if (tab.url && tab.url.startsWith('http')) {
                let standardFeedsFromPage = [];
                try {
                    const injectionResults = await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: () => {
                            return Array.from(document.querySelectorAll('link[rel="alternate"][type="application/rss+xml"], link[rel="alternate"][type="application/atom+xml"]'))
                                .map(link => {
                                    try { return { title: link.title || document.title || 'Untitled Feed', url: new URL(link.href, document.baseURI || document.URL).href }; }
                                    catch (e) { return null; }
                                }).filter(feed => feed !== null);
                        }
                    });
                    if (injectionResults && injectionResults[0] && injectionResults[0].result) {
                        standardFeedsFromPage = injectionResults[0].result;
                    }
                } catch (e) { console.warn("Error executing script for standard RSS feeds:", e.message); }

                if (standardFeedsFromPage && standardFeedsFromPage.length > 0) {
                    foundFeeds = standardFeedsFromPage.map(feed => ({ title: feed.title || tab.title, url: feed.url, type: 'standard' }));
                }

                let socialRssHubFeeds = attemptSocialMediaConversion(tab.url);
                if (socialRssHubFeeds.length > 0) {
                    foundFeeds = foundFeeds.concat(socialRssHubFeeds);
                } else {
                    const radarFeeds = await findRSSHubFeedsForUrl(tab.url);
                    foundFeeds = foundFeeds.concat(radarFeeds);
                }
            } else {
                 detectedRssDiv.innerHTML = '<p class="info">Automatic RSS detection not available for this page type.</p>'; return;
            }
        } else {
            detectedRssDiv.innerHTML = '<p class="info">No active tab for RSS detection.</p>'; return;
        }
    } catch (error) {
        console.warn("Error searching for RSS feeds:", error);
        detectedRssDiv.innerHTML = `<p class="info error-text">Error searching for feeds: ${escapeHtml(error.message)}</p>`; return;
    }

    const uniqueFeedsMap = new Map();
    foundFeeds.forEach(feed => { if (feed.url && !uniqueFeedsMap.has(feed.url)) uniqueFeedsMap.set(feed.url, feed); });
    const uniqueFeeds = Array.from(uniqueFeedsMap.values());

    if (uniqueFeeds.length > 0) {
        detectedRssDiv.innerHTML = uniqueFeeds.map(feed => {
            const isSubscribed = !!currentSubscriptions[feed.url];
            const isNewToSubscribe = !isSubscribed;
            return `
            <div class="rss-feed-item ${isNewToSubscribe ? 'new-to-subscribe' : ''}">
                <span title="${escapeHtml(feed.title)} (${escapeHtml(feed.url)})">
                    ${(feed.type === 'rsshub' || feed.type === 'rsshub-handled') ? '<i class="fas fa-cogs rsshub-icon" title="RSSHub Feed"></i> ' : ''}
                    ${escapeHtml(feed.title)}
                    ${isNewToSubscribe ? '<span class="new-feed-tag">NEW</span>' : ''}
                </span>
                <button class="subscribe-btn" data-feed-url="${escapeHtml(feed.url)}" data-feed-title="${escapeHtml(feed.title)}" ${isSubscribed ? 'disabled' : ''}>
                    ${isSubscribed ? 'Subscribed' : 'Subscribe'}
                </button>
            </div>`;
        }).join('');

        detectedRssDiv.querySelectorAll('.subscribe-btn').forEach(button => {
            if (!button.disabled) {
                button.addEventListener('click', (e) => {
                    const url = e.target.dataset.feedUrl;
                    const title = e.target.dataset.feedTitle;
                    subscribeTo(url, title, button);
                });
            }
        });
    } else {
        detectedRssDiv.innerHTML = '<p class="info">No RSS feeds detected for this page.</p>';
    }

    try {
        chrome.runtime.sendMessage({ command: "pageFeedsStatusUpdate", detectedFeeds: uniqueFeeds.map(f => ({ url: f.url, title: f.title })) });
    } catch(e) { /* Ignore */ }
}

async function handleManualFeedSubscription(pageUrl) {
    const addCustomFeedBtn = document.getElementById('add-custom-feed');
    const customFeedUrlInput = document.getElementById('custom-feed-url');
    const originalButtonText = addCustomFeedBtn.textContent;
    addCustomFeedBtn.disabled = true;
    addCustomFeedBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';

    try {
        if (!pageUrl.startsWith('http://') && !pageUrl.startsWith('https://')) throw new Error("Invalid URL. Must start with http:// or https://");
        new URL(pageUrl);

        const socialRssHubFeeds = attemptSocialMediaConversion(pageUrl);
        if (socialRssHubFeeds.length > 0) {
            const hubFeed = socialRssHubFeeds[0];
            showToastNotification(`Found via custom handler: ${hubFeed.title.substring(0,30)}...`, 'info', 1500);
            await subscribeTo(hubFeed.url, hubFeed.title);
            if(customFeedUrlInput) customFeedUrlInput.value = '';
            return;
        }

        let isDirectFeed = false;
        let feedTitleFromDirectCheck = new URL(pageUrl).hostname;
        try {
            showToastNotification(`Validating as direct feed: ${pageUrl.substring(0, 30)}...`, 'info', 1500);
            const response = await fetch(pageUrl, { mode: 'cors', signal: AbortSignal.timeout(10000) });
            if (response.ok) {
                const contentType = response.headers.get('content-type');
                if (contentType && (contentType.includes('application/rss+xml') || contentType.includes('application/atom+xml') || contentType.includes('xml'))) {
                    isDirectFeed = true;
                } else {
                    const text = await response.text();
                    const parser = new DOMParser();
                    const xmlDoc = parser.parseFromString(text.substring(0, 50000), "text/xml");
                    const errorNode = xmlDoc.querySelector('parsererror');
                    if (!errorNode && (xmlDoc.documentElement.nodeName.toLowerCase() === 'rss' || xmlDoc.documentElement.nodeName.toLowerCase() === 'feed')) {
                        isDirectFeed = true;
                        feedTitleFromDirectCheck = xmlDoc.querySelector('channel > title, feed > title')?.textContent?.trim() || feedTitleFromDirectCheck;
                    }
                }
            }
        } catch (e) { console.warn("Popup (handleManualFeedSubscription): Direct feed check failed:", e.message); }

        if (isDirectFeed) {
            showToastNotification(`Subscribing to direct feed...`, 'info', 1500);
            await subscribeTo(pageUrl, feedTitleFromDirectCheck);
            if(customFeedUrlInput) customFeedUrlInput.value = '';
            return;
        }

        showToastNotification(`Trying RSSHub Radar for ${pageUrl.substring(0,30)}...`, 'info', 2000);
        const rssHubFeedsFromRadar = await findRSSHubFeedsForUrl(pageUrl);

        if (rssHubFeedsFromRadar && rssHubFeedsFromRadar.length > 0) {
            const hubFeed = rssHubFeedsFromRadar[0];
            if (!hubFeed.url || !hubFeed.url.startsWith('https://')) throw new Error(`RSSHub Radar returned an invalid URL: ${hubFeed.url}`);
            showToastNotification(`Found via RSSHub Radar: ${hubFeed.title.substring(0,30)}...`, 'info', 1500);
            await subscribeTo(hubFeed.url, hubFeed.title);
            if(customFeedUrlInput) customFeedUrlInput.value = '';
            return;
        }

        throw new Error("Could not find or generate an RSS feed for this URL.");

    } catch (error) {
        console.error("Popup (handleManualFeedSubscription) error:", error);
        showToastNotification(`Error: ${error.message}`, 'error', 4000);
    } finally {
        addCustomFeedBtn.disabled = false;
        addCustomFeedBtn.textContent = originalButtonText;
    }
}

function subscribeTo(feedUrl, feedTitle = '', buttonElement = null) {
    if (!feedUrl || !(feedUrl.startsWith('http://') || feedUrl.startsWith('https://'))) {
        showToastNotification("Invalid or non-HTTP(S) Feed URL.", 'error', 3000);
        return;
    }
    if (buttonElement) {
        buttonElement.disabled = true;
        buttonElement.textContent = '...';
    }

    const titleToSave = feedTitle || new URL(feedUrl).hostname;

    chrome.runtime.sendMessage({ command: 'subscribeToFeed', payload: { url: feedUrl, title: titleToSave } }, (response) => {
        if (response && response.success) {
            showToastNotification(`Subscribed to: ${titleToSave.substring(0,30)}...`, 'info', 2000);
            if (buttonElement) {
                buttonElement.textContent = 'Subscribed';
                const parentItem = buttonElement.closest('.rss-feed-item');
                if (parentItem) {
                    parentItem.classList.remove('new-to-subscribe');
                    const newTag = parentItem.querySelector('.new-feed-tag');
                    if (newTag) newTag.remove();
                }
            }
            // Aggiorna lo stato locale delle sottoscrizioni
            currentSubscriptions[feedUrl] = { title: titleToSave };
        } else {
            const errorMsg = response ? response.error.message : "Unknown error";
            showToastNotification(`Subscription error: ${errorMsg}`, 'error', 3000);
            if (buttonElement) {
                buttonElement.disabled = false;
                buttonElement.textContent = 'Subscribe';
            }
        }
    });
}

async function getRadarRules() {
    const result = await chrome.storage.local.get([RSSHUB_RADAR_RULES_KEY, RSSHUB_RADAR_RULES_TIMESTAMP_KEY]);
    if (result[RSSHUB_RADAR_RULES_KEY] && result[RSSHUB_RADAR_RULES_TIMESTAMP_KEY] && (Date.now() - result[RSSHUB_RADAR_RULES_TIMESTAMP_KEY] < (24 * 60 * 60 * 1000))) {
        return result[RSSHUB_RADAR_RULES_KEY];
    } else {
        try {
            const response = await fetch(RSSHUB_RULES_SOURCE_URL, { cache: "no-store" });
            if (!response.ok) throw new Error(`HTTP error fetching rules! Status: ${response.status}`);
            let rulesText = await response.text();
            rulesText = rulesText.replace(/^export\s+default\s*/, '').replace(/;\s*$/, '');
            const rules = (new Function(`return ${rulesText}`))();
            if (rules && typeof rules === 'object' && Object.keys(rules).length > 0) {
                await chrome.storage.local.set({ [RSSHUB_RADAR_RULES_KEY]: rules, [RSSHUB_RADAR_RULES_TIMESTAMP_KEY]: Date.now() });
                return rules;
            } else {
                console.error("Popup (getRadarRules): Formato regole RSSHub Radar non valido o vuoto.");
                return null;
            }
        } catch (error) {
            console.error('Popup (getRadarRules): Errore fetch/processamento regole RSSHub Radar:', error);
            return null;
        }
    }
}

async function findRSSHubFeedsForUrl(pageUrlString) {
    if (!pageUrlString || !(pageUrlString.startsWith('http://') || pageUrlString.startsWith('https://'))) return [];
    const allRules = await getRadarRules();
    if (!allRules) {
        console.warn("Popup (findRSSHubFeedsForUrl - RADAR): Impossibile caricare le regole RSSHub Radar globali.");
        return [];
    }
    let pageUrlObject;
    try { pageUrlObject = new URL(pageUrlString); }
    catch (e) { console.warn("Popup (findRSSHubFeedsForUrl - RADAR): Impossibile creare oggetto URL da:", pageUrlString, e); return []; }

    const originalHostname = pageUrlObject.hostname;
    const domainWithoutWww = originalHostname.replace(/^www\./, '');
    let domainRules = allRules[domainWithoutWww] || allRules[originalHostname];

    if (!domainRules) {
        const domainParts = domainWithoutWww.split('.');
        for (let i = 0; i < domainParts.length - 1; i++) {
            const higherLevelDomain = domainParts.slice(i).join('.');
            if (allRules[higherLevelDomain]) { domainRules = allRules[higherLevelDomain]; break; }
        }
    }
    if (!domainRules) return [];

    const feeds = [];
    const fullPathForMatch = pageUrlObject.pathname + pageUrlObject.search + pageUrlObject.hash;

    for (const ruleKey in domainRules) {
        const ruleDefinitions = Array.isArray(domainRules[ruleKey]) ? domainRules[ruleKey] : [domainRules[ruleKey]];
        for (const rule of ruleDefinitions) {
            if (!rule || !rule.target || !rule.source) continue;
            const ruleSources = Array.isArray(rule.source) ? rule.source : [String(rule.source)];
            for (const singleRuleSource of ruleSources) {
                let tempFeedPath = typeof rule.target === 'function' ? rule.target({}) : (typeof rule.target === 'string' ? rule.target : null);
                if (!tempFeedPath) continue;

                const paramRegex = /:(\w+)(\??)/g;
                let regexMatchResult;
                const paramsInRuleSource = [];
                let lastIndex = 0;
                const sourceParts = [];
                paramRegex.lastIndex = 0;
                while ((regexMatchResult = paramRegex.exec(singleRuleSource)) !== null) {
                    sourceParts.push(singleRuleSource.substring(lastIndex, regexMatchResult.index).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                    paramsInRuleSource.push({ name: regexMatchResult[1], optional: regexMatchResult[2] === '?' });
                    sourceParts.push(regexMatchResult[2] === '?' ? '([^/?#]*)' : '([^/?#]+)');
                    lastIndex = paramRegex.lastIndex;
                }
                sourceParts.push(singleRuleSource.substring(lastIndex).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                let currentRegexStringForMatch = sourceParts.join('');
                currentRegexStringForMatch = currentRegexStringForMatch.replace(/\\\/\*$/, '(?:\\/.*)?');

                let ruleMatched = false; const paramValues = {};
                let finalRegexStr = "";
                try {
                    finalRegexStr = (singleRuleSource.startsWith('/') ? '^' : '^\\/') + currentRegexStringForMatch + '$';
                    if (currentRegexStringForMatch === "\\*") finalRegexStr = "^.*$";
                    else if (singleRuleSource === "" && rule.target) {
                         finalRegexStr = "^[/]?$";
                         if (fullPathForMatch === "" || fullPathForMatch === "/") ruleMatched = true;
                    }
                    if (!ruleMatched) {
                        const ruleRegex = new RegExp(finalRegexStr, 'i');
                        const urlPathMatch = fullPathForMatch.match(ruleRegex);
                        if (urlPathMatch) {
                            paramsInRuleSource.forEach((p, i) => { if (urlPathMatch[i + 1] !== undefined) paramValues[p.name] = decodeURIComponent(urlPathMatch[i + 1]); });
                            ruleMatched = true;
                        }
                    }
                } catch (e) { console.warn("Popup (findRSSHubFeedsForUrl - RADAR): Regex error:", singleRuleSource, "Regex:",finalRegexStr, e); continue; }

                if (ruleMatched) {
                    if (typeof rule.target === 'function') {
                        try { tempFeedPath = rule.target(paramValues, pageUrlObject, singleRuleSource); }
                        catch (e) { console.warn("Popup (findRSSHubFeedsForUrl - RADAR): Errore funzione target:", rule.title, e); continue; }
                    } else {
                        Object.keys(paramValues).forEach(paramName => { if (paramValues[paramName] !== undefined) tempFeedPath = tempFeedPath.replace(new RegExp(`:${paramName}\\??`, 'g'), paramValues[paramName]); });
                    }
                    tempFeedPath = tempFeedPath.replace(/:\w+\??/g, '').replace(/\/$/, '');
                    if (tempFeedPath && !tempFeedPath.includes(':')) {
                        const finalFeedUrl = `${RSSHUB_INSTANCE_URL}${tempFeedPath.startsWith('/') ? '' : '/'}${tempFeedPath}`;
                        if (finalFeedUrl.startsWith('https://') && !feeds.some(f => f.url === finalFeedUrl)) {
                            feeds.push({ title: rule.title || `RSSHub Radar: ${ruleKey}`, url: finalFeedUrl, type: 'rsshub' });
                        }
                    }
                }
            }
        }
    }
    return feeds;
}

// --- Inizializzazione del Popup ---
document.addEventListener('DOMContentLoaded', () => {
    const openAuthPageBtn = document.getElementById('open-auth-page-btn');
    if (openAuthPageBtn) {
        openAuthPageBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('auth.html') });
            window.close();
        });
    }

    console.log("POPUP DEBUG 1: DOMContentLoaded, sto per inviare il messaggio.");
    
    // 1. Chiedi al background lo stato di autenticazione e le sottoscrizioni
    chrome.runtime.sendMessage({ command: 'getInitialData' }, (response) => {
        // Rimuoviamo i log di debug o li commentiamo
        // console.log("POPUP DEBUG 2: Callback di sendMessage eseguita.");

        if (chrome.runtime.lastError) {
            console.error("POPUP ERRORE DI CONNESSIONE:", chrome.runtime.lastError.message);
            document.body.innerHTML = "<p style='color:red; padding: 20px;'>Error: Connection to background service failed. Please reload the extension.</p>";
            return;
        }

        // console.log("POPUP DEBUG 4: Risposta ricevuta dal background:", response); // Mantenuto per vedere la risposta completa

        if (response && response.success) {
            // La richiesta è andata a buon fine, ora controlliamo i dati
            const { isLoggedIn, user, subscriptions } = response.data;
            
            currentUser = user;
            currentSubscriptions = subscriptions || {};
            
            // Inizializziamo l'UI con lo stato corretto
            initializePopup(isLoggedIn); 
        } else {
            // Questo blocco ora gestisce solo errori imprevisti dal background
            console.error("POPUP ERRORE LOGICO:", response?.error);
            document.body.innerHTML = "<p style='color:red; padding: 20px;'>Error: Failed to load initial data from background.</p>";
        }
    });

    console.log("POPUP DEBUG 6: Messaggio inviato (l'esecuzione continua).");

    chrome.runtime.connect({name: "readerPopupChannel"});
});
