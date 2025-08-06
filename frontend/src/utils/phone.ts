/**
 * Phone Number Utilities for Frontend
 * Provides phone number normalization, validation, and formatting
 */

/**
 * Normalize phone number to E.164 format
 * @param phoneNumber - Raw phone number string
 * @param defaultCountry - Default country code (default: 'US')
 * @returns Normalized phone number in E.164 format
 */
export function normalizePhoneNumber(phoneNumber: string): string {
  if (!phoneNumber) {
    return '';
  }

  try {
    // Remove all non-digit characters except +
    let cleaned = phoneNumber.replace(/[^\d+]/g, '');
    
    // Handle North American numbers (US/CA)
    if (cleaned.match(/^\d{10}$/)) {
      // 10-digit number, assume North American
      cleaned = '+1' + cleaned;
    } else if (cleaned.match(/^1\d{10}$/)) {
      // 11-digit number starting with 1, add +
      cleaned = '+' + cleaned;
    } else if (!cleaned.startsWith('+') && cleaned.length >= 10) {
      // Add + if missing and assume North American for 10+ digits
      if (cleaned.length === 10 || (cleaned.length === 11 && cleaned.startsWith('1'))) {
        cleaned = '+1' + (cleaned.startsWith('1') ? cleaned.slice(1) : cleaned);
      } else {
        cleaned = '+' + cleaned;
      }
    }

    // Basic E.164 format validation
    if (cleaned.match(/^\+\d{10,15}$/)) {
      return cleaned;
    }

    console.warn(`⚠️  Could not normalize phone number: ${phoneNumber}`);
    return phoneNumber; // Return original if normalization fails

  } catch (error) {
    console.error(`❌ Phone normalization error for ${phoneNumber}:`, error);
    return phoneNumber; // Return original on error
  }
}

/**
 * Validate phone number format
 * @param phoneNumber - Phone number to validate
 * @returns True if the phone number appears to be valid
 */
export function validatePhoneNumber(phoneNumber: string): boolean {
  if (!phoneNumber) {
    return false;
  }

  try {
    const normalized = normalizePhoneNumber(phoneNumber);
    
    // Check if it's in valid E.164 format
    // E.164: + followed by 7-15 digits
    return /^\+\d{7,15}$/.test(normalized);
  } catch (error) {
    console.error(`❌ Phone validation error for ${phoneNumber}:`, error);
    return false;
  }
}

/**
 * Format phone number for display (US/CA format)
 * @param phoneNumber - Phone number to format
 * @returns Formatted phone number or original if formatting fails
 */
export function formatPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber) {
    return '';
  }

  try {
    const normalized = normalizePhoneNumber(phoneNumber);
    
    // Check if it's a North American number (+1...)
    if (normalized.startsWith('+1') && normalized.length === 12) {
      const digits = normalized.slice(2); // Remove +1
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    
    // For other international numbers, return as-is or with basic formatting
    if (normalized.startsWith('+')) {
      return normalized;
    }

    return phoneNumber; // Return original if we can't format it

  } catch (error) {
    console.error(`❌ Phone formatting error for ${phoneNumber}:`, error);
    return phoneNumber;
  }
}

/**
 * Check if phone number is likely a mobile number (basic heuristic for US/CA)
 * @param phoneNumber - Phone number to check
 * @returns True if it appears to be a mobile number
 */
export function isMobileNumber(phoneNumber: string): boolean {
  try {
    const normalized = normalizePhoneNumber(phoneNumber);
    
    // For US/CA numbers, check area code patterns
    // This is a basic heuristic - mobile area codes tend to be newer
    if (normalized.startsWith('+1') && normalized.length === 12) {
      const areaCode = normalized.slice(2, 5);
      
      // Common mobile/newer area codes (this is a simplified list)
      const mobileAreaCodes = [
        '201', '202', '203', '205', '206', '207', '208', '209', '210',
        '212', '213', '214', '215', '216', '217', '218', '219', '224',
        '225', '226', '228', '229', '231', '234', '239', '240', '248',
        '251', '252', '253', '254', '256', '260', '262', '267', '269',
        '270', '276', '281', '283', '301', '302', '303', '304', '305',
        '307', '308', '309', '310', '312', '313', '314', '315', '316',
        '317', '318', '319', '320', '321', '323', '325', '330', '331',
        '334', '336', '337', '339', '347', '351', '352', '360', '361',
        '386', '401', '402', '404', '405', '406', '407', '408', '409',
        '410', '412', '413', '414', '415', '417', '419', '423', '424',
        '425', '430', '432', '434', '435', '440', '443', '458', '469',
        '470', '475', '478', '479', '480', '484', '501', '502', '503',
        '504', '505', '507', '508', '509', '510', '512', '513', '515',
        '516', '517', '518', '520', '530', '540', '541', '551', '559',
        '561', '562', '563', '564', '567', '570', '571', '573', '574',
        '575', '580', '585', '586', '601', '602', '603', '605', '606',
        '607', '608', '609', '610', '612', '614', '615', '616', '617',
        '618', '619', '620', '623', '626', '630', '631', '636', '641',
        '646', '650', '651', '660', '661', '662', '667', '678', '682',
        '701', '702', '703', '704', '706', '707', '708', '712', '713',
        '714', '715', '716', '717', '718', '719', '720', '724', '727',
        '731', '732', '734', '737', '740', '754', '757', '760', '762',
        '763', '765', '770', '772', '773', '774', '775', '781', '785',
        '786', '787', '801', '802', '803', '804', '805', '806', '808',
        '810', '812', '813', '814', '815', '816', '817', '818', '828',
        '830', '831', '832', '843', '845', '847', '848', '850', '856',
        '857', '858', '859', '860', '862', '863', '864', '865', '870',
        '872', '878', '901', '903', '904', '906', '907', '908', '909',
        '910', '912', '913', '914', '915', '916', '917', '918', '919',
        '920', '925', '928', '929', '931', '934', '936', '937', '940',
        '941', '947', '949', '951', '952', '954', '956', '959', '970',
        '971', '972', '973', '978', '979', '980', '984', '985', '989'
      ];
      
      return mobileAreaCodes.includes(areaCode);
    }
    
    // For non-US numbers, assume it could be mobile
    return true;

  } catch (error) {
    console.error(`❌ Mobile check error for ${phoneNumber}:`, error);
    return false;
  }
}

/**
 * Mask phone number for privacy (show only last 4 digits)
 * @param phoneNumber - Phone number to mask
 * @returns Masked phone number
 */
export function maskPhoneNumber(phoneNumber: string): string {
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
 * Check if two phone numbers are the same
 * @param phone1 - First phone number
 * @param phone2 - Second phone number
 * @returns True if numbers are the same
 */
export function phoneNumbersEqual(phone1: string, phone2: string): boolean {
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
 * Extract area code from North American phone number
 * @param phoneNumber - Phone number
 * @returns Area code or empty string
 */
export function getAreaCode(phoneNumber: string): string {
  try {
    const normalized = normalizePhoneNumber(phoneNumber);
    
    // For North American numbers (+1AAANNNNNNN)
    if (normalized.startsWith('+1') && normalized.length === 12) {
      return normalized.slice(2, 5);
    }

    return '';

  } catch (error) {
    console.error(`❌ Area code extraction error for ${phoneNumber}:`, error);
    return '';
  }
}

/**
 * Generate a user-friendly display string for phone numbers
 * @param phoneNumber - Phone number
 * @param includeCountry - Whether to include country info for non-US numbers
 * @returns Formatted display string
 */
export function getDisplayString(phoneNumber: string, includeCountry: boolean = false): string {
  if (!phoneNumber) {
    return 'No phone number';
  }

  try {
    const normalized = normalizePhoneNumber(phoneNumber);
    
    // Format US/CA numbers nicely
    if (normalized.startsWith('+1') && normalized.length === 12) {
      const digits = normalized.slice(2);
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    
    // For other international numbers
    if (normalized.startsWith('+') && includeCountry) {
      return `${normalized} (International)`;
    }

    return normalized.startsWith('+') ? normalized : phoneNumber;

  } catch (error) {
    console.error(`❌ Display string error for ${phoneNumber}:`, error);
    return phoneNumber;
  }
}

/**
 * Real-time phone number formatting as user types
 * @param input - Current input value
 * @param previousValue - Previous input value (optional)
 * @returns Formatted string for display in input field
 */
export function formatAsUserTypes(input: string): string {
  if (!input) {
    return '';
  }

  // Remove all non-digit characters
  const digits = input.replace(/\D/g, '');

  // Handle different lengths for US formatting
  if (digits.length <= 3) {
    return digits;
  } else if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  } else if (digits.length <= 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    // Handle 11-digit numbers starting with 1
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 11)}`;
  } else {
    // For longer numbers, just add formatting up to 10 digits and show the rest
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}${digits.length > 10 ? ' ext.' + digits.slice(10) : ''}`;
  }
}

/**
 * Remove formatting from phone number (get just digits and +)
 * @param phoneNumber - Formatted phone number
 * @returns Clean digits with country code
 */
export function cleanPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber) {
    return '';
  }

  return phoneNumber.replace(/[^\d+]/g, '');
}