'use strict';

var assert = require('chai').assert,
    spy = require('sinon').spy,
    stub = require('sinon').stub,
    FeatureTask = require('../../tasks/lib/FeatureTask');

suite('Feature Test', function () {
    var task;

    setup(function () {
        task = new FeatureTask('awesome.feature');
        task.start();
    });

    test('#constructor()', function () {
        task = new FeatureTask('awesome.feature');
        assert.equal(task.filename, 'awesome.feature', 'has correct filename');
        assert.isArray(task.results, 'has results array');
        assert.lengthOf(task.results, 0, 'results is empty');
        assert.isFalse(task.ok, 'is not ok');
        assert.equal(0, task.retries);
    });

    test('#start()', function () {
        assert.lengthOf(task.results, 1, 'results has an element');
        assert.isNumber(task.results[0].start, 'first result has a start time');
        assert.isUndefined(task.results[0].end, 'new result has no end time');
    });

    test('#start() twice', function () {
        task.start();
        assert.lengthOf(task.results, 2, 'adds another result');
        assert.isNumber(task.results[1].start, 'new result has a start time');
        assert.isTrue(task.results[1].start >= task.results[0].start, 'newer result has a newer start');
        assert.isUndefined(task.results[1].end, 'new result has no end time');
    });

    test('#setCompletion()', function () {
        task.setCompletion('awesome');
        assert.equal(task.results[0].status, 'awesome', 'status set on new result');
        assert.isNumber(task.results[0].end, 'latest result has a end time');
    });

    test('#setCompletion(result)', function () {
        var result = {
            status: 'whatever'
        };
        task.setCompletion('awesome', result);
        assert.equal(task.results[0].status, 'awesome', 'status set on new result');
        assert.isNumber(task.results[0].end, 'latest result has a end time');
        assert.equal(task.results[0].result, result, 'result set on new result');
    });

    test('#setCompletion() twice', function () {
        task.setCompletion('awesome');
        task.start();
        task.setCompletion('awesomer');

        assert.equal(task.results[0].status, 'awesome', 'status set on new result');
        assert.isNumber(task.results[0].end, 'latest result has a end time');
        assert.equal(task.results[1].status, 'awesomer', 'status set on new result');
        assert.isNumber(task.results[1].end, 'latest result has a end time');
    });

    test('#seleniumTimeout()', function () {
        task.setCompletion = spy();
        task.seleniumTimeout();
        assert.equal(task.setCompletion.callCount, 1);
        assert.isTrue(task.setCompletion.calledWith('seleniumTimeout'));
    });

    test('#forceKillTimeout()', function () {
        task.setCompletion = spy();
        task.forceKillTimeout();
        assert.equal(task.setCompletion.callCount, 1);
        assert.isTrue(task.setCompletion.calledWith('forceKillTimeout'));
    });

    test('#failed()', function () {
        task.setCompletion = spy();
        task.failed();
        assert.equal(task.setCompletion.callCount, 1);
        assert.isTrue(task.setCompletion.calledWith('failed'));
    });

    test('#failed(result)', function () {
        var result = {
            passed: 1,
            failed: 2
        };
        task.setCompletion = spy();
        task.failed(result);
        assert.equal(task.setCompletion.callCount, 1);
        assert.isTrue(task.setCompletion.calledWith('failed', result));
    });

    test('#unknown()', function () {
        task.setCompletion = spy();
        task.unknown();
        assert.equal(task.setCompletion.callCount, 1);
        assert.isTrue(task.setCompletion.calledWith('unknown'));
    });

    test('#succeeded()', function () {
        task.setCompletion = spy();
        task.succeeded();
        assert.equal(task.setCompletion.callCount, 1);
        assert.isTrue(task.setCompletion.calledWith('succeeded'));
    });

    test('#succeeded(result)', function () {
        var result = {
            passed: 1
        };
        task.setCompletion = spy();
        task.succeeded(result);
        assert.equal(task.setCompletion.callCount, 1);
        assert.isTrue(task.setCompletion.calledWith('succeeded', result));
    });


    test('#requeue()', function () {
        task.requeue();
        assert.equal(task.retries, 1);

        task.requeue();
        assert.equal(task.retries, 2);
    });
});