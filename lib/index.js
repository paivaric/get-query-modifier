'use strict';
exports = module.exports = getQueryModifier;
/**
 * Manipulates an object representation of a querystring, extracting its
 * `mongoose` query operators and returning a function to attach them to a
 * `mongoose.Query` object.
 *
 * Note this function isn't pure and does delete the operators from the `query`
 * parameter after reading them.
 *
 * @param {Object} query The querystring representation to manipulate
 * @param {Object} [options] An options object
 * @param {Object} [options.defaults] An object with defaults for the valid
 *   operators
 * @param {Object} [options.ignore] An object with the properties corresponding
 *   to the ignored operators set to true
 * @param {Boolean} [options.deleteIgnored=false] Whether to delete the ignored
 *   operators from the `query` object
 * @param {Array.<String>} [options.allow] An array of operators to parse
 *   in addition to the plugin's default `VALID_OPERATORS`.
 * @return {Function} queryModifier The `mongoose.Query` modifier function,
 *   which attaches the operators to the search
 *
 * @example
 * ```javascript
 * var app = require('./app'); // some express app
 * var mongoose = require('mongoose');
 * var User = mongoose.model('User'); // some mongoose model
 *
 * app.get('/api/users', function(req, res) {
 *   var modifier = getQueryModifier(req.query);
 *   var query = modifier(User.find(req.query).lean());
 *
 *   query.exec(function(err, results) {
 *     // use the results...
 *   });
 * });
 * ```
 */


function getQueryModifier(query, options) {
  var operators = {};
  if(!query) return identity;
  if(!options) options = {};
  if(!options.ignore) options.ignore = {};
  if(!options.defaults) options.defaults = {};
  if(!options.allow) options.allow = [];

  var validOperators = VALID_OPERATORS.concat(options.allow);

  for(var i = 0, len = validOperators.length; i < len; i++) {
    var operator = validOperators[i];
    if(options.ignore[operator]) {
      if(options.deleteIgnored) delete query[operator];
      continue;
    }
    operators[operator] = query[operator];
    delete query[operator];

    if(operators[operator] == null && options.defaults[operator] != null) {
      operators[operator] = options.defaults[operator]
    }
  }

  return function queryModifier(query) {
    if(operators.$sort) {
      if(Array.isArray(operators.$sort)) {
        operators.$sort.forEach(function (s) {
          query = query.sort(s);
        });
      } else {
        query = query.sort(operators.$sort);
      }
    }
    if(operators.$skip) {
      query = query.skip(+operators.$skip);
    }
    if(operators.$page) {
      if(!operators.$limit) {
        operators.$limit = 20;
      }
      query = query.skip((+operators.$page) * (+operators.$limit));
    }
    if(operators.$limit) {
      query = query.limit((+operators.$limit));
    }
    if(operators.$select) {
      if(Array.isArray(operators.$select)) {
        operators.$select = operators.$select.join(' ');
      }
      query = query.select(operators.$select);
    }
    if(operators.$populate) {
      if(Array.isArray(operators.$populate)) {
        operators.$populate.forEach(function (p) {
          query = query.populate(p);
        });
      } else {
        query = query.populate(operators.$populate);
      }

    }

    // Support custom operators
    if(options.allow) {
      for(var i = 0, len = options.allow.length; i < len; i++) {
        var operator = options.allow[i];
        var value = operators[operator];
        if(!value) continue;

        var methodName = operator.slice(1);
        if(!query[methodName]) throw new Error('Invalid operator ' + operator);

        var ret = query[methodName](value);
        if(ret) query = ret;
      }
    }

    query.operators = operators;
    return query;
  };
}

function identity(x) {
  return x;
}

var VALID_OPERATORS = exports.VALID_OPERATORS = [
  '$limit',
  '$sort',
  '$page',
  '$skip',
  '$select',
  '$populate'
];

/**
 * A connect middleware for parsing and using mongodb query operators with
 * mongoose given an object representation of a query.
 *
 * @param {Object} [options] An options object which will simply be passed onto
 * `getQueryModifier(req.query, options)`
 * @return {Function} mdw The middleware function
 *
 * @example
 * ```javascript
 * var app = require('./app'); // some express app
 * app.use(getQueryModifier.middleware());
 * ```
 */

exports.middleware = function getQueryModifier$middleware(options) {
  return function(req, res, next) {
    req.modifier = getQueryModifier(req.query, options);
    next();
  };
};