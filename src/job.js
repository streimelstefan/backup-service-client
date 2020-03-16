const logger = require(`./logger`);
const request = require(`request`);
const fs = require(`fs`);

class Job {

    constructor(jobname, scriptId, timeout, deleteAfter = -1) {
        this.jobname = jobname;
        this.scriptId = scriptId;
        this.workerId = -1;
        this.timeout = timeout;
        this.deleteAfter = deleteAfter;
    }

    registerJob() {
        logger.debug(`src.job.${this.jobname}.registerJob: calling ${config.basicURL}v1/scripts/${this.scriptId}/register to register job ${this.jobname}`);
        request.post(
            `${config.basicURL}v1/scripts/${this.scriptId}/register`,
            {headers: config.headers},
            (error, res, body) => {
            if (error) {
                logger.error(`src.job.${this.jobname}.registerJob: An Error accoured trying to register job ${this.jobname}: ${error}`);
                process.exit(1);
            }
            if (res.statusCode === 200) {
                logger.verbose(`src.job.${this.jobname}.registerJob: Server returned Status code: ${res.statusCode}`);

                const jBody = JSON.parse(body);
                logger.verbose(`src.job.${this.jobname}.registerJob: Server returned Body: ${body}`);

                logger.debug(`src.job.${this.jobname}.registerJob: Adding workerId to job ${this.jobname}`);
                this.workerId = jBody[`workerId`];

                logger.debug(`src.job.${this.jobname}.registerJob: Running the Job for the first time.`);
                this.runJob();

                logger.debug(`src.job.registerJob: Setting Intervall for future job execution. Interval timout = ${this.timeout}`);
                setInterval(() => {this.runJob()}, this.timeout);
            } else if (res.statusCode === 400) {
                logger.error(`src.job.${this.jobname}.registerJob: Server answered with status code 400 and aditional information: ${body}`);
                process.exit(1);
            } else if (res.statusCode === 500) {
                logger.error(`src.job.${this.jobname}.registerJob: While trying to register the Worker the Server had an interal error, please check the servers error log for more information`);
                process.exit(1);
            }
        });
    }

    runJob() {
        logger.info(`src.job.${this.jobname}.runJob: Starting to run Job ${this.jobname}`);
        logger.debug(`src.job.${this.jobname}.runJob: calling http://${config.server.ipAddress}:${config.server.port}/v1/workers/${this.workerId}/restart to try to restart the Worker`)
        request.post(
            `http://${config.server.ipAddress}:${config.server.port}/v1/workers/${this.workerId}/restart`,
            {headers: config.headers},
            (error, res, body) => {
                if (error) {
                    logger.error(`src.job.${this.jobname}.runJob: An Error accoured trying to run job ${this.jobname}: ${error}`);
                    process.exit(1);
                }

                if (res.statusCode === 200) {
                    logger.info(`src.job.${this.jobname}.runJob: successfully restarted worker for job ${this.jobname}`);

                    this.waitTillWorkerFinished();
                } else if (res.statusCode === 403) {
                    logger.warn(`src.job.${this.jobname}.runJob: The worker was not release yet. You should set the timout for the job ${this.jobname} higher to avoid this collision and load on the Server. Retrying to start worker in one minute!`);
                    setTimeout(this.runJob, 60000);
                } else if (res.statusCode === 500) {
                    logger.error(`src.job.${this.jobname}.runJob: While trying to run the Worker the Server had an interal error, please check the servers error log for more information`);
                    process.exit(1);
                }
            });

    }

    waitTillWorkerFinished() {
        logger.info(`src.job.${this.jobname}.waitTillWorkerFinished: Waiting till worker finished executing`);
        const stuff = setInterval(async () => {
            logger.debug(`src.job.${this.jobname}.waitTillWorkerFinished: calling http://${config.server.ipAddress}:${config.server.port}/v1/workers/${this.workerId}/state to get the workers state`);
            await request.get(
                `http://${config.server.ipAddress}:${config.server.port}/v1/workers/${this.workerId}/state`,
                {headers: config.headers},
                (error, res, body) => {
                if (error) {
                    logger.error(`src.job.${this.jobname}.waitTillWorkerFinished: An Error accoured trying to access the state of the worker of the job ${this.jobname}: ${error}`);
                    process.exit(1);
                }
                body = JSON.parse(body);
                if (res.statusCode === 200) {

                    if (body.state == `SUCCESS` || body.state == `PASSIVE`) {
                        logger.info(`src.job.${this.jobname}.waitTillWorkerFinished: worker of job ${this.jobname} finished running.`);
                        clearInterval(stuff);


                        this.getBackupFile();
                    } else if (body.state == `ERROR`) {
                        logger.error(`src.job.${this.jobname}.waitTillWorkerFinished: worker finished with an Error stopping job execution!`);
                        clearInterval(stuff);
                    } else {
                        logger.verbose(`src.job.${this.jobname}.waitTillWorkerFinished: worker of job ${this.jobname} is still runnning. Trying again in 5 seconds.`);
                    }

                } else if (res.statusCode === 500) {
                    logger.error(`src.job.${this.jobname}.waitTillWorkerFinished: While trying to get the state of the Worker the Server had an interal error, please check the servers error log for more information`);
                    process.exit(1);
                }
            });
        }, 5000);
    }

    getBackupFile() {
        logger.info(`src.job.${this.jobname}.getBackupFile: Reqeusting backup file of job ${this.jobname}`);
        logger.debug(`src.job.${this.jobname}.getBackupFile: calling http://${config.server.ipAddress}:${config.server.port}/v1/workers/${this.workerId}/getBackupFile to get the backup file.`)
        request.post(`http://${config.server.ipAddress}:${config.server.port}/v1/workers/${this.workerId}/getBackupFile`,
            {headers: config.headers, encoding: null},
            (error, res, body) => {
            if (error) {
                logger.error(`src.job.${this.jobname}.getBackupFile: An Error accoured trying get the backup of job ${this.jobname}: ${error}`);
                process.exit(1);
            }

            if (res.statusCode === 200) {
                logger.debug(`src.job.${this.jobname}.getBackupFile: download finished writing file to disk`);

                fs.writeFileSync(__dirname + `/../backups/${this.jobname}/back-${this.jobname}-${new Date().toISOString().split(`:`).join(`-`).replace(`.`, `-`)}.bak.zip`, body);

                this.deleteOldBackups();

                this.deleteBackupFile();
            } else if (res.statusCode === 500) {
                logger.error(`src.job.${this.jobname}.getBackupFile: While trying to get the backupfile of the Worker the Server had an interal error, please check the servers error log for more information`);
                process.exit(1);
            }
        });

    }

    deleteOldBackups() {
        let dateArr = []

        if (this.deleteAfter >= 0) {

            fs.readdir(__dirname + `/../backups/${this.jobname}`, (err, files) => {
                if (files.length >= this.deleteAfter) {
                    logger.info(`src.job.${this.jobname}.deleteOldBackups: There are backups that need to be deleted`)
                    files.forEach(file => {
                        dateArr.push({filename: file, timestamp: null});

                        /*
                            This block reformats the date format from the filename into the ISOS Fileformat
                            It splits ups the files adds - to between the first three parameters than
                            adds : between the third until the tith element and then adds a . between the fith and the sith

                            gets:

                            X-X-X-X-X-X

                            returns

                            X-X-X:X:X.X

                        */
                        file = file.split(`-`);
                        file.splice(0, 2);
                        file[5] = file[5].split(`.`)[0];
                        let date = new Date(file[0] + `-` + file[1] + `-` + file[2] + `:` + file[3] + `:` + file[4] + `.` + file[5]);

                        dateArr[dateArr.length - 1].timestamp = date;
                    });

                    // sorts the array so that the oldest files are at the end
                    dateArr.sort((a, b) => b.timestamp - a.timestamp);

                    logger.verbose(`src.job.${this.jobname}.deleteOldBackups: There are ${dateArr.length} files in the backup folder max ammount is ${this.deleteAfter}`);

                    dateArr.splice(this.deleteAfter, dateArr.length - this.deleteAfter).forEach(file => {
                        fs.unlink(`${__dirname}/../backups/${this.jobname}/${file.filename}`, () => {
                            logger.info(`src.job.${this.jobname}.deleteOldBackups: Deleted backup ${file.filename} from Client`);
                        });
                    });
                }
            });
        }
    }


    deleteBackupFile() {
        logger.info(`src.job.${this.jobname}.deleteBackupFile: Reqeusting to delete the backup from the server.`);
        logger.debug(`src.job.${this.jobname}.deleteBackupFile: calling http://${config.server.ipAddress}:${config.server.port}/v1/workers/${this.workerId}/backup to delete the backup form the server.`)
        request.delete(
            `http://${config.server.ipAddress}:${config.server.port}/v1/workers/${this.workerId}/backup`,
            {headers: config.headers},
            (error, res, body) => {
            if (error) {
                logger.error(`src.job.${this.jobname}.deleteBackupFile: An Error accoured trying delete the backup from the Server of job ${this.jobname}: ${error}`);
                process.exit(1);
            }
            if (res.statusCode === 200) {
                logger.info(`src.job.${this.jobname}.deleteBackupFile: Successfully delete the Backup from the Server. The job now finished runnning.`);
            } else if (res.statusCode === 403) {
                logger.warn(`res.job.deleteBackupFile: The Server did not find any backup files. This is probably an error with the Server configuration!`);
            } else  if (res.statusCode === 500) {
                logger.error(`src.job.${this.jobname}.getBackupFile: While trying to delete the backupfile of the Worker the Server had an interal error, please check the servers error log for more information`);
                process.exit(1);
            }
        });
    }
}

let jobList = [];

module.exports = {
    Job: Job,
    JobList: jobList
};