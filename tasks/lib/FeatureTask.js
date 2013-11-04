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
	this.filename = filename;
	this.results = [];
	this.retries = 0;
	this.ok = false;

	/**
	 * task is started - set start time on new result
	 */
	this.start = function () {
		this.results.push({
			start: +new Date()
		});
	};

	/**
	 * set task completion status & time on latest result
	 *
	 * @param {String} status
	 */
	this.setCompletion = function (status) {
		var result = _.last(this.results);
		result.status = status;
		result.end = +new Date();
	};

	this.seleniumTimeout =function () {
		this.setCompletion('seleniumTimeout');
	};

	this.forceKillTimeout =function () {
		this.setCompletion('forceKillTimeout');
	};

	this.failed = function () {
		this.setCompletion('failed');
	};

	this.unknown = function () {
		this.setCompletion('unknown');
	};

	this.succeeded = function () {
		this.setCompletion('succeeded');
		this.ok = true;
	};

	this.requeue = function () {
		this.retries++;
	};
}

module.exports = FeatureTask;