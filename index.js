const YAML = require('yaml');
const request = require('request');
const logger = require('./src/logger');
const Job = require('./src/job').Job;
const jobList = require('./src/job').JobList;
const fs = require('fs');

global.config = {};

logger.info('Starting Client');

/*logger.warn('test');
logger.error('error');
logger.verbose('teswt');
logger.debug('test');
*/

// Checking if config file exists
logger.debug('index.startup: Checking if a config file was provided.');
if (fs.existsSync('config.yml')) {
    logger.info('index.startup: user provided a config file');
    logger.debug('index.startup: starting to read config');
    config = YAML.parse(fs.readFileSync('config.yml').toString());
    logger.verbose(`index.startup: config content = ${JSON.stringify(config)}`);

    logger.debug('index.startup: checking if the backup folder exists');
    if (!fs.existsSync('backups')) {
        logger.debug('index.startup: backup folder does not exist, creating it now');
        fs.mkdirSync('backups');
    }

    logger.info('index.startup: trying to authenticate on the Server');

    config.basicURL = `http://${config.server.ipAddress}:${config.server.port}/`
    logger.verbose(`index.startup: baseurl = ${config.basicURL}`);

    authenticateOnServer();

    

} else {
    console.log('Config does not exist');
    // TODO: add stuff so the config can be made on first startup
}

function authenticateOnServer() {
    logger.debug(`index.authentication: calling ${config.basicURL}v1/auth/login to authenticate`);
    request.post(`${config.basicURL}v1/auth/login`, {
            json: {
                uid: config.server.id,
                pwd: config.server.pwd
            }
        }, (error, res, body) => {
        if (error) {
            logger.error('index.authentication: an Error accoured trying to authenticate on the Server: ' + error);
            process.exit(1);
        }

        if (res.statusCode === 200) {
            
            logger.debug('index.authentication: getting set cookie from response');
            let cookie = res.headers['set-cookie'];
            logger.verbose(`index.authentication: set cookie content = ${JSON.stringify(cookie)}`)
            
            logger.debug('index.authentication: settomg config.header');
            config.headers = {'Cookie': cookie};
            
            logger.info('index.authentication: Authentication successful');
            
            createJobs();

        } else if (res.statusCode === 401) {
            logger.error('index.authentication: Server answered with status code 401: Wrong Credentials. So the Credentials or the Server address need to be wrong!');
            process.exit(1);
        } else if (res.statusCode === 500) {
            logger.error('index.authentication: While trying to athenticate the Server had an internal Error, please check the Servers error log for more information.');
            process.exit(1);
        } else {
            logger.error('index.authentication: The Server answered with an unknown status code please make sure to Server adress is right.');
            process.exit(1);
        }
    });
}

function createJobs() {
    logger.debug('index.createJobs: starting to create Jobs');
    config.jobs.forEach(job => {

        logger.debug(`index.createJobs: getting Timeout for job: ${job}`);
        const timeout = getTimeout(job);

        logger.debug(`index.createJobs: getting scriptId of job: ${job}`);
        const scriptId = config[job].scriptId;

        logger.debug(`index.createJobs: getting deleteAfter of job: ${job}`);
        const deleteAfter = config[job].deleteAfter;

        if (!fs.existsSync(`backups/${job}`)) {
            logger.debug(`index.startup: creating backup folder for job ${job}`);
            fs.mkdirSync(`backups/${job}`);
        }

        logger.verbose(`index.createJob: creating job with data: {jobName: ${job}; scriptId: ${scriptId}; timeout: ${timeout}; deleteAfter: ${deleteAfter}}`);
        jobList.push(new Job(job, scriptId, timeout, deleteAfter));
    });

    logger.info('index.createJobs: finished craeting Jobs registering them now on the Server');
    registerJobs();
}

function registerJobs() {
    logger.debug('index.reigsterJobs: Starting to register the scripts');
    jobList.forEach(job => {
        job.registerJob();
    });
}

function getTimeout(job) {
    logger.debug(`index.getTimeout: Starting to get Timout of job ${job} in priority from hight to low: timout > calledPerDay > calledPerMonth > calledPerYear`);
    let timeout = 0;

    if (config[job].calledPerYear) {
        logger.debug(`index.getTimeout: Job has calledPerYear defined with value: ${config[job].calledPerYear}`);
        timeout = 31556952000 / config[job].calledPerYear;
    }
    if (config[job].calledPerMonth) {
        logger.debug(`index.getTimeout: Job has calledPerMonth defined with value: ${config[job].calledPerMonth}`);
        timeout = 2592000000 / config[job].calledPerMonth;
    }
    if (config[job].calledPerDay) {
        logger.debug(`index.getTimeout: Job has calledPerDay defined with value: ${config[job].calledPerDay}`);
        timeout = 86400000 / config[job].calledPerDay;
    }
    if (config[job].timeout) {
        logger.debug(`index.getTimeout: Job has timeout defined with value: ${config[job].timeout}`);
        timeout = config[job].timeout;
    }

    return timeout;
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