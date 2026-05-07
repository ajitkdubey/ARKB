# Azure Static Web Apps Deployment

## Prerequisites
- Azure subscription
- SWA CLI installed: `npm install -g @azure/static-web-apps-cli`
- Deployment token from Azure Portal

## Setup Steps

1. **Install dependencies in dist folder:**
   ```bash
   cd dist
   npm install
   ```

2. **Create `.env` file** (copy from `.env.example`):
   ```bash
   cp .env.example .env
   # Edit .env with your Discord credentials
   ```

3. **Deploy with SWA:**
   ```bash
   swa deploy --deployment-token <your-deployment-token>
   ```

4. **Alternative - Deploy with SWA CLI and credentials:**
   ```bash
   swa deploy
   # Follow the interactive prompts to authenticate
   ```

## Environment Variables
Set these in your Azure Static Web Apps configuration:
- `DISCORD_TOKEN` - Your Discord bot token
- `DISCORD_USER_ID` - Your Discord user ID  
- `DISCORD_GUILD_ID` - Your Discord guild/server ID

## Troubleshooting
- Ensure `package.json` exists in dist/
- Check that all dependencies install without errors
- Verify Azure Static Web Apps tier supports Node.js apps (Standard or higher)
- For Socket.IO, ensure your App Service Plan supports WebSocket connections
