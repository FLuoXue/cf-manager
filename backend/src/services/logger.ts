import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { config } from '../config';

const logDir = config.logDir;

function createLogger(filename: string): winston.Logger {
  const fileTransport = new DailyRotateFile({
    dirname: logDir,
    filename: `${filename}-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '7d',
    zippedArchive: false,
  });

  return winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ timestamp, message }) => `${timestamp} ${message}`),
    ),
    transports: [
      fileTransport,
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp({ format: 'HH:mm:ss' }),
          winston.format.printf(({ timestamp, message }) => `${timestamp} ${message}`),
        ),
      }),
    ],
  });
}

export const v1Logger = createLogger('v1');
export const apiLogger = createLogger('api');
export const appLogger = createLogger('app');
