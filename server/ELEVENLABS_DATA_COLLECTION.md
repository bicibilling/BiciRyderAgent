# ElevenLabs Data Collection Configuration

Add these data collection fields in your ElevenLabs Agent dashboard under **Analysis > Data Collection**:

## 1. Call Classification
- **ID**: `call_classification`
- **Type**: `string`
- **Description**: `Classify the call type: sales, service, support, or general`
- **Schema**: 
```json
{
  "type": "string",
  "enum": ["sales", "service", "support", "general"],
  "description": "Classify the call based on customer intent"
}
```

## 2. Customer Triggers
- **ID**: `customer_triggers`
- **Type**: `array`
- **Description**: `What specific things did the customer ask about`
- **Schema**:
```json
{
  "type": "array",
  "items": {
    "type": "string",
    "enum": [
      "asked_hours",
      "asked_directions", 
      "asked_price",
      "wants_appointment",
      "wants_test_ride",
      "has_complaint",
      "needs_help"
    ]
  }
}
```

## 3. Follow-up Needed
- **ID**: `follow_up_needed`
- **Type**: `string`
- **Description**: `What follow-up SMS should we send after the call`
- **Schema**:
```json
{
  "type": "string",
  "enum": [
    "send_hours",
    "send_directions",
    "send_price_list",
    "confirm_appointment",
    "manager_callback",
    "thank_you",
    "none"
  ]
}
```

## Existing Fields to Keep:
- customer_name
- riding_experience  
- purchase_timeline
- bike_type
- budget_range

The ElevenLabs agent will intelligently extract these during the conversation and we'll use them directly in our SMS automation.