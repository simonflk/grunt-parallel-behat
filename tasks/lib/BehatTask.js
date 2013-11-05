'use strict';

var _ = require('underscore'),
    inspect = require('util').inspect;

/**
 * Run multiple behat feature files in parallel.
 *
 * Example usage:
 *
 * var behat = new BehatTask({
 *     files: ['feature1.feature', 'feature2.feature'],
 *     log: console.log,
 *     bin: 'behat',
 *     flags: '--tags @wip',
 *     executor: new ParallelExec(5),
 *     numRetries: 0
 * })
 *
 * @param {Object} options
 */
function BehatTask (options) {
    var tasks = {},
        failedTasks = {},
        startTime,
        FeatureTask = options.FeatureTask;

    /**
     * Create a behat command for each file and run it using the executor
     */
    function run() {
        startTime = +new Date();
        options.log('Found ' + options.files.length + ' feature file(s). Running ' + options.maxProcesses + ' at a time.');

        _.each(options.files, addTask);

        options.executor.on('startedTask', taskStarted);
        options.executor.on('finishedTask', taskFinished);
        options.executor.on('finished', finish);
        options.executor.start();
    }

    function fileToCommand(file) {
        var configOpt = options.config ? '-c ' + options.config : '',
            filePath = options.baseDir ? options.baseDir + file : file,
            cmd = [options.bin, configOpt, options.flags, filePath].join(' ');
        return cmd;
    }

    /**
     * Send an individual feature file to be run
     *
     * @param {String} file
     */
    function addTask (file) {
        var cmd = fileToCommand(file);
        tasks[cmd] = new FeatureTask(file);
        options.executor.addTask(cmd);
    }

    /**
     * Returns the FeatureTask for the given file
     *
     * @param {String} file
     * @return {FeatureTask}
     */
    function getFeature (file) {
        var cmd = fileToCommand(file);
        return tasks[cmd];
    }

    function getFeatureFromCommand(cmd) {
        return tasks[cmd];
    }

    /**
     * Tell the user we've started a new task
     *
     * @param  {string} task
     */
    function taskStarted (task) {
        options.log('Started: ' + task);
    }

    /**
     * Process the result of the task
     *
     * @param {string} task
     * @param {Object} err
     * @param {string} stdout
     * @param {string} stderr
     */
    function taskFinished (cmd, err, stdout, stderr) {
        var task = this.getFeatureFromCommand(cmd),
            file = task.filename,
            output = stdout ? stdout.split('\n') : [],
            testResults = parseTestResults(output[output.length - 4]);

        if (!err) {
            options.log('Completed: ' + file + ' - ' + output[output.length - 4] + ' in ' + output[output.length - 2]);

            if (testResults.pending) {
                taskPendingOrFailed(cmd, task, testResults);
            } else {
                task.succeeded(testResults);
            }
        } else if (err.killed) {
            options.log('Killed (timeout): ' + file + ' - adding to the back of the queue.');
            options.executor.addTask(task);
            task.forceKillTimeout();
            task.requeue();
        } else if (err.code === 13) {
            options.log('Selenium timeout: ' + file + ' - adding to the back of the queue.');
            options.executor.addTask(task);
            task.seleniumTimeout();
            task.requeue();
        }
        else if (err.code === 1) {
            options.log('Failed: ' + file + ' - ' + output[output.length - 4] + ' in ' + output[output.length - 2]);
            taskPendingOrFailed(cmd, task, testResults);
        }
        else {
            options.log('Error: ' + file + ' - ' + err + stdout);
            task.unknown();
        }

        if (options.debug) {
            if (err) options.log('\nerr: \n' + inspect(err));
            if (stderr) options.log('\nstderr: \n' + stderr);
            if (stdout) options.log('\nstdout: \n' + stdout);
        }
    }

    /**
     * Add the given task to the fail list and retry if options.numRetries is specified
     *
     * @param  {string} task
     */
    function taskPendingOrFailed (cmd, task, result) {
        failedTasks[cmd] = _.has(failedTasks, cmd) ? failedTasks[cmd] + 1 : 0;

        task.failed(result);
        if (failedTasks[cmd] < options.numRetries) {
            options.log('Retrying: ' + task.filename + ' ' + (failedTasks[cmd] + 1) + ' of ' + options.numRetries + ' time(s)');
            options.executor.addTask(cmd);
            task.requeue();
        }
    }

    /**
     * Output the final run time and emit the finished event
     */
    function finish () {
        var totalTime = Math.floor((new Date() - startTime) / 1000);

        options.log('\nFinished in ' + Math.floor(totalTime / 60) + 'm' + totalTime % 60 + 's');
        options.done();
    }

    /**
     * Parses the Behat scenario summary results
     * @param  {String}  e.g. "10 scenarios (6 passed, 1 failed, 1 pending, 2 unknown)"
     * @return {Object}  e.g. { passed: 6, failed: 1, pending: 1, unknown: 2 }
     */
    function parseTestResults (resultLine) {
        var scenarioResults = /^\d+ scenarios \((.*)\)/.exec(resultLine),
            result;

        // A string like "1 passed" or "3 passed, 2 pending, 1 failed"
        if (scenarioResults && scenarioResults[1]) {
            result = _.chain(scenarioResults[1].split(', '))
            .map(function (fragment) {
                var typeResult = fragment.split(' ').reverse();
                typeResult[1] = parseInt(typeResult[1]);
                return typeResult;
            })
            .object()
            .value();
        }
        return result;
    }

    this.run = run;
    this.getFeature = getFeature;
    this.getFeatureFromCommand = getFeatureFromCommand;
}

module.exports = BehatTask;
