#!/bin/bash

echo "🚀 Deploying Ryder AI Agent to Render..."

# Check if render CLI is authenticated
if ! ~/.local/bin/render whoami > /dev/null 2>&1; then
    echo "❌ Not authenticated with Render. Please run:"
    echo "   ~/.local/bin/render login"
    exit 1
fi

# Deploy using render.yaml configuration
echo "📦 Deploying services via render.yaml..."
~/.local/bin/render deploy

if [ $? -eq 0 ]; then
    echo "✅ Deployment successful!"
    echo ""
    echo "🌐 Your services will be available at:"
    echo "   • Dashboard: https://your-app-name.onrender.com"
    echo "   • API: https://your-api-name.onrender.com"
    echo ""
    echo "📞 Next steps:"
    echo "   1. Update ElevenLabs webhooks to use your Render URLs"
    echo "   2. Update Twilio webhooks to use your Render URLs"
    echo "   3. Set environment variables in Render dashboard"
    echo "   4. Test voice calls to +1 (604) 670-0262"
else
    echo "❌ Deployment failed. Check the output above for details."
    exit 1
fi