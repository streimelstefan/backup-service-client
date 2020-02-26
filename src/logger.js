const { createLogger, format, transports } = require('winston');

const logger = createLogger({
    transports: [
        new transports.Console({
            level: 'info',
            format: format.combine(
                format.colorize(),
                format.simple()
            )
        }),
        new transports.File({
            filename: 'logs/client.log',
            level: 'silly',
            format: format.json()
        })
    ]
});

module.exports = logger;