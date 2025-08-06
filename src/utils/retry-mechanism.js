const { logger } = require('../config/logger');

class RetryMechanism {
  constructor() {
    this.logger = logger.child({ component: 'retry-mechanism' });
  }

  /**
   * Retry function with exponential backoff
   */
  async retry(
    fn, 
    options = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffFactor: 2,
      jitter: true,
      retryCondition: null
    }
  ) {
    const {
      maxRetries = 3,
      baseDelay = 1000,
      maxDelay = 10000,
      backoffFactor = 2,
      jitter = true,
      retryCondition = this.defaultRetryCondition
    } = options;

    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        const result = await fn();
        
        if (attempt > 1) {
          this.logger.info('Operation succeeded after retry', {
            attempt,
            totalAttempts: maxRetries + 1
          });
        }
        
        return result;
        
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries + 1) {
          this.logger.error('All retry attempts failed', {
            totalAttempts: maxRetries + 1,
            finalError: error.message
          });
          throw error;
        }

        // Check if error should be retried
        if (!retryCondition(error)) {
          this.logger.warn('Error not retryable, failing immediately', {
            error: error.message,
            attempt
          });
          throw error;
        }

        // Calculate delay with exponential backoff
        let delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt - 1), maxDelay);
        
        // Add jitter to prevent thundering herd
        if (jitter) {
          delay = delay * (0.5 + Math.random() * 0.5);
        }

        this.logger.warn('Operation failed, retrying', {
          attempt,
          maxRetries: maxRetries + 1,
          error: error.message,
          delayMs: Math.round(delay)
        });

        await this.sleep(delay);
      }
    }
    
    throw lastError;
  }

  /**
   * Retry specifically for HTTP requests
   */
  async retryHttpRequest(requestFn, options = {}) {
    const httpOptions = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffFactor: 2,
      jitter: true,
      retryCondition: this.httpRetryCondition,
      ...options
    };

    return this.retry(requestFn, httpOptions);
  }

  /**
   * Retry for database operations
   */
  async retryDatabaseOperation(dbFn, options = {}) {
    const dbOptions = {
      maxRetries: 5,
      baseDelay: 500,
      maxDelay: 5000,
      backoffFactor: 1.5,
      jitter: true,
      retryCondition: this.databaseRetryCondition,
      ...options
    };

    return this.retry(dbFn, dbOptions);
  }

  /**
   * Retry for integration API calls
   */
  async retryIntegrationCall(integrationFn, integration, options = {}) {
    const integrationOptions = {
      maxRetries: 3,
      baseDelay: 2000,
      maxDelay: 15000,
      backoffFactor: 2,
      jitter: true,
      retryCondition: this.integrationRetryCondition,
      ...options
    };

    try {
      return await this.retry(integrationFn, integrationOptions);
    } catch (error) {
      this.logger.error(`${integration} integration failed after all retries`, {
        integration,
        error: error.message,
        attempts: integrationOptions.maxRetries + 1
      });
      
      // Return integration-specific error response
      return this.createIntegrationErrorResponse(error, integration);
    }
  }

  /**
   * Default retry condition
   */
  defaultRetryCondition(error) {
    // Retry on temporary/network errors
    const retryableErrors = [
      'ECONNRESET',
      'ENOTFOUND', 
      'ECONNREFUSED',
      'ETIMEDOUT',
      'EPIPE',
      'ECONNABORTED'
    ];

    // Check error code
    if (error.code && retryableErrors.includes(error.code)) {
      return true;
    }

    // Check HTTP status codes (if it's an HTTP error)
    if (error.response && error.response.status) {
      const status = error.response.status;
      // Retry on 5xx server errors and some 4xx client errors
      return status >= 500 || status === 408 || status === 429;
    }

    // Default to not retrying
    return false;
  }

  /**
   * HTTP request specific retry condition
   */
  httpRetryCondition(error) {
    // Don't retry on 4xx errors (except 408, 429)
    if (error.response && error.response.status) {
      const status = error.response.status;
      if (status >= 400 && status < 500) {
        return status === 408 || status === 429;
      }
    }

    return this.defaultRetryCondition(error);
  }

  /**
   * Database specific retry condition
   */
  databaseRetryCondition(error) {
    const retryableDbErrors = [
      'connection timeout',
      'connection refused',
      'connection lost',
      'deadlock',
      'lock timeout',
      'temporary failure'
    ];

    const errorMessage = error.message.toLowerCase();
    return retryableDbErrors.some(retryableError => 
      errorMessage.includes(retryableError)
    ) || this.defaultRetryCondition(error);
  }

  /**
   * Integration specific retry condition
   */
  integrationRetryCondition(error) {
    // Integration APIs specific conditions
    if (error.response && error.response.status) {
      const status = error.response.status;
      
      // Don't retry on authentication errors
      if (status === 401 || status === 403) {
        return false;
      }
      
      // Don't retry on not found or bad request
      if (status === 404 || status === 400) {
        return false;
      }
      
      // Retry on rate limits, server errors, and timeouts
      return status === 429 || status >= 500 || status === 408;
    }

    return this.defaultRetryCondition(error);
  }

  /**
   * Create circuit breaker for integration calls
   */
  createCircuitBreaker(name, options = {}) {
    const {
      failureThreshold = 5,
      resetTimeout = 60000,
      monitoringPeriod = 60000
    } = options;

    return new CircuitBreaker(name, {
      failureThreshold,
      resetTimeout,
      monitoringPeriod,
      logger: this.logger
    });
  }

  /**
   * Sleep utility function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create error response for failed integrations
   */
  createIntegrationErrorResponse(error, integration) {
    return {
      success: false,
      error: `${integration} service temporarily unavailable`,
      message: 'Please try again later or contact support if the issue persists',
      integration,
      retry_after: 60,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Batch retry for multiple operations
   */
  async retryBatch(operations, options = {}) {
    const {
      concurrency = 3,
      failFast = false,
      ...retryOptions
    } = options;

    const results = [];
    const errors = [];

    // Process in batches
    for (let i = 0; i < operations.length; i += concurrency) {
      const batch = operations.slice(i, i + concurrency);
      
      const batchPromises = batch.map(async (operation, index) => {
        try {
          const result = await this.retry(operation.fn, {
            ...retryOptions,
            ...operation.retryOptions
          });
          
          return { 
            success: true, 
            result, 
            index: i + index,
            operation: operation.name || `operation_${i + index}`
          };
          
        } catch (error) {
          const errorResult = {
            success: false,
            error: error.message,
            index: i + index,
            operation: operation.name || `operation_${i + index}`
          };
          
          if (failFast) {
            throw error;
          }
          
          return errorResult;
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach(result => {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            results.push(result.value);
          } else {
            errors.push(result.value);
          }
        } else {
          errors.push({
            success: false,
            error: result.reason.message,
            operation: 'unknown'
          });
        }
      });
    }

    this.logger.info('Batch retry completed', {
      totalOperations: operations.length,
      successful: results.length,
      failed: errors.length
    });

    return {
      success: errors.length === 0,
      results,
      errors,
      summary: {
        total: operations.length,
        successful: results.length,
        failed: errors.length
      }
    };
  }
}

/**
 * Simple Circuit Breaker implementation
 */
class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000;
    this.monitoringPeriod = options.monitoringPeriod || 60000;
    this.logger = options.logger || console;
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        this.logger.info('Circuit breaker transitioning to HALF_OPEN', { name: this.name });
      } else {
        throw new Error(`Circuit breaker is OPEN for ${this.name}`);
      }
    }

    try {
      const result = await fn();
      
      this.onSuccess();
      return result;
      
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failures = 0;
    
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 3) { // Require 3 successes to close
        this.state = 'CLOSED';
        this.logger.info('Circuit breaker CLOSED', { name: this.name });
      }
    }
  }

  onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      this.logger.warn('Circuit breaker OPENED', { 
        name: this.name,
        failures: this.failures 
      });
    }
  }

  getState() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime
    };
  }
}

module.exports = new RetryMechanism();