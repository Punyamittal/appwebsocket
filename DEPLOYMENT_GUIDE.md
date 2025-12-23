# Skip On - Deployment Guide

## Pre-Deployment Checklist

### ✅ Backend Preparation
- [ ] Set strong SECRET_KEY in environment
- [ ] Configure production MongoDB URL
- [ ] Add email service integration (SendGrid/AWS SES)
- [ ] Set up Redis for OTP storage (optional but recommended)
- [ ] Configure CORS for production domain
- [ ] Enable MongoDB authentication
- [ ] Set up SSL/TLS certificate
- [ ] Add error logging (Sentry)
- [ ] Configure rate limiting
- [ ] Set up database backups

### ✅ Frontend Preparation
- [ ] Update app.json with proper app name, package name
- [ ] Add app icon (1024x1024 PNG)
- [ ] Add splash screen
- [ ] Configure push notifications (optional)
- [ ] Update EXPO_PUBLIC_BACKEND_URL to production
- [ ] Create Privacy Policy page
- [ ] Create Terms of Service page
- [ ] Prepare store screenshots (iOS & Android)
- [ ] Write app description
- [ ] Choose app category

### ✅ Legal Requirements
- [ ] Privacy Policy (mandatory)
- [ ] Terms of Service (mandatory)
- [ ] Content rating declaration
- [ ] Age restriction policy
- [ ] Data collection disclosure
- [ ] User safety guidelines

## Backend Deployment

### Option 1: Render.com (Recommended for MVP)

1. **Create New Web Service**
   ```
   Name: skip-on-backend
   Environment: Python 3
   Build Command: pip install -r requirements.txt
   Start Command: uvicorn server:socket_app --host 0.0.0.0 --port $PORT
   ```

2. **Environment Variables**
   ```
   MONGO_URL=mongodb+srv://username:password@cluster.mongodb.net/skip_on_db
   DB_NAME=skip_on_db
   SECRET_KEY=your-super-secret-key-here
   SENDGRID_API_KEY=your-sendgrid-key (if using email)
   ```

3. **Enable WebSocket Support**
   - Render automatically supports WebSocket connections
   - No additional configuration needed

### Option 2: Railway.app

1. **Deploy from GitHub**
   - Connect your repository
   - Railway auto-detects Python
   - Set environment variables in dashboard

2. **Configure Port**
   ```bash
   PORT=8001
   ```

### Option 3: DigitalOcean App Platform

1. **Create App**
   - Choose Python
   - Set build and run commands
   - Configure environment variables

2. **Add MongoDB**
   - Use managed MongoDB cluster
   - Or deploy MongoDB separately

## MongoDB Setup

### Option 1: MongoDB Atlas (Recommended)

1. **Create Free Cluster**
   - Go to mongodb.com/cloud/atlas
   - Create M0 (free) cluster
   - Choose region closest to your users

2. **Configure Access**
   - Network Access: Add 0.0.0.0/0 (or specific IPs)
   - Database Access: Create database user
   - Get connection string

3. **Connection String Format**
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/skip_on_db?retryWrites=true&w=majority
   ```

### Option 2: Self-Hosted MongoDB

1. **DigitalOcean Droplet**
   - Ubuntu 22.04 LTS
   - Install MongoDB
   - Configure firewall
   - Enable authentication

2. **Security**
   ```bash
   # Enable authentication
   sudo systemctl enable mongod
   sudo systemctl start mongod
   
   # Create admin user
   mongosh
   use admin
   db.createUser({user: "admin", pwd: "password", roles: ["root"]})
   ```

## Frontend Deployment (Expo)

### 1. Configure EAS (Expo Application Services)

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Initialize EAS
cd frontend
eas build:configure
```

### 2. Configure app.json

```json
{
  "expo": {
    "name": "Skip On",
    "slug": "skip-on",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#667eea"
    },
    "assetBundlePatterns": [
      "**/*"
    ],
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.yourcompany.skipon"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#667eea"
      },
      "package": "com.yourcompany.skipon"
    },
    "extra": {
      "eas": {
        "projectId": "your-project-id"
      },
      "EXPO_PUBLIC_BACKEND_URL": "https://your-backend-domain.com"
    }
  }
}
```

### 3. Build for Stores

#### iOS Build
```bash
# Development build
eas build --platform ios --profile development

# Production build for App Store
eas build --platform ios --profile production
```

#### Android Build
```bash
# Development build
eas build --platform android --profile development

# Production build for Play Store
eas build --platform android --profile production
```

### 4. Submit to Stores

#### Apple App Store

1. **Prepare Assets**
   - App Icon (1024x1024 PNG)
   - Screenshots (5.5", 6.5" iPhone)
   - iPad screenshots (if supporting iPad)
   - App Preview video (optional)

2. **App Store Connect**
   - Create app listing
   - Fill in metadata
   - Add Privacy Policy URL
   - Set pricing (Free)
   - Choose age rating

3. **Submit via EAS**
   ```bash
   eas submit --platform ios
   ```

4. **Review Process**
   - Usually 1-3 days
   - Address any rejections
   - Common issues: privacy policy, content rating

#### Google Play Store

1. **Prepare Assets**
   - App Icon (512x512 PNG)
   - Feature Graphic (1024x500 PNG)
   - Screenshots (phone & tablet)
   - Short description (80 chars)
   - Full description (4000 chars)

2. **Play Console**
   - Create app listing
   - Fill in all required fields
   - Add Privacy Policy URL
   - Complete content rating questionnaire
   - Set up store listing

3. **Submit via EAS**
   ```bash
   eas submit --platform android
   ```

4. **Review Process**
   - Usually faster than iOS (hours to 1 day)
   - Must pass Play Protect checks

## Environment Variables Summary

### Backend
```env
# Required
MONGO_URL=mongodb+srv://...
DB_NAME=skip_on_db
SECRET_KEY=your-secret-key

# Optional but Recommended
REDIS_URL=redis://...
SENDGRID_API_KEY=...
SENTRY_DSN=...
```

### Frontend
```env
# Required
EXPO_PUBLIC_BACKEND_URL=https://api.skipon.com
```

## Post-Deployment

### 1. Monitoring Setup

**Backend Monitoring**
- Sentry for error tracking
- Uptime monitoring (UptimeRobot)
- Log aggregation (Papertrail)

**Analytics**
- Mixpanel or Amplitude for user analytics
- Google Analytics for Firebase
- Custom event tracking

### 2. Performance Optimization

**Backend**
- Enable MongoDB indexes
- Use connection pooling
- Cache frequent queries
- Monitor response times

**Mobile App**
- Optimize images
- Lazy load components
- Profile with React DevTools
- Monitor bundle size

### 3. Scaling Strategy

**Phase 1: 0-1000 users**
- Single backend instance
- MongoDB M0/M10 cluster
- No caching needed

**Phase 2: 1000-10,000 users**
- Load balancer
- 2-3 backend instances
- Redis for caching
- MongoDB M20 cluster
- CDN for static assets

**Phase 3: 10,000+ users**
- Auto-scaling
- Multiple regions
- MongoDB sharding
- Dedicated Redis cluster
- Advanced monitoring

## Testing in Production

### 1. Smoke Tests
```bash
# Health check
curl https://api.skipon.com/api/

# Login test
curl -X POST https://api.skipon.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

### 2. Socket.IO Test
- Use online Socket.IO test tool
- Connect to production URL
- Verify authentication
- Test event emission/reception

### 3. Mobile App Testing
- TestFlight (iOS) for beta testing
- Google Play Internal Testing
- Invite 10-50 beta testers
- Collect feedback before public launch

## Common Deployment Issues

### Issue 1: Socket.IO Connection Fails
**Solution:**
- Ensure WebSocket support on hosting platform
- Check CORS settings
- Verify SSL/TLS certificate
- Test with polling transport first

### Issue 2: MongoDB Connection Timeout
**Solution:**
- Whitelist backend IP in MongoDB Atlas
- Check connection string format
- Verify database name
- Test connection locally first

### Issue 3: Expo Build Fails
**Solution:**
- Check for TypeScript errors
- Verify all dependencies are installed
- Clear cache: `expo start -c`
- Update EAS CLI to latest version

### Issue 4: App Store Rejection
**Common Reasons:**
- Missing privacy policy
- Incomplete metadata
- Inappropriate content rating
- Technical issues (crashes)

**Solution:**
- Review rejection reason carefully
- Address all points mentioned
- Test thoroughly before resubmission
- Contact Apple support if unclear

## Maintenance Checklist

### Weekly
- [ ] Monitor error logs
- [ ] Check server uptime
- [ ] Review user reports
- [ ] Monitor active users

### Monthly
- [ ] Update dependencies
- [ ] Review database performance
- [ ] Check storage usage
- [ ] Update app screenshots if needed

### Quarterly
- [ ] Security audit
- [ ] Performance optimization
- [ ] User feedback analysis
- [ ] Feature roadmap review

## Rollback Procedure

### Backend Rollback
1. Deploy previous version tag
2. Verify database compatibility
3. Monitor for errors
4. Notify users if needed

### Frontend Rollback
1. Build previous version
2. Submit emergency update
3. Use Over-the-Air (OTA) updates if available
4. Communicate with users

## Support Resources

- **Expo Documentation:** docs.expo.dev
- **FastAPI Documentation:** fastapi.tiangolo.com
- **MongoDB Documentation:** docs.mongodb.com
- **App Store Guidelines:** developer.apple.com
- **Play Store Guidelines:** play.google.com/console

## Emergency Contacts

- Backend Hosting Support: [Provider support]
- MongoDB Support: support.mongodb.com
- Expo Support: expo.dev/contact
- App Store Support: developer.apple.com/contact
- Play Store Support: support.google.com/googleplay

---

**Document Version:** 1.0
**Last Updated:** 2025
**Status:** Production Ready
