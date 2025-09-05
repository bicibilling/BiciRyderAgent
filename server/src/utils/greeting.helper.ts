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
 * Create a complete dynamic greeting combining all elements
 * @param lead - Lead information
 * @param currentTime - Current time string
 * @param dayOfWeek - Current day of the week
 * @param businessHours - Current store hours status
 */
export function createDynamicGreeting(lead?: any, currentTime?: string, dayOfWeek?: string, businessHours?: string): string {
  const timeGreeting = getTimeBasedGreeting();
  const dayContext = getDayContext();
  const customerName = lead?.customer_name || "";
  const hasName = !!customerName;
  
  let greeting = "";
  
  // Start with time-based greeting
  if (hasName) {
    greeting = `${timeGreeting} ${customerName}!`;
  } else {
    greeting = `${timeGreeting}`;
  }
  
  // Add day context if available
  if (dayContext) {
    greeting += ` ${dayContext}`;
  }
  
  // Add store hours if relevant
  if (businessHours && (businessHours.includes("Closed") || businessHours.includes("Opens at"))) {
    greeting += ` Just so you know, we're ${businessHours.toLowerCase()}.`;
  }
  
  // Add introduction
  greeting += ` I'm Mark from BICI Bike Store. How can I help you today?`;
  
  return greeting;
}

/**
 * Generate a complete dynamic greeting context
 * @param lead - Lead information
 * @param isOutbound - Whether this is an outbound call (agent-initiated)
 * @param previousSummary - Previous conversation summary for context
 */
export function generateGreetingContext(lead?: any, isOutbound: boolean = false, previousSummary?: any): Record<string, string> {
  const hasName = !!lead?.customer_name;
  const customerName = lead?.customer_name || "";
  
  // For outbound calls, create continuation greetings
  if (isOutbound) {
    // Default variations for outbound calls
    const outboundVariations = [
      "I wanted to follow up with you",
      "Just calling to check in with you", 
      "I'm following up from our earlier chat",
      "Wanted to continue where we left off",
      "Just giving you a quick call back"
    ];
    
    // Start with a random default
    let variation = outboundVariations[Math.floor(Math.random() * outboundVariations.length)];
    
    // If we have a previous summary, make it more specific based on classification
    if (previousSummary?.call_classification) {
      const classification = previousSummary.call_classification.toLowerCase();
      
      // Also check the summary text for additional context
      const summaryText = previousSummary.summary?.toLowerCase() || '';
      
      if (classification === 'sales' || summaryText.includes('bike') || summaryText.includes('price')) {
        // Check if we know specific bike type from summary
        if (summaryText.includes('road bike')) {
          variation = "I'm calling about the road bike you were interested in";
        } else if (summaryText.includes('mountain bike')) {
          variation = "I'm calling about the mountain bike you were interested in";
        } else if (summaryText.includes('availability')) {
          variation = "I'm following up about the bike availability we discussed";
        } else {
          variation = "I'm calling about the bike you were interested in";
        }
      } else if (classification === 'service' || summaryText.includes('service') || summaryText.includes('repair')) {
        variation = "I'm calling about your service appointment";
      } else if (classification === 'support' || summaryText.includes('issue') || summaryText.includes('problem')) {
        variation = "I wanted to follow up on the issue you mentioned";
      } else if (classification === 'inquiry' || summaryText.includes('question')) {
        variation = "I'm following up on your questions from earlier";
      } else if (summaryText.includes('test ride')) {
        variation = "I'm calling about scheduling your test ride";
      } else if (summaryText.includes('return') || summaryText.includes('policy')) {
        variation = "I wanted to follow up on our discussion about our policies";
      } else {
        // For 'general' or unmatched, try to be more specific based on summary
        if (summaryText.length > 10) {
          variation = "I wanted to continue our conversation from earlier";
        }
      }
    }
    
    return {
      time_greeting: getTimeBasedGreeting(),
      day_context: getDayContext(),
      weather_context: getWeatherGreeting(),
      customer_greeting: getCustomerGreeting(lead?.customer_name, lead?.last_contact_at),
      customer_name: customerName,
      greeting_opener: hasName ? `Hey ${customerName}!` : "Hey!",
      greeting_variation: variation,
      is_outbound: "true",
      call_type: "outbound_followup"
    };
  }
  
  // Inbound call greetings (original behavior)
  return {
    time_greeting: getTimeBasedGreeting(),
    day_context: getDayContext(),
    weather_context: getWeatherGreeting(),
    customer_greeting: getCustomerGreeting(lead?.customer_name, lead?.last_contact_at),
    customer_name: customerName,  // Just the name: "Dev" or empty
    greeting_opener: hasName ? `Hey ${customerName}!` : "Hey there!",  // "Hey Dev!" or "Hey there!"
    greeting_variation: Math.random() > 0.5 ? "What can I help you with" : "How can I help you",
    is_outbound: "false",
    call_type: "inbound"
  };
}