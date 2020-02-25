const fs = require('fs');
const YAML = require('yaml');
const request = require('request');
const http = require('http');

let config = {};

// Checking if config file exists
console.log('[STARTUP][LOG]: Checking if a config exists');
if (fs.existsSync('config.yml')) {
    config = YAML.parse(fs.readFileSync('config.yml').toString());

    console.log(`[STARTUP][LOG]: config = ${config}`);

    if (!fs.existsSync('backups')) {
        fs.mkdirSync('backups');
    }

    console.log(`[STARTUP][LOG]: Authenticating on Server`);

    const basicURL = `http://${config.server.ipAddress}:${config.server.port}/`


    request.post(`${basicURL}v1/auth/login`, {
            json: {
                uid: config.server.id,
                pwd: config.server.pwd
            }
        }, (error, res, body) => {
        if (error) {
            console.error('[STARTUP][LOG]: An error accoured during the login reqeust: ' + error);
            return;
        }

        let cookie = res.headers['set-cookie'];

        console.log('[STARTUP][LOG]: cookie = ' + cookie);
        let headers = {'Cookie': cookie};

        config.jobs.forEach(job => {
            const timeout = getTimeout(job);
            console.log(`[STARTUP][LOG]: Timeout for job ${job} = ${timeout}`);

            request.post(
                `${basicURL}v1/scripts/${config[job].scriptId}/register`,
                {headers: headers},
                (error, res, body) => {
                if (error) {
                    console.error(error)
                    return;
                }
                console.log(`[STARTUP][LOG]: statusCode: ${res.statusCode}`)

                const jBody = JSON.parse(body);

                config[job].workerId = jBody['workerId'];
                console.log(config[job].workerId);

                if (res.statusCode === 200) {
                console.log(body)
                    console.log('[STARTUP][LOG]: Register Script succesfully. Worker Id is: ' + config[job].workerId)
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
    console.log(`[JOB-${job.workerId}][LOG]: Running job with worker id ${job.workerId}`);
    console.log(`[JOB-${job.workerId}][LOG][RESTART]: Requesting to restart the Worker`)
    console.log(`[JOB-${job.workerId}][LOG][RESTART]: Job Payload = ${JSON.stringify(job)}`);
    console.log(`[JOB-${job.workerId}][LOG][RESTART]: Job Header = ${header}`);

    const restartIntervalId = setInterval(async () => {

        await request.post(
            `http://${config.server.ipAddress}:${config.server.port}/v1/workers/${job.workerId}/restart`,
            {headers: header},
            (error, res, body) => {
                if (error) {
                    console.error(`[JOB-${job.workerId}][ERROR][RESTART]: An error accoured during the request: ${error}`);
                    return;
                }
                console.log(`[JOB-${job.workerId}][LOG][RESTART]: Response statusCode: ${res.statusCode}`)

                if (res.statusCode === 200) {
                    console.log(`[JOB-${job.workerId}][LOG][RESTART]: Started Worker`);
                    clearInterval(restartIntervalId);
                    waitTillWorkerFinished(job, header);
                } else {
                    console.log(`[JOB-${job.workerId}][LOG][RESTART]: Worker not ready yet retrying in 5 seconds.`);
                }
            });
    }, 10000);

    
}

function waitTillWorkerFinished(job, header) {
    console.log(`[JOB-${job.workerId}][LOG][WAITINGLOOP]: Waiting till the worker finished running`);
    const stuff = setInterval(async () => {
        console.log(`[JOB-${job.workerId}][LOG][WAITINGLOOP]: Reqeusting the state of the worker!`);
        await request.get(
            `http://${config.server.ipAddress}:${config.server.port}/v1/workers/${job.workerId}/state`,
            {headers: header},
            (error, res, body) => {
            if (error) {
                console.error(`[JOB-${job.workerId}][ERROR][WAITINGLOOP]: An error accoured during the request: ${error}`);
                return;
            }
            console.log(`[JOB-${job.workerId}][LOG][WAITINGLOOP]: Reqeust statusCode: ${res.statusCode}`);
            body = JSON.parse(body);

            if (body.state == 'SUCCESS' || body.state == 'PASSIVE') {
                clearInterval(stuff);

                console.log(`[JOB-${job.workerId}][LOG][WAITINGLOOP]: Worker finished execution`);

                getBackupFile(job, header);

            } else {
                console.log(`[JOB-${job.workerId}][LOG][WAITINGLOOP]: Worker isn't finished jet retrying in 5 seconds.`);
            }
        });
    }, 5000);
}

function getBackupFile(job, header) {
    console.log(`[JOB-${job.workerId}][LOG][GETFILE]: Reqeusting file download`);
    request.post(`http://${config.server.ipAddress}:${config.server.port}/v1/workers/${job.workerId}/getBackupFile`,
        {headers: header, encoding: null},
        (error, res, body) => {
        if (error) {
            console.error(`[JOB-${job.workerId}][ERROR][GETFILE]: An error accoured doring the reqeust: ${error}`)
            return;
        }
        console.log(`[JOB-${job.workerId}][LOG][GETFILE]: Request statusCode: ${res.statusCode}`);

        fs.writeFileSync(__dirname + `/backups/back-${job.workerId}.bak.zip`, body);

        deleteBackupFile(job, header);

    });

}


function deleteBackupFile(job, header) {
    console.log(`[JOB-${job.workerId}][LOG][BACKDELETE]: Reqeusting to delete the backup from the server.`);
    request.delete(
        `http://${config.server.ipAddress}:${config.server.port}/v1/workers/${job.workerId}/backup`,
        {headers: header},
        (error, res, body) => {
        if (error) {
            console.error(`[JOB-${job.workerId}][ERROR][BACKDELETE]: An error accoured during the reqeust: ${error}`);
            return;
        }
        console.log(`[JOB-${job.workerId}][LOG][BACKDELETE]: statusCode: ${res.statusCode}`);
        console.log(`[JOB-${job.workerId}][LOG][BACKDELETE]: delete Body = ${JSON.stringify(body)}`);
    });
}