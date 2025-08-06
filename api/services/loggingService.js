/**
 * Logging Service
 * Comprehensive structured logging with multiple outputs and log levels
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class LoggingService extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      level: options.level || process.env.LOG_LEVEL || 'info',
      format: options.format || 'json',
      outputs: options.outputs || ['console'],
      maxFileSize: options.maxFileSize || 100 * 1024 * 1024, // 100MB
      maxFiles: options.maxFiles || 10,
      logDirectory: options.logDirectory || 'logs',
      includeStack: options.includeStack !== false,
      ...options
    };
    
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      trace: 4
    };
    
    this.colors = {
      error: '\x1b[31m', // Red
      warn: '\x1b[33m',  // Yellow
      info: '\x1b[36m',  // Cyan
      debug: '\x1b[35m', // Magenta
      trace: '\x1b[37m', // White
      reset: '\x1b[0m'
    };
    
    this.logStreams = new Map();
    this.metrics = {
      totalLogs: 0,
      logsByLevel: {},
      errors: 0,
      warnings: 0
    };
    
    this.initializeLogStreams();
    this.startLogRotation();
  }
  
  /**
   * Initialize log output streams
   */
  initializeLogStreams() {
    // Create log directory if file output is enabled
    if (this.config.outputs.includes('file')) {
      this.ensureLogDirectory();
    }
    
    // Initialize log streams for different levels
    if (this.config.outputs.includes('file')) {
      ['error', 'warn', 'info', 'debug'].forEach(level => {
        this.createLogStream(level);
      });
    }
  }
  
  /**
   * Ensure log directory exists
   */
  ensureLogDirectory() {
    const logDir = path.resolve(this.config.logDirectory);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }
  
  /**
   * Create log stream for specific level
   */
  createLogStream(level) {
    const logFile = path.join(this.config.logDirectory, `${level}.log`);
    
    try {
      const stream = fs.createWriteStream(logFile, { 
        flags: 'a',
        encoding: 'utf8'
      });
      
      stream.on('error', (error) => {
        console.error(`Log stream error for ${level}:`, error);
      });
      
      this.logStreams.set(level, stream);
      
    } catch (error) {
      console.error(`Failed to create log stream for ${level}:`, error);
    }
  }
  
  /**
   * Main logging method
   */
  log(level, message, meta = {}) {
    // Check if level should be logged
    if (!this.shouldLog(level)) {
      return;
    }
    
    const logEntry = this.formatLogEntry(level, message, meta);
    
    // Update metrics
    this.updateMetrics(level);
    
    // Output to configured destinations
    this.outputLog(level, logEntry);
    
    // Emit log event
    this.emit('log', { level, message, meta, logEntry });
  }
  
  /**
   * Check if log level should be output
   */
  shouldLog(level) {
    const currentLevel = this.levels[this.config.level] || 2;
    const logLevel = this.levels[level] || 2;
    return logLevel <= currentLevel;
  }
  
  /**
   * Format log entry
   */
  formatLogEntry(level, message, meta) {
    const timestamp = new Date().toISOString();
    
    const baseEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      pid: process.pid,
      hostname: require('os').hostname(),
      ...meta
    };
    
    // Add stack trace for errors
    if (level === 'error' && this.config.includeStack) {
      const stack = new Error().stack;
      baseEntry.stack = stack;
    }
    
    // Add memory usage for debug logs
    if (level === 'debug') {
      baseEntry.memory = process.memoryUsage();
    }
    
    return baseEntry;
  }
  
  /**
   * Output log to configured destinations
   */
  outputLog(level, logEntry) {
    this.config.outputs.forEach(output => {
      switch (output) {
        case 'console':
          this.outputToConsole(level, logEntry);
          break;
        case 'file':
          this.outputToFile(level, logEntry);
          break;
        case 'json':
          this.outputAsJSON(level, logEntry);
          break;
      }
    });
  }
  
  /**
   * Output to console with colors
   */
  outputToConsole(level, logEntry) {
    const color = this.colors[level] || this.colors.reset;
    const reset = this.colors.reset;
    
    if (this.config.format === 'json') {
      console.log(`${color}${JSON.stringify(logEntry)}${reset}`);
    } else {
      const formattedMessage = this.formatConsoleMessage(level, logEntry);
      console.log(`${color}${formattedMessage}${reset}`);
    }
  }
  
  /**
   * Format console message in readable format
   */
  formatConsoleMessage(level, logEntry) {
    const { timestamp, message, ...meta } = logEntry;
    const time = new Date(timestamp).toLocaleTimeString();
    
    let formatted = `[${time}] ${level.toUpperCase()}: ${message}`;
    
    // Add metadata if present
    const metaKeys = Object.keys(meta).filter(key => 
      !['level', 'pid', 'hostname'].includes(key)
    );
    
    if (metaKeys.length > 0) {
      const metaStr = metaKeys.map(key => {
        const value = typeof meta[key] === 'object' 
          ? JSON.stringify(meta[key]) 
          : meta[key];
        return `${key}=${value}`;
      }).join(' ');
      
      formatted += ` | ${metaStr}`;
    }
    
    return formatted;
  }
  
  /**
   * Output to file
   */
  outputToFile(level, logEntry) {
    const stream = this.logStreams.get(level) || this.logStreams.get('info');
    if (!stream) return;
    
    try {
      const logLine = JSON.stringify(logEntry) + '\n';
      stream.write(logLine);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }
  
  /**
   * Output as JSON to stdout
   */
  outputAsJSON(level, logEntry) {
    process.stdout.write(JSON.stringify(logEntry) + '\n');
  }
  
  /**
   * Update logging metrics
   */
  updateMetrics(level) {
    this.metrics.totalLogs++;
    this.metrics.logsByLevel[level] = (this.metrics.logsByLevel[level] || 0) + 1;
    
    if (level === 'error') {
      this.metrics.errors++;
    } else if (level === 'warn') {
      this.metrics.warnings++;
    }
  }
  
  /**
   * Convenience methods for different log levels
   */
  error(message, meta = {}) {
    this.log('error', message, meta);
  }
  
  warn(message, meta = {}) {
    this.log('warn', message, meta);
  }
  
  info(message, meta = {}) {
    this.log('info', message, meta);
  }
  
  debug(message, meta = {}) {
    this.log('debug', message, meta);
  }
  
  trace(message, meta = {}) {
    this.log('trace', message, meta);
  }
  
  /**
   * Create child logger with additional context
   */
  child(additionalMeta = {}) {
    const childLogger = Object.create(this);
    childLogger.defaultMeta = { ...this.defaultMeta, ...additionalMeta };
    
    // Override log method to include default meta
    childLogger.log = (level, message, meta = {}) => {
      const combinedMeta = { ...childLogger.defaultMeta, ...meta };
      return this.log(level, message, combinedMeta);
    };
    
    return childLogger;
  }
  
  /**
   * Log HTTP request
   */
  logRequest(req, res, responseTime) {
    const meta = {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      requestId: req.id
    };
    
    const level = res.statusCode >= 500 ? 'error' : 
                  res.statusCode >= 400 ? 'warn' : 'info';
    
    this.log(level, `${req.method} ${req.url}`, meta);
  }
  
  /**
   * Log performance metrics
   */
  logPerformance(operation, duration, meta = {}) {
    this.log('info', `Performance: ${operation}`, {
      operation,
      duration: `${duration}ms`,
      ...meta
    });
  }
  
  /**
   * Log security events
   */
  logSecurity(event, meta = {}) {
    this.log('warn', `Security event: ${event}`, {
      securityEvent: event,
      timestamp: new Date().toISOString(),
      ...meta
    });
  }
  
  /**
   * Log business events
   */
  logBusiness(event, meta = {}) {
    this.log('info', `Business event: ${event}`, {
      businessEvent: event,
      ...meta
    });
  }
  
  /**
   * Start log rotation
   */
  startLogRotation() {
    if (!this.config.outputs.includes('file')) return;
    
    // Check log file sizes every hour
    setInterval(() => {
      this.rotateLogsIfNeeded();
    }, 60 * 60 * 1000);
  }
  
  /**
   * Rotate logs if files are too large
   */
  rotateLogsIfNeeded() {
    this.logStreams.forEach((stream, level) => {
      const logFile = path.join(this.config.logDirectory, `${level}.log`);
      
      try {
        const stats = fs.statSync(logFile);
        
        if (stats.size > this.config.maxFileSize) {
          this.rotateLogFile(level, logFile);
        }
      } catch (error) {
        // File might not exist yet, ignore
      }
    });
  }
  
  /**
   * Rotate specific log file
   */
  rotateLogFile(level, logFile) {
    try {
      // Close current stream
      const stream = this.logStreams.get(level);
      if (stream) {
        stream.end();
      }
      
      // Move files
      for (let i = this.config.maxFiles - 1; i > 0; i--) {
        const oldFile = `${logFile}.${i}`;
        const newFile = `${logFile}.${i + 1}`;
        
        if (fs.existsSync(oldFile)) {
          if (i === this.config.maxFiles - 1) {
            fs.unlinkSync(oldFile); // Delete oldest
          } else {
            fs.renameSync(oldFile, newFile);
          }
        }
      }
      
      // Move current log to .1
      if (fs.existsSync(logFile)) {
        fs.renameSync(logFile, `${logFile}.1`);
      }
      
      // Create new stream
      this.createLogStream(level);
      
      this.info(`Log rotated for level: ${level}`);
      
    } catch (error) {
      console.error(`Failed to rotate log file for ${level}:`, error);
    }
  }
  
  /**
   * Get logging metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Set log level dynamically
   */
  setLevel(level) {
    if (this.levels.hasOwnProperty(level)) {
      this.config.level = level;
      this.info(`Log level changed to: ${level}`);
    } else {
      this.warn(`Invalid log level: ${level}`);
    }
  }
  
  /**
   * Flush all log streams
   */
  flush() {
    this.logStreams.forEach(stream => {
      try {
        stream.write('');
      } catch (error) {
        // Ignore errors during flush
      }
    });
  }
  
  /**
   * Close all log streams
   */
  close() {
    this.logStreams.forEach(stream => {
      try {
        stream.end();
      } catch (error) {
        console.error('Error closing log stream:', error);
      }
    });
    
    this.logStreams.clear();
    this.info('Logging service closed');
  }
}

// Create default logger instance
const defaultLogger = new LoggingService();

// Export both class and default instance
module.exports = LoggingService;
module.exports.logger = defaultLogger;