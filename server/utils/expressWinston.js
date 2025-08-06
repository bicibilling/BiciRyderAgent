// Mock express-winston for basic functionality
// In production, install express-winston package

const logger = (options) => {
  return (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      const { logger: loggerInstance } = options;
      
      if (loggerInstance) {
        loggerInstance.info('HTTP Request', {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          responseTime: duration,
          userAgent: req.get('User-Agent'),
          ip: req.ip
        });
      }
    });
    
    next();
  };
};

const errorLogger = (options) => {
  return (error, req, res, next) => {
    const { logger: loggerInstance } = options;
    
    if (loggerInstance) {
      loggerInstance.error('HTTP Error', {
        method: req.method,
        url: req.url,
        error: error.message,
        stack: error.stack,
        ip: req.ip
      });
    }
    
    next(error);
  };
};

module.exports = {
  logger,
  errorLogger
};