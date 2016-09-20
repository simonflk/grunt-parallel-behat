'use strict';

var _ = require('underscore'),
    inspect = require('util').inspect,
    fs = require('fs');

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
        startTime,
        FeatureTask = options.FeatureTask,
        cleanupTimeout;

    /**
     * Create a behat command for each file and run it using the executor
     */
    function run() {
        startTime = +new Date();
        options.log('Found ' + options.files.length + ' feature file(s). Running ' + options.maxProcesses + ' at a time.');

        _.each(options.files, addTask);

        if (options.maxExecutionTime) {
            cleanupTimeout = setTimeout(abortTasks.bind(this), options.maxExecutionTime);
        }

        options.executor.on('startedTask', taskStarted.bind(this));
        options.executor.on('finishedTask', taskFinished.bind(this));
        options.executor.on('finished', finish.bind(this));
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

    /**
     * Returns the FeatureTask for the given command
     *
     * @param {String} cmd
     * @return {FeatureTask}
     */
    function getFeatureFromCommand(cmd) {
        return tasks[cmd];
    }

    /**
     * Tell the user we've started a new task
     *
     * @param  {string} cmd
     */
    function taskStarted (cmd) {
        var task = this.getFeatureFromCommand(cmd);
        options.log('Started: [' + task.id + '] ' + cmd);
        task.start();
        writeReport();
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
            output = stdout ? stdout.split('\n') : [],
            testResults = parseTestResults(output[output.length - 4]),
            silentRequeue = false;

        if (options.debug) {
            options.log('\n\n/==============================================================================\\');
        }

        if (!err) {
            options.log('Completed: ' + task.descriptor + ' - ' + output[output.length - 4] + ' in ' + output[output.length - 2]);
            if (testResults && testResults.pending) {
                task.failed(testResults);
            } else {
                task.succeeded(testResults);
            }
        } else if (err.killed) {
            options.log('Killed (timeout): ' + task.descriptor + ' - adding to the back of the queue.');
            task.forceKillTimeout();
        } else if (err.code === 13) {
            options.log('Selenium timeout: ' + task.descriptor + ' - adding to the back of the queue.');
            task.seleniumTimeout();
            if (task.waitTimeouts === 1) {
                // todo add config option
                silentRequeue = true;
            }
        } else if (err.code === 255) {
            options.log('Curl Error 255: ' + task.descriptor + ' -  adding to the back of the queue.');
            task.curlError();
            if (task.curlErrors <= 5) {
                silentRequeue = true;
            }
        } else if (err.code === 1) {
            options.log('Failed: ' + task.descriptor + ' - ' + output[output.length - 4] + ' in ' + output[output.length - 2]);
            task.failed(testResults);
        } else {
            options.log('Error: ' + task.descriptor + ' - ' + err + stdout);
            task.unknown();
        }

        writeReport();

        if (options.debug) {
            options.log('\ntask: \n' + inspect(task));
            if (err) options.log('\nerr: \n' + inspect(err));
            if (stderr) options.log('\nstderr: \n' + stderr);
            if (stdout) options.log('\nstdout: \n' + stdout);
            options.log('\n\\==============================================================================/\n');
        }

        if (_.contains(['failed', 'forceKillTimeout'], task.getStatus())) {
            taskPendingOrFailed(cmd, task);
        } else if (silentRequeue) {
            options.executor.addTask(cmd);
        }
    }

    /**
     * Add the given task to the fail list and retry if options.numRetries is specified
     *
     * @param  {string} task
     */
    function taskPendingOrFailed (cmd, task) {
        if (task.retries + 1 <= options.numRetries) {
            options.log('Retrying: ' + task.descriptor + ' ' + (task.retries + 1) + ' of ' + options.numRetries + ' time(s)');
            options.executor.addTask(cmd);
            task.requeue();
        }
    }

    /**
     * Aborts all running tasks, and exits
     */
    function abortTasks () {
        var totalTime = Math.floor((new Date() - startTime) / 1000);

        options.log('\nAborting tasks after ' + Math.floor(totalTime / 60) + 'm' + totalTime % 60 + 's');
        options.executor.terminateTasks();
        options.done();
    }

    /**
     * Output the final run time and emit the finished event
     */
    function finish () {
        var totalTime = Math.floor((new Date() - startTime) / 1000);

        if (cleanupTimeout) {
            clearTimeout(cleanupTimeout);
        }

        options.log('\nFinished in ' + Math.floor(totalTime / 60) + 'm' + totalTime % 60 + 's');
        options.done();
    }

    /**
     * Write JSON report of all feature tasks
     * requires `output` option to be set
     * TODO: refactor this into a separate BehatReporter
     */
    function writeReport () {
        if (options.output) {
            var now = +new Date(),
                taskArray = _.values(tasks),
                data = {
                    start: startTime,
                    duration: new Date() - startTime,
                    tasks: taskArray,
                    total: taskArray.length,
                    ok: _.where(taskArray, { ok: true }).length,
                    running: _.filter(taskArray, function (t) {
                        return t.getCurrentDuration() >= 30;
                    }).length,
                    retries: _.chain(taskArray)
                        .pluck('retries')
                        .reduce(function (m,n) {
                            return m + n;
                        }, 0)
                        .value(),
                    killed: _.filter(taskArray, function (t) {
                        return t.hasProblems();
                    }).length
                };
            try {
                fs.writeFileSync(options.output, JSON.stringify(data));
            }
            catch (err) {
                options.log('\n>>>Error writing to report file "' + options.output + '" -- ' + inspect(err));
            }
        }
    }

    /**
     * Parses the Behat scenario summary results
     * @param  {String}  e.g. "10 scenarios (6 passed, 1 failed, 1 pending, 2 unknown)"
     * @return {Object}  e.g. { passed: 6, failed: 1, pending: 1, unknown: 2 }
     */
    function parseTestResults (resultLine) {
        var scenarioResults = /^(\d+) scenarios? \((.*)\)/.exec(resultLine),
            result;

        // A string like "1 passed" or "3 passed, 2 pending, 1 failed"
        if (scenarioResults && scenarioResults[1]) {
            result = _.chain(scenarioResults[2].split(', '))
            .map(function (fragment) {
                var typeResult = fragment.split(' ').reverse();
                typeResult[1] = parseInt(typeResult[1]);
                return typeResult;
            })
            .object()
            .value();
            result.total = parseInt(scenarioResults[1]);
        }
        return result;
    }

    this.run = run;
    this.getFeature = getFeature;
    this.getFeatureFromCommand = getFeatureFromCommand;
}

module.exports = BehatTask;
