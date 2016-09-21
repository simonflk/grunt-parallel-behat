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
    this.running = false;
    this.waitTimeouts = 0;
    this.curlErrors = 0;
}

_.extend(FeatureTask.prototype, {
    /**
     * task is started - set start time on new result
     */
    start: function () {
        this.results.push({
            start: +new Date()
        });
        this.running = true;
    },

    /**
     * set task completion status & time on latest result
     *
     * @param {String} status
     */
    setCompletion: function (status, result) {
        var thisResult = _.last(this.results);
        if (!thisResult) {
            throw 'Cannot set completion=' + status + ' on task that was not started';
        }
        thisResult.status = status;
        thisResult.scenarios = result;
        thisResult.duration = new Date() - thisResult.start;
        this.running = false;
    },

    /**
     * Gets the status of the most recent execution
     *
     * @return {String}
     */
    getStatus: function () {
        var thisResult = _.last(this.results);
        if (thisResult) {
            return thisResult.status;
        }
    },

    /**
     * Get the duration of the current executin in seconds
     *
     * @return {integer}
     */
    getCurrentDuration: function () {
        if (this.running) {
            return Math.round((+new Date() - _.last(this.results).start) / 1000);
        } else {
            return 0;
        }
    },

    /**
     * Returns true if all the results for this feature are either
     * 'forceKillTimeout' or 'unknown'
     *
     * @return {Boolean}
     */
    hasProblems: function () {
        var statuses = _.pluck(this.results, 'status'),
            problems = _.intersection(['forceKillTimeout', 'unknown'], statuses),
            featureIsBorked = statuses.length && statuses.length === problems.length;

        return !this.running && featureIsBorked;
    },

    seleniumTimeout: function () {
        this.running = false;
        this.results.pop();
        this.waitTimeouts++;
    },

    curlError: function () {
        this.running = false;
        this.results.pop();
        this.curlErrors++;
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
