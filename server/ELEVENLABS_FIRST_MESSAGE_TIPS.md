# ElevenLabs First Message Customization Tips

Since ElevenLabs doesn't allow overriding the first_message field anymore, here are some workarounds:

## Option 1: Use Dynamic Variables in the First Message (Recommended)
Configure your first message in the ElevenLabs dashboard with dynamic variables:

```
Hey there! I'm {{agent_name}} from {{store_name}}. {{greeting_context}} How can I help you today?
```

Then pass these at runtime:
```javascript
dynamic_variables: {
  agent_name: "Mark",
  store_name: "BICI",
  greeting_context: getTimeBasedGreeting() // "Good morning!" / "Beautiful afternoon!" etc.
}
```

## Option 2: Time-Based Dynamic Greetings
Create a function that returns different greetings based on time:

```javascript
function getTimeBasedGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning!";
  if (hour < 17) return "Good afternoon!";
  return "Good evening!";
}
```

## Option 3: Use Customer Context
If it's a returning customer, you can pass context:

```
Hey {{customer_greeting}}! I'm Mark from BICI. {{context_message}} How can I help you today?
```

Where:
- `customer_greeting`: "there" for new customers, or their name for returning ones
- `context_message`: "Welcome back!" or "Thanks for calling!" or reference to previous conversation

## Option 4: Natural Variations
Make the first message more conversational and natural:

Instead of:
```
"Hello, I'm Mark from BICI. How can I help you today?"
```

Try:
```
"Hey there! Mark here from BICI - what can I help you with today?"
"Hi! This is Mark at BICI - what brings you in today?"
"Hey! Mark from BICI here - looking for something specific today?"
```

## Option 5: Silence-First Approach
Leave the first message empty in the dashboard. The agent will wait for the customer to speak first, then respond naturally based on what they say. This can feel more natural for some use cases.

## Implementation in Code

In your webhook, you're already passing dynamic variables:
```javascript
dynamic_variables: {
  customer_name: lead.customer_name || "",
  greeting_time: getTimeBasedGreeting(),
  last_topic: previousConversation?.topic || "bikes",
  // Add more context variables
}
```

## Best Practices
1. Keep it short and natural - people expect quick greetings
2. Use the customer's name if you have it
3. Reference context when appropriate (returning customers)
4. Match your brand voice consistently
5. Test different variations to see what converts best

## Note on Overrides
While ElevenLabs used to support first_message overrides, they've restricted this for security/consistency. The dynamic variables approach is now the recommended way to customize messages at runtime.