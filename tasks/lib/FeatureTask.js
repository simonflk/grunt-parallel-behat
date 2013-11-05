'use strict';

var _ = require('underscore');

/**
 * Model for a behat feature file
 *
 * Example usage:
 *
 * var feature = new FeatureTask(file);
 *
 * @param {String} filename
 */
function FeatureTask (filename) {
	this.id = _.uniqueId('feature_');
	this.filename = filename;
	this.descriptor = '[' + this.id + '] ' + this.filename;
	this.results = [];
	this.retries = 0;
	this.ok = false;
}

_.extend(FeatureTask.prototype, {
	/**
	 * task is started - set start time on new result
	 */
	start: function () {
		this.results.push({
			start: +new Date()
		});
	},

	/**
	 * set task completion status & time on latest result
	 *
	 * @param {String} status
	 */
	setCompletion: function (status, result) {
		var thisResult = _.last(this.results);
		thisResult.status = status;
		thisResult.result = result;
		thisResult.end = +new Date();
	},

	seleniumTimeout: function () {
		this.setCompletion('seleniumTimeout');
	},

	forceKillTimeout: function () {
		this.setCompletion('forceKillTimeout');
	},

	failed: function (result) {
		this.setCompletion('failed', result);
	},

	unknown: function () {
		this.setCompletion('unknown');
	},

	succeeded: function (result) {
		this.setCompletion('succeeded', result);
		this.ok = true;
	},

	requeue: function () {
		this.retries++;
	}

});

module.exports = FeatureTask;