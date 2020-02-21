const fs = require('fs');
const YAML = require('yaml');
const request = require('request');

let config = {};

// Checking if config file exists
console.log('Checking if a config exists');
if (fs.existsSync('config.yml')) {
    config = YAML.parse(fs.readFileSync('config.yml').toString());

    console.log(config);

    if (!fs.existsSync('backups')) {
        fs.mkdirSync('backups');
    }

    console.log('Authenticating on Server');

    const basicURL = `http://${config.server.ipAddress}:${config.server.port}/`


    request.post(`${basicURL}v1/auth/login`, {
            json: {
                uid: config.server.id,
                pwd: config.server.pwd
            }
        }, (error, res, body) => {
        if (error) {
            console.error(error)
            return;
        }

        let cookie = res.headers['set-cookie'];

        console.log('cookie = ' + cookie);
        let headers = {'Cookie': cookie};
        console.log(body)

        config.jobs.forEach(job => {
            const timeout = getTimeout(job);
            console.log(`Timeout for job ${job} = ${timeout}`);

            request.post(
                `${basicURL}v1/scripts/${config[job].scriptId}/register`,
                {headers: headers},
                (error, res, body) => {
                if (error) {
                    console.error(error)
                    return;
                }
                console.log(`statusCode: ${res.statusCode}`)
                console.log(body)

                const jBody = JSON.parse(body);

                config[job].workerId = jBody['workerId'];
                console.log(config[job].workerId);

                if (res.statusCode === 200) {
                    console.log('Register Script succesfully. Worker Id is: ' + config[job].workerId)
                    runJob(config[job], headers);
                    setInterval(() => {runJob(config[job], headers)}, timeout);
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

function runJob(job, header) {
    console.log('=====================================================');
    console.log('Running job with worker id ' + job.workerId);
    console.log('=====================================================');
    console.log(JSON.stringify(job));
    console.log(header);

    request.post(
        `http://${config.server.ipAddress}:${config.server.port}/v1/workers/${job.workerId}/restart`,
        {headers: header},
        (error, res, body) => {
        if (error) {
            console.error(error)
            return;
        }
        console.log(`statusCode: ${res.statusCode}`)
        console.log(body)
    });

    const stuff = setTimeout(() => {
        console.log('Reqeusting the state of the worker!');
        request.get(
            `http://${config.server.ipAddress}:${config.server.port}/v1/workers/${job.workerId}/state`,
            {headers: header},
            (error, res, body) => {
            if (error) {
                console.error(error)
                return;
            }
            console.log(`statusCode: ${res.statusCode}`);
            console.log('Statebody = ' + JSON.stringify(body));

            if (body.state = 'SUCCESS') {
                stuff.unref();

                console.log('Finished Execution');

                getBackupFile(job, header);

            }
        });
    }, 1000);
}

function getBackupFile(job, header) {
    request.get(
        `http://${config.server.ipAddress}:${config.server.port}/v1/workers/${job.workerId}/getBackupFile`,
        {headers: header},
        (error, res, body) => {
        if (error) {
            console.error(error)
            return;
        }
        console.log(`statusCode: ${res.statusCode}`);
        console.log('file Body = ' + JSON.stringify(body));

        fs.writeFileSync(__dirname + `/backups/back-${job.workerId}.bak.zip`, body);

        deleteBackupFile(job, header);
    });
}


function deleteBackupFile(job, header) {
    request.delete(
        `http://${config.server.ipAddress}:${config.server.port}/v1/workers/${job.workerId}/backup`,
        {headers: header},
        (error, res, body) => {
        if (error) {
            console.error(error)
            return;
        }
        console.log(`statusCode: ${res.statusCode}`);
        console.log('delete Body = ' + JSON.stringify(body));
    });
}