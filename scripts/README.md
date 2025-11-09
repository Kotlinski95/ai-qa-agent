# 🛠️ Scripts Directory

This directory contains all shell scripts for managing the AI QA Agent project.

## 📁 Available Scripts

### Setup Scripts
- **`setup-sam.sh`** - Sets up AWS SAM CLI on macOS (lightweight installation)

### Deployment Scripts
- **`deploy.sh`** - Basic deployment script for Lambda functions
- **`deploy-with-refresh.sh`** - Enhanced deployment with scheduled content refresh

### Maintenance Scripts  
- **`trigger-refresh.sh`** - Manually trigger content refresh with different modes

## 🚀 NPM Script Commands

Instead of running shell scripts directly, you can use these convenient npm commands:

### Setup Commands
```bash
npm run setup              # Setup AWS SAM CLI
npm run setup:sam          # Alias for setup
```

### Build & Deploy Commands
```bash
npm run deploy             # Standard deployment
npm run deploy:enhanced    # Deploy with content refresh features
npm run deploy:build       # Build SAM application
npm run deploy:quick       # Quick deploy (build + deploy)
```

### Content Refresh Commands
```bash
npm run refresh            # Trigger daily refresh (incremental)
npm run refresh:daily      # Trigger daily refresh (incremental)
npm run refresh:weekly     # Trigger weekly refresh (full refresh)
npm run refresh:fast       # Trigger fast refresh (for testing)
```

### Development Commands
```bash
npm run build              # Build TypeScript
npm run watch              # Watch mode for TypeScript
npm run clean              # Clean build directory
npm run validate           # Validate SAM template
```

### Testing Commands
```bash
npm run start:local        # Start local development server
npm run start:sam          # Start SAM local API
npm run test:local         # Run local tests
npm run test:health        # Run health check tests
```

### Logging Commands
```bash
npm run logs               # View main function logs
npm run logs:stream        # View streaming function logs
npm run logs:refresh       # View content refresh function logs
```

### Cache Management
```bash
npm run cache:clear        # Clear cache
npm run cache:check        # Check cache status
```

## 💡 Examples

```bash
# Complete deployment workflow
npm run build
npm run validate
npm run deploy:enhanced

# Content refresh workflow
npm run refresh:weekly     # Force full refresh
npm run logs:refresh       # Monitor refresh logs

# Development workflow
npm run clean
npm run build
npm run start:local
```

## 📝 Notes

- All scripts automatically navigate to the project root directory
- Scripts use relative paths and work from any location
- Environment variables are loaded from `.env` in project root
- AWS CLI must be configured before running deployment scripts

## 🔧 Script Locations

All scripts are now organized in the `scripts/` directory:
- `scripts/setup-sam.sh`
- `scripts/deploy.sh` 
- `scripts/deploy-with-refresh.sh`
- `scripts/trigger-refresh.sh`