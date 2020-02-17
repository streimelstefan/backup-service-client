const fs = require('fs');
const YAML = require('yaml');
const request = require('request');

let config = {};

// Checking if config file exists
console.log('Checking if a config exists');
if (fs.existsSync('config.yml')) {
    config = YAML.parse(fs.readFileSync('config.yml').toString());

    console.log(config);

    console.log('Authenticating on Server');

    request.post(`http://${config.server.ipAddress}:${config.server.port}/v1/auth/login`, {
            json: {
                uid: config.server.id,
                pwd: config.server.pwd
            }
        }, (error, res, body) => {
        if (error) {
            console.error(error)
            return;
        }
        console.log(`statusCode: ${res.statusCode}`)
        console.log(body)

        config.jobs.forEach(job => {
            const timeout = getTimeout(job);
            console.log(`Timeout for job ${job} = ${timeout}`);

            request.post(`http://${config.server.ipAddress}:${config.server.port}/v1/scripts/${config[job].scriptId}/register`, {},
                (error, res, body) => {
                if (error) {
                    console.error(error)
                    return;
                }
                console.log(`statusCode: ${res.statusCode}`)
                console.log(body)

                config[job].workerId = res.body.workerId;

                if (res.statusCode === 200) {
                    console.log('Register Script succesfully. Worker Id is: ' + res.body.workerId)
                    runJob(config[job]);
                    setInterval(() => {runJob(config[job])}, timeout);
                } else {
                    process.exit()
                }
            });
        });
    });

} else {
    console.log('Config does not exist');
    // TODO: add stuff so the config can be made on first startup
}

function getTimeout(job) {
    let timeout = 0;

    if (config[job].calledPerYear) {
        timeout = 31556952000 / config[job].calledPerYear;
    }
    if (config[job].calledPerMonth) {
        timeout = 2592000000 / config[job].calledPerMonth;
    }
    if (config[job].calledPerDay) {
        timeout = 86400000 / config[job].calledPerDay;
    }
    if (config[job].timeout) {
        timeout = config[job].timeout;
    }

    return timeout;
}

function runJob(job) {
    console.log('Running job with script id ' + job.scriptId);

    request.post(`http://${config.server.ipAddress}:${config.server.port}/v1/workers/${job.workerId}/restart`, {
        }, (error, res, body) => {
        if (error) {
            console.error(error)
            return;
        }
        console.log(`statusCode: ${res.statusCode}`)
        console.log(body)

    });
}
