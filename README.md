# GINGR - Social App Project

Welcome! This guide will help you set up and run the project.

## 🚀 Quick Start

**New to this project?** Start here:
1. Read **[SETUP_GUIDE.md](./SETUP_GUIDE.md)** - Complete setup instructions
2. Or check **[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)** - Quick command reference

## 📋 What You Need

- **Node.js** (v18+)
- **Python** (v3.8+)
- **Redis** (for caching)
- **MongoDB** (database)

## 🏃 Running the Project

You need **5 terminals** running:

1. **Redis** - `redis-server`
2. **Backend (3001)** - `cd backend && python3 -m uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload`
3. **Backend (3003)** - `cd backend && python3 -m uvicorn server:socket_app --host 0.0.0.0 --port 3003 --reload`
4. **Engage Server** - `cd backend && node engage-server.js`
5. **Frontend** - `cd frontend && npm start`

See **[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)** for all commands.

## 📚 Documentation

- **[SETUP_GUIDE.md](./SETUP_GUIDE.md)** - Complete setup guide
- **[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)** - Quick command reference
- **[APPLE_SIGNIN_SETUP.md](./APPLE_SIGNIN_SETUP.md)** - Apple Sign-In configuration
- **[FIREBASE_SETUP_GUIDE.md](./FIREBASE_SETUP_GUIDE.md)** - Firebase setup

## 🆘 Need Help?

1. Check the setup guide: [SETUP_GUIDE.md](./SETUP_GUIDE.md)
2. Check terminal/console for error messages
3. Verify all prerequisites are installed
4. Make sure all ports are available

---

**Happy coding! 🎉**
# appwebsocket
