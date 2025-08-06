/**
 * BICI AI Voice System - Phone Number Utilities
 * Phone number normalization and validation functions
 */

const { parsePhoneNumber, isValidPhoneNumber } = require('libphonenumber-js');

/**
 * Normalize phone number to E.164 format
 * @param {string} phoneNumber - Raw phone number
 * @param {string} defaultCountry - Default country code (default: 'US')
 * @returns {string} - Normalized phone number in E.164 format
 */
function normalizePhoneNumber(phoneNumber, defaultCountry = 'US') {
  if (!phoneNumber) {
    return '';
  }

  try {
    // Remove all non-digit characters except +
    let cleaned = phoneNumber.replace(/[^\d+]/g, '');
    
    // Handle North American numbers
    if (cleaned.match(/^\d{10}$/)) {
      // 10-digit number, assume North American
      cleaned = '+1' + cleaned;
    } else if (cleaned.match(/^1\d{10}$/)) {
      // 11-digit number starting with 1, add +
      cleaned = '+' + cleaned;
    } else if (!cleaned.startsWith('+') && cleaned.length >= 10) {
      // Add + if missing
      cleaned = '+' + cleaned;
    }

    // Parse and format using libphonenumber-js
    const parsedNumber = parsePhoneNumber(cleaned, defaultCountry);
    
    if (parsedNumber && parsedNumber.isValid()) {
      return parsedNumber.format('E.164');
    }

    // Fallback: return cleaned number if parsing fails but looks valid
    if (cleaned.match(/^\+\d{10,15}$/)) {
      return cleaned;
    }

    console.warn(`⚠️  Could not normalize phone number: ${phoneNumber}`);
    return phoneNumber; // Return original if all else fails

  } catch (error) {
    console.error(`❌ Phone normalization error for ${phoneNumber}:`, error);
    return phoneNumber; // Return original on error
  }
}

/**
 * Validate phone number
 * @param {string} phoneNumber - Phone number to validate
 * @param {string} defaultCountry - Default country code
 * @returns {boolean} - True if valid
 */
function validatePhoneNumber(phoneNumber, defaultCountry = 'US') {
  if (!phoneNumber) {
    return false;
  }

  try {
    const normalized = normalizePhoneNumber(phoneNumber, defaultCountry);
    return isValidPhoneNumber(normalized);
  } catch (error) {
    console.error(`❌ Phone validation error for ${phoneNumber}:`, error);
    return false;
  }
}

/**
 * Format phone number for display
 * @param {string} phoneNumber - Phone number to format
 * @param {string} format - Format type ('NATIONAL', 'INTERNATIONAL', 'E.164')
 * @param {string} defaultCountry - Default country code
 * @returns {string} - Formatted phone number
 */
function formatPhoneNumber(phoneNumber, format = 'NATIONAL', defaultCountry = 'US') {
  if (!phoneNumber) {
    return '';
  }

  try {
    const parsedNumber = parsePhoneNumber(phoneNumber, defaultCountry);
    
    if (parsedNumber && parsedNumber.isValid()) {
      return parsedNumber.format(format);
    }

    return phoneNumber; // Return original if parsing fails

  } catch (error) {
    console.error(`❌ Phone formatting error for ${phoneNumber}:`, error);
    return phoneNumber;
  }
}

/**
 * Extract country code from phone number
 * @param {string} phoneNumber - Phone number
 * @returns {string} - Country code (e.g., 'US', 'CA', 'FR')
 */
function getPhoneNumberCountry(phoneNumber) {
  try {
    const parsedNumber = parsePhoneNumber(phoneNumber);
    
    if (parsedNumber && parsedNumber.isValid()) {
      return parsedNumber.country || 'US';
    }

    return 'US'; // Default to US

  } catch (error) {
    console.error(`❌ Country extraction error for ${phoneNumber}:`, error);
    return 'US';
  }
}

/**
 * Check if phone number is mobile/cellular
 * @param {string} phoneNumber - Phone number to check
 * @returns {boolean} - True if mobile
 */
function isMobileNumber(phoneNumber) {
  try {
    const parsedNumber = parsePhoneNumber(phoneNumber);
    
    if (parsedNumber && parsedNumber.isValid()) {
      return parsedNumber.getType() === 'MOBILE';
    }

    return false;

  } catch (error) {
    console.error(`❌ Mobile check error for ${phoneNumber}:`, error);
    return false;
  }
}

/**
 * Mask phone number for privacy (show only last 4 digits)
 * @param {string} phoneNumber - Phone number to mask
 * @returns {string} - Masked phone number
 */
function maskPhoneNumber(phoneNumber) {
  if (!phoneNumber) {
    return '';
  }

  try {
    const normalized = normalizePhoneNumber(phoneNumber);
    
    if (normalized.length >= 4) {
      const lastFour = normalized.slice(-4);
      const masked = '*'.repeat(normalized.length - 4) + lastFour;
      return masked;
    }

    return phoneNumber;

  } catch (error) {
    console.error(`❌ Phone masking error for ${phoneNumber}:`, error);
    return '****';
  }
}

/**
 * Generate phone number variations for lookup
 * Useful for finding customers who might have entered their number differently
 * @param {string} phoneNumber - Base phone number
 * @returns {Array} - Array of phone number variations
 */
function generatePhoneVariations(phoneNumber) {
  if (!phoneNumber) {
    return [];
  }

  const variations = new Set();
  
  try {
    const normalized = normalizePhoneNumber(phoneNumber);
    variations.add(normalized);
    
    // Add original number
    variations.add(phoneNumber);
    
    // Parse the number
    const parsedNumber = parsePhoneNumber(normalized);
    
    if (parsedNumber && parsedNumber.isValid()) {
      // Add different formats
      variations.add(parsedNumber.format('E.164'));
      variations.add(parsedNumber.format('NATIONAL'));
      variations.add(parsedNumber.format('INTERNATIONAL'));
      
      // Add number without country code (for US/CA numbers)
      if (parsedNumber.country === 'US' || parsedNumber.country === 'CA') {
        const nationalNumber = parsedNumber.nationalNumber.toString();
        variations.add(nationalNumber);
        variations.add(`(${nationalNumber.slice(0,3)}) ${nationalNumber.slice(3,6)}-${nationalNumber.slice(6)}`);
        variations.add(`${nationalNumber.slice(0,3)}-${nationalNumber.slice(3,6)}-${nationalNumber.slice(6)}`);
        variations.add(`${nationalNumber.slice(0,3)}.${nationalNumber.slice(3,6)}.${nationalNumber.slice(6)}`);
      }
    }

  } catch (error) {
    console.error(`❌ Phone variations error for ${phoneNumber}:`, error);
  }

  return Array.from(variations).filter(v => v && v.length >= 10);
}

/**
 * Check if two phone numbers are the same
 * @param {string} phone1 - First phone number
 * @param {string} phone2 - Second phone number
 * @returns {boolean} - True if numbers are the same
 */
function phoneNumbersEqual(phone1, phone2) {
  if (!phone1 || !phone2) {
    return false;
  }

  try {
    const normalized1 = normalizePhoneNumber(phone1);
    const normalized2 = normalizePhoneNumber(phone2);
    
    return normalized1 === normalized2;

  } catch (error) {
    console.error(`❌ Phone comparison error:`, error);
    return false;
  }
}

/**
 * Extract area code from phone number
 * @param {string} phoneNumber - Phone number
 * @returns {string} - Area code or empty string
 */
function getAreaCode(phoneNumber) {
  try {
    const parsedNumber = parsePhoneNumber(phoneNumber);
    
    if (parsedNumber && parsedNumber.isValid()) {
      const nationalNumber = parsedNumber.nationalNumber.toString();
      
      // For North American numbers, area code is first 3 digits
      if ((parsedNumber.country === 'US' || parsedNumber.country === 'CA') && nationalNumber.length === 10) {
        return nationalNumber.slice(0, 3);
      }
    }

    return '';

  } catch (error) {
    console.error(`❌ Area code extraction error for ${phoneNumber}:`, error);
    return '';
  }
}

/**
 * Check if phone number is from a specific region/area code
 * @param {string} phoneNumber - Phone number to check
 * @param {string} areaCode - Area code to match against
 * @returns {boolean} - True if number is from the specified area code
 */
function isFromAreaCode(phoneNumber, areaCode) {
  const numberAreaCode = getAreaCode(phoneNumber);
  return numberAreaCode === areaCode;
}

/**
 * Generate a formatted display string for phone numbers
 * @param {string} phoneNumber - Phone number
 * @param {boolean} includeCountry - Whether to include country in display
 * @returns {string} - Formatted display string
 */
function getDisplayString(phoneNumber, includeCountry = false) {
  if (!phoneNumber) {
    return 'No phone number';
  }

  try {
    const parsedNumber = parsePhoneNumber(phoneNumber);
    
    if (parsedNumber && parsedNumber.isValid()) {
      const country = parsedNumber.country;
      const formatted = parsedNumber.format('NATIONAL');
      
      if (includeCountry && country && country !== 'US') {
        return `${formatted} (${country})`;
      }
      
      return formatted;
    }

    return phoneNumber;

  } catch (error) {
    console.error(`❌ Display string error for ${phoneNumber}:`, error);
    return phoneNumber;
  }
}

module.exports = {
  normalizePhoneNumber,
  validatePhoneNumber,
  formatPhoneNumber,
  getPhoneNumberCountry,
  isMobileNumber,
  maskPhoneNumber,
  generatePhoneVariations,
  phoneNumbersEqual,
  getAreaCode,
  isFromAreaCode,
  getDisplayString
};