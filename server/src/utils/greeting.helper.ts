/**
 * Helper functions for generating dynamic greetings
 */

/**
 * Get time-based greeting (Pacific Time)
 */
export function getTimeBasedGreeting(): string {
  // Get current time in Pacific timezone
  const pacificTime = new Date().toLocaleString("en-US", {
    timeZone: "America/Vancouver",
    hour12: false,
    hour: "2-digit"
  });
  const hour = parseInt(pacificTime.substring(0, 2));
  
  if (hour < 5) return "Thanks for calling so late!";
  if (hour < 12) return "Good morning!";
  if (hour < 17) return "Good afternoon!";
  if (hour < 20) return "Good evening!";
  return "Thanks for calling!";
}

/**
 * Get day-specific context (Pacific Time)
 */
export function getDayContext(): string {
  // Get current date in Pacific timezone
  const pacificDate = new Date().toLocaleString("en-US", {
    timeZone: "America/Vancouver"
  });
  const date = new Date(pacificDate);
  const day = date.getDay();
  const hour = date.getHours();
  
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
 * Returns the appropriate way to address the customer
 */
export function getCustomerGreeting(customerName?: string, lastVisit?: Date | string): string {
  // No customer name - generic greeting
  if (!customerName) {
    return "";  // Empty string so it just says "Hey! I'm Mark..."
  }
  
  // Have customer name
  if (lastVisit) {
    // Convert string to Date if needed
    const visitDate = typeof lastVisit === 'string' ? new Date(lastVisit) : lastVisit;
    const daysSinceVisit = Math.floor((Date.now() - visitDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysSinceVisit === 0) {
      return `${customerName}`;  // Same day: "Hey Dev!"
    } else if (daysSinceVisit < 7) {
      return `${customerName}`;  // Recent: "Hey Dev!"
    } else {
      return `${customerName}`;  // Older: "Hey Dev!"
    }
  }
  
  return `${customerName}`;  // Default: "Hey Dev!"
}

/**
 * Generate a complete dynamic greeting context
 */
export function generateGreetingContext(lead?: any): Record<string, string> {
  const hasName = !!lead?.customer_name;
  const customerName = lead?.customer_name || "";
  
  return {
    time_greeting: getTimeBasedGreeting(),
    day_context: getDayContext(),
    weather_context: getWeatherGreeting(),
    customer_greeting: getCustomerGreeting(lead?.customer_name, lead?.last_contact_at),
    customer_name: customerName,  // Just the name: "Dev" or empty
    greeting_opener: hasName ? `Hey ${customerName}!` : "Hey there!",  // "Hey Dev!" or "Hey there!"
    greeting_variation: Math.random() > 0.5 ? "What can I help you with" : "How can I help you"
  };
}