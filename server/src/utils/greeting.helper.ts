/**
 * Helper functions for generating dynamic greetings
 */

/**
 * Get time-based greeting
 */
export function getTimeBasedGreeting(): string {
  const hour = new Date().getHours();
  
  if (hour < 5) return "Thanks for calling so late!";
  if (hour < 12) return "Good morning!";
  if (hour < 17) return "Good afternoon!";
  if (hour < 20) return "Good evening!";
  return "Thanks for calling!";
}

/**
 * Get day-specific context
 */
export function getDayContext(): string {
  const day = new Date().getDay();
  const hour = new Date().getHours();
  
  // Weekend
  if (day === 0 || day === 6) {
    return "Hope you're enjoying your weekend!";
  }
  
  // Monday
  if (day === 1) {
    return "Hope you had a great weekend!";
  }
  
  // Friday
  if (day === 5 && hour > 12) {
    return "Happy Friday!";
  }
  
  return "";
}

/**
 * Get weather-based greeting (could integrate with weather API)
 */
export function getWeatherGreeting(): string {
  // This could be enhanced with actual weather API
  const month = new Date().getMonth();
  
  // Summer months (June-August)
  if (month >= 5 && month <= 7) {
    return "Perfect weather for a bike ride!";
  }
  
  // Spring (March-May)
  if (month >= 2 && month <= 4) {
    return "Spring is here - great time to get on a bike!";
  }
  
  // Fall (September-November)
  if (month >= 8 && month <= 10) {
    return "Beautiful fall weather for cycling!";
  }
  
  // Winter (December-February)
  return "Stay warm out there!";
}

/**
 * Get customer-specific greeting
 */
export function getCustomerGreeting(customerName?: string, lastVisit?: Date | string): string {
  if (!customerName) {
    return "there";
  }
  
  if (lastVisit) {
    // Convert string to Date if needed
    const visitDate = typeof lastVisit === 'string' ? new Date(lastVisit) : lastVisit;
    const daysSinceVisit = Math.floor((Date.now() - visitDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysSinceVisit === 0) {
      return `back ${customerName}`;
    } else if (daysSinceVisit < 7) {
      return `${customerName}, good to hear from you again`;
    } else if (daysSinceVisit < 30) {
      return `${customerName}, welcome back`;
    }
  }
  
  return customerName;
}

/**
 * Generate a complete dynamic greeting context
 */
export function generateGreetingContext(lead?: any): Record<string, string> {
  return {
    time_greeting: getTimeBasedGreeting(),
    day_context: getDayContext(),
    weather_context: getWeatherGreeting(),
    customer_greeting: getCustomerGreeting(lead?.customer_name, lead?.last_contact_at),
    greeting_variation: Math.random() > 0.5 ? "What can I help you with" : "How can I help you"
  };
}