const moment = require('moment-timezone');

class StoreHoursService {
  constructor() {
    this.timezone = process.env.STORE_TIMEZONE || 'America/Vancouver';
    this.storeHours = {
      monday: { open: '08:00', close: '18:00' },
      tuesday: { open: '08:00', close: '18:00' },
      wednesday: { open: '08:00', close: '18:00' },
      thursday: { open: '08:00', close: '18:00' },
      friday: { open: '08:00', close: '18:00' },
      saturday: { open: '09:00', close: '16:30' },
      sunday: { open: '09:00', close: '16:30' }
    };
    
    // Holiday overrides can be added here
    this.holidayOverrides = {
      // '2024-12-25': { closed: true, reason: 'Christmas Day' },
      // '2024-01-01': { closed: true, reason: 'New Year\'s Day' }
    };
  }

  getCurrentDateTime() {
    return moment().tz(this.timezone);
  }

  getCurrentStatus() {
    const now = this.getCurrentDateTime();
    const dayName = now.format('dddd').toLowerCase();
    const currentTime = now.format('HH:mm');
    const dateKey = now.format('YYYY-MM-DD');

    // Check for holiday overrides
    if (this.holidayOverrides[dateKey]) {
      const override = this.holidayOverrides[dateKey];
      if (override.closed) {
        return {
          isOpen: false,
          dayName: now.format('dddd'),
          date: now.format('MMMM Do'),
          currentTime,
          closedReason: override.reason,
          isHoliday: true,
          nextOpen: this.getNextOpenTime(now)
        };
      }
    }

    const todayHours = this.storeHours[dayName];
    if (!todayHours) {
      return {
        isOpen: false,
        dayName: now.format('dddd'),
        date: now.format('MMMM Do'),
        currentTime,
        error: 'No hours defined for this day'
      };
    }

    const openTime = moment.tz(`${now.format('YYYY-MM-DD')} ${todayHours.open}`, this.timezone);
    const closeTime = moment.tz(`${now.format('YYYY-MM-DD')} ${todayHours.close}`, this.timezone);
    
    const isOpen = now.isBetween(openTime, closeTime, null, '[]');
    
    let nextOpen = null;
    let nextClose = null;
    
    if (isOpen) {
      nextClose = closeTime;
    } else {
      nextOpen = this.getNextOpenTime(now);
    }

    return {
      isOpen,
      dayName: now.format('dddd'),
      date: now.format('MMMM Do'),
      currentTime,
      todayHours: {
        open: todayHours.open,
        close: todayHours.close,
        openFormatted: openTime.format('h:mm A'),
        closeFormatted: closeTime.format('h:mm A')
      },
      nextOpen,
      nextClose,
      timezone: this.timezone
    };
  }

  getNextOpenTime(fromTime) {
    let checkDate = fromTime.clone().add(1, 'day');
    
    // Check next 7 days for the next open time
    for (let i = 0; i < 7; i++) {
      const dayName = checkDate.format('dddd').toLowerCase();
      const dateKey = checkDate.format('YYYY-MM-DD');
      
      // Skip holidays
      if (this.holidayOverrides[dateKey] && this.holidayOverrides[dateKey].closed) {
        checkDate.add(1, 'day');
        continue;
      }
      
      const dayHours = this.storeHours[dayName];
      if (dayHours) {
        const openTime = moment.tz(`${checkDate.format('YYYY-MM-DD')} ${dayHours.open}`, this.timezone);
        return {
          dayName: checkDate.format('dddd'),
          date: checkDate.format('MMMM Do'),
          time: dayHours.open,
          timeFormatted: openTime.format('h:mm A'),
          fullDateTime: openTime
        };
      }
      
      checkDate.add(1, 'day');
    }
    
    return null;
  }

  formatGreeting() {
    const status = this.getCurrentStatus();
    
    if (status.isOpen) {
      return `Today is ${status.dayName}, ${status.date}, and we're open until ${status.todayHours.closeFormatted}`;
    } else {
      if (status.isHoliday) {
        return `Today is ${status.dayName}, ${status.date}, and we're closed for ${status.closedReason}. ${status.nextOpen ? `We'll reopen on ${status.nextOpen.dayName} at ${status.nextOpen.timeFormatted}` : ''}`;
      }
      
      const tomorrow = status.nextOpen;
      if (tomorrow) {
        return `Today is ${status.dayName}, ${status.date}, and we're closed now. We were open until ${status.todayHours.closeFormatted} today and will reopen ${tomorrow.dayName === 'tomorrow' ? 'tomorrow' : `on ${tomorrow.dayName}`} from ${tomorrow.time} to ${this.storeHours[tomorrow.dayName.toLowerCase()]?.close}`;
      }
      
      return `Today is ${status.dayName}, ${status.date}, and we're closed now`;
    }
  }

  // Method to add holiday override
  addHolidayOverride(date, override) {
    this.holidayOverrides[date] = override;
  }

  // Method to check if Quebec area code (for French detection)
  isQuebecAreaCode(phoneNumber) {
    const quebecCodes = (process.env.QUEBEC_AREA_CODES || '418,438,450,514,579,581,819,873').split(',');
    
    if (!phoneNumber) return false;
    
    // Extract area code from phone number
    const areaCodeMatch = phoneNumber.match(/^\+?1?(\d{3})/);
    if (areaCodeMatch) {
      return quebecCodes.includes(areaCodeMatch[1]);
    }
    
    return false;
  }
}

module.exports = new StoreHoursService();