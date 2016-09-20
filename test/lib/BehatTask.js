'use strict';

var _ = require('underscore'),
    assert = require('chai').assert,
    spy = require('sinon').spy,
    stub = require('sinon').stub,
    BehatTask = require('../../tasks/lib/BehatTask'),
    FeatureTask = require('../../tasks/lib/FeatureTask');

suite('Behat Test', function () {
    var task,
        log,
        featureTask,
        featureSpy,
        mockExecutor,
        defaults = {
            done: function () {},
            files: ['awesome.feature', 'brilliant.feature'],
            bin: 'behat',
            flags: '',
            maxProcesses: 10000,
        };

    setup(function () {
        log = spy();
        task = makeTask();
    });

    function makeTask (options) {
        var task;
        options = options || {};

        mockExecutor = {
            callbacks: {},
            addTask: spy(),
            start: function () {},
            on: function (event, callback) {
                this.callbacks[event] = callback;
            }
        };

        task = new BehatTask(_.defaults(options, defaults, {
            executor: mockExecutor,
            FeatureTask: function (filename) { return { filename: filename, id: 'ffsdf', klass: 'FeatureTask'}; },
            log: log
        }));

        return task;
    }

    function makeFeatureSpy (filename, methods, status) {
        var featureSpy = new FeatureTask();
        featureSpy.filename = filename;
        featureSpy.id = 'feature_spy';
        featureSpy.descriptor = '[feature_spy] ' + filename;
        _.each(methods, function (m) {
            stub(featureSpy, m);
        });
        if (status) {
            stub(featureSpy, 'getStatus', function () { return status; });
        }
        stub(task, 'getFeatureFromCommand', function () { return featureSpy; });
        return featureSpy;
    }

    test('adds tasks and starts the executor', function () {
        mockExecutor.start = spy();
        task.run();

        assert.equal(mockExecutor.addTask.callCount, 2);
        assert.equal(mockExecutor.addTask.args[0][0], 'behat   awesome.feature');
        assert.equal(mockExecutor.addTask.args[1][0], 'behat   brilliant.feature');
        assert.equal(mockExecutor.start.callCount, 1);
    });

    test('tasks should be FeatureTasks', function () {
        task.run();

        var awesome = task.getFeature('awesome.feature'),
            brilliant = task.getFeature('brilliant.feature');
        assert.equal(awesome.klass, 'FeatureTask', 'created a FeatureTask');
        assert.equal(brilliant.klass, 'FeatureTask', 'created a FeatureTask');
    });

    test('registers listeners for tasks started and completed', function () {
        mockExecutor.on = spy();
        task.run();

        assert.equal(mockExecutor.on.callCount, 3);
        assert.equal(mockExecutor.on.args[0][0], 'startedTask');
        assert.equal(mockExecutor.on.args[1][0], 'finishedTask');
        assert.equal(mockExecutor.on.args[2][0], 'finished');
    });

    test('provides user feedback (success)', function () {
        stub(mockExecutor, 'start', function () {
            mockExecutor.callbacks.startedTask.call(task, 'behat   awesome.feature');
            mockExecutor.callbacks.finishedTask.call(task, 'behat   awesome.feature', void 0, '3 scenarios (3 passed)\n\n5m15s\n');
            mockExecutor.callbacks.finished();
        });

        mockExecutor.isFinished = stub().returns(true);
        featureSpy = makeFeatureSpy('awesome.feature', ['start', 'succeeded', 'requeue']);
        task.run();

        assert.equal(log.callCount, 4, 'log call count');
        assert.equal(log.args[0][0], 'Found 2 feature file(s). Running 10000 at a time.');
        assert.equal(log.args[1][0], 'Started: [feature_spy] behat   awesome.feature');
        assert.equal(log.args[2][0], 'Completed: [feature_spy] awesome.feature - 3 scenarios (3 passed) in 5m15s');
        assert(log.args[3][0].indexOf('Finished in') > -1);
        assert.equal(featureSpy.start.callCount, 1, 'start() should have been called');
        assert.equal(featureSpy.succeeded.callCount, 1, 'succeeded() should have been called');
        assert.deepEqual(featureSpy.succeeded.args[0][0], { passed: 3, total: 3 }, 'succeeded() gets the scenario results');
        assert.equal(featureSpy.requeue.callCount, 0, 'requeue() should NOT have been called');
    });

    test('handles pending success case', function () {
        stub(mockExecutor, 'start', function () {
            mockExecutor.callbacks.finishedTask.call(task, 'behat   awesome.feature', void 0, '3 scenarios (2 passed, 1 pending)\n\n5m15s\n');
        });

        mockExecutor.isFinished = stub().returns(false);
        featureSpy = makeFeatureSpy('awesome.feature', ['failed', 'requeue']);
        task.run();

        assert.equal(log.callCount, 2, 'log call count');
        assert.equal(mockExecutor.addTask.callCount, 2);
        assert.equal(log.args[1][0], 'Completed: [feature_spy] awesome.feature - 3 scenarios (2 passed, 1 pending) in 5m15s');
        assert.equal(featureSpy.failed.callCount, 1, 'failed() should have been called');
        assert.deepEqual(featureSpy.failed.args[0][0], { passed: 2, pending: 1, total: 3 }, 'failed() gets the scenario results');
        assert.equal(featureSpy.requeue.callCount, 0, 'requeue() should have been called');
    });

    test('handles selenium timeouts', function () {
        stub(mockExecutor, 'start', function () {
            mockExecutor.callbacks.finishedTask.call(task, 'behat   awesome.feature', {code: 13}, '');
        });

        mockExecutor.isFinished = stub().returns(false);
        featureSpy = makeFeatureSpy('awesome.feature', ['seleniumTimeout', 'requeue'], 'seleniumTimeout');
        featureSpy.waitTimeouts = 1;
        task.run();

        assert.equal(log.callCount, 2, 'log call count');
        assert.equal(mockExecutor.addTask.callCount, 3);
        assert.equal(log.args[1][0], 'Selenium timeout: [feature_spy] awesome.feature - adding to the back of the queue.');
        assert.equal(featureSpy.seleniumTimeout.callCount, 1, 'seleniumTimeout() should have been called');
        assert.equal(featureSpy.requeue.callCount, 0, 'requeue() should NOT have been called');
    });

    test('handles 255 errors', function () {
        stub(mockExecutor, 'start', function () {
            mockExecutor.callbacks.finishedTask.call(task, 'behat   awesome.feature', {code: 255}, '');
        });

        mockExecutor.isFinished = stub().returns(false);
        featureSpy = makeFeatureSpy('awesome.feature', ['curlError', 'requeue'], 'curlError');
        featureSpy.waitTimeouts = 1;
        task.run();

        assert.equal(log.callCount, 2, 'log call count');
        assert.equal(mockExecutor.addTask.callCount, 3);
        assert.match(log.args[1][0], /Curl Error 255/);
        assert.equal(featureSpy.curlError.callCount, 1, 'curlError() should have been called');
        assert.equal(featureSpy.requeue.callCount, 0, 'requeue() should NOT have been called');
    });

    test('handles per-feature timeouts', function () {
        stub(mockExecutor, 'start', function () {
            mockExecutor.callbacks.finishedTask.call(task, 'behat   awesome.feature', {killed: true}, '');
        });

        mockExecutor.isFinished = stub().returns(false);
        featureSpy = makeFeatureSpy('awesome.feature', ['forceKillTimeout', 'requeue'], 'forceKillTimeout');
        task.run();

        assert.equal(log.callCount, 2, 'log call count');
        assert.equal(mockExecutor.addTask.callCount, 2);
        assert.equal(log.args[1][0], 'Killed (timeout): [feature_spy] awesome.feature - adding to the back of the queue.');
        assert.equal(featureSpy.forceKillTimeout.callCount, 1, 'forceKillTimeout() should have been called');
    });

    test('handles failed tests', function () {
        stub(mockExecutor, 'start', function () {
            mockExecutor.callbacks.finishedTask.call(task, 'behat   awesome.feature', {code: 1}, '3 scenarios (1 passed, 2 failed)\n\n5m15s\n');
        });

        mockExecutor.isFinished = stub().returns(false);
        featureSpy = makeFeatureSpy('awesome.feature', ['failed', 'requeue']);
        task.run();

        assert.equal(log.callCount, 2, 'log call count');
        assert.equal(log.args[1][0], 'Failed: [feature_spy] awesome.feature - 3 scenarios (1 passed, 2 failed) in 5m15s');
        assert.equal(featureSpy.failed.callCount, 1, 'failed() should have been called');
        assert.deepEqual(featureSpy.failed.args[0][0], { passed: 1, failed: 2, total: 3 }, 'failed() gets the scenario results');
        assert.equal(featureSpy.requeue.callCount, 0, 'requeue() should have NOT been called');
    });

    test('handles unknown errors', function () {
        stub(mockExecutor, 'start', function () {
            mockExecutor.callbacks.finishedTask.call(task, 'behat   awesome.feature', {code: 1000000}, 'ZOMG! I\'m dead!!');
        });

        mockExecutor.isFinished = stub().returns(false);
        featureSpy = makeFeatureSpy('awesome.feature', ['unknown', 'requeue']);

        task.run();

        assert.equal(log.callCount, 2, 'log call count');
        assert.equal(log.args[1][0], 'Error: [feature_spy] awesome.feature - [object Object]ZOMG! I\'m dead!!');
        assert.equal(featureSpy.unknown.callCount, 1, 'unknown() should have been called');
        assert.equal(featureSpy.requeue.callCount, 0, 'requeue() should have NOT been called');
    });

    test('adds failed tasks back to the queue if numRetries is specified', function () {
        task = makeTask({
            numRetries: 2,
        });
        featureSpy = makeFeatureSpy('awesome.feature', ['failed', 'requeue'], 'failed');
        mockExecutor.isFinished = stub().returns(false);
        stub(mockExecutor, 'start', function () {
            mockExecutor.callbacks.finishedTask.call(task, 'behat   awesome.feature', {code: 1}, '2 scenarios (1 passed, 1 failed)\n\n5m15s\n');
        });

        task.run();

        assert.equal(log.callCount, 3, 'log call count');
        assert.equal(log.args[1][0], 'Failed: [feature_spy] awesome.feature - 2 scenarios (1 passed, 1 failed) in 5m15s');
        assert.equal(log.args[2][0], 'Retrying: [feature_spy] awesome.feature 1 of 2 time(s)');
        assert.equal(mockExecutor.addTask.callCount, 3);
        assert.equal(featureSpy.failed.callCount, 1, 'failed() should have been called');
        assert.deepEqual(featureSpy.failed.args[0][0], { passed: 1, failed: 1, total: 2 }, 'failed() gets the scenario results');
        assert.equal(featureSpy.requeue.callCount, 1, 'requeue() should have been called');
    });

    test('adds pending tasks back to the queue if numRetries is specified', function () {
        task = makeTask({
            numRetries: 2,
        });
        featureSpy = makeFeatureSpy('awesome.feature', ['failed', 'requeue'], 'failed');

        stub(mockExecutor, 'start', function () {
            mockExecutor.callbacks.finishedTask.call(task, 'behat   awesome.feature', {code: 1}, '3 scenarios (1 passed, 2 pending)\n\n5m15s\n');
        });

        task.run();

        assert.equal(log.callCount, 3, 'log call count');
        assert.equal(log.args[1][0], 'Failed: [feature_spy] awesome.feature - 3 scenarios (1 passed, 2 pending) in 5m15s');
        assert.equal(log.args[2][0], 'Retrying: [feature_spy] awesome.feature 1 of 2 time(s)');
        assert.equal(mockExecutor.addTask.callCount, 3);
        assert.equal(featureSpy.failed.callCount, 1, 'failed() should have been called');
        assert.deepEqual(featureSpy.failed.args[0][0], { passed: 1, pending: 2, total: 3 }, 'failed() gets the scenario results');
        assert.equal(featureSpy.requeue.callCount, 1, 'requeue() should have been called');
    });

});