# MongoDB Setup Checklist

Complete these steps in order. Estimated time: **15-20 minutes**

---

## ✅ PHASE 1: Prepare (5 mins)

### Prerequisites

- [ ] Node.js is installed (`node --version` in terminal)
- [ ] npm is working (`npm --version` in terminal)
- [ ] Project is open in VS Code

### Files Created

- [ ] Verified `lib/mongodb.ts` exists
- [ ] Verified `.env.local` exists
- [ ] Verified `app/api/` folder with all endpoints
- [ ] Verified `scripts/seedDatabase.ts` exists

---

## ✅ PHASE 2: MongoDB Setup (5 mins)

### Choose Your Option

**OPTION A: MongoDB Atlas (Cloud - Recommended)**

- [ ] Go to https://www.mongodb.com/cloud/atlas
- [ ] Create/Login to account
- [ ] Create new project
- [ ] Click "Build a Database"
- [ ] Select free tier (M0)
- [ ] Click "Create" and wait for deployment
- [ ] Go to "Database Access"
  - [ ] Click "Add new database user"
  - [ ] Username: `hospital_user` (or your choice)
  - [ ] Password: Generate strong password (save it!)
  - [ ] Click "Add User"
- [ ] Go to "Network Access"
  - [ ] Click "Add IP Address"
  - [ ] For development: Click "Allow access from anywhere" (0.0.0.0)
  - [ ] Click "Confirm"
- [ ] Click "Clusters" → "Connect"
- [ ] Select "Connect your application"
- [ ] Copy connection string (looks like):
  ```
  mongodb+srv://username:password@cluster0.mongodb.net/hospital_management?retryWrites=true&w=majority
  ```

**OPTION B: MongoDB Local**

- [ ] Download: https://www.mongodb.com/try/download/community
- [ ] Install MongoDB Community Edition
- [ ] Start MongoDB service
- [ ] Connection string: `mongodb://localhost:27017/hospital_management`

---

## ✅ PHASE 3: Configure Environment (2 mins)

### Edit `.env.local`

- [ ] Open `.env.local` in VS Code
- [ ] Replace placeholder connection string
- [ ] If using Atlas:
  ```env
  MONGODB_URI=mongodb+srv://YOUR_USERNAME:YOUR_PASSWORD@cluster0.mongodb.net/hospital_management?retryWrites=true&w=majority
  ```
- [ ] If using local:
  ```env
  MONGODB_URI=mongodb://localhost:27017/hospital_management
  ```
- [ ] Save file (Ctrl+S)
- [ ] **Do NOT commit this file** (it's in .gitignore ✓)

---

## ✅ PHASE 4: Install Tools (2 mins)

### Optional - For Seed Script

```bash
npm install -D ts-node
```

- [ ] Run above command if you want to use seed script
- [ ] Wait for installation to complete

---

## ✅ PHASE 5: Populate Database (3 mins)

### Create Initial Data

**Option A: Using Seed Script (Recommended)**

```bash
npx ts-node scripts/seedDatabase.ts
```

- [ ] Run above command in terminal
- [ ] Wait for output: "Database seeded successfully!"
- [ ] You'll see in console:
  - Connected to MongoDB
  - Cleared existing collections
  - Inserted wards
  - Inserted patients
  - Inserted beds

**Option B: Manual (Skip if using seed script)**

- [ ] Use MongoDB Atlas GUI to create data manually
- [ ] Or use API endpoints to create data

---

## ✅ PHASE 6: Start Application (2 mins)

### Run Development Server

```bash
npm run dev
```

- [ ] Run above command
- [ ] Wait for:
  ```
  ✓ Compiled successfully
  Connected to MongoDB Successfully
  ```
- [ ] Open browser: http://localhost:3000
- [ ] You should see the dashboard

---

## ✅ PHASE 7: Test Connection (3 mins)

### Test in Browser Console

**Open DevTools:**

- [ ] Press `F12` (Chrome, Firefox, Edge)
- [ ] Click "Console" tab

**Test Wards:**

```javascript
fetch("/api/wards")
  .then((r) => r.json())
  .then((d) => console.log(d));
```

- [ ] You should see array of wards

**Test Patients:**

```javascript
fetch("/api/patients")
  .then((r) => r.json())
  .then((d) => console.log(d));
```

- [ ] You should see array of patients

**Test Beds:**

```javascript
fetch("/api/beds")
  .then((r) => r.json())
  .then((d) => console.log(d));
```

- [ ] You should see array of beds

---

## ✅ PHASE 8: Verify Setup (2 mins)

### Visual Verification

In dashboard, verify:

- [ ] Four wards displayed (Ward A, B, C, D)
- [ ] Each ward shows:
  - [ ] Available beds count
  - [ ] Occupied beds count
  - [ ] Maintenance count
  - [ ] Queue count
- [ ] Patient queue shows in each ward card
- [ ] Clicking ward shows bed grid
- [ ] Clicking occupied bed shows patient details

### Console Logs

- [ ] No red errors in console (F12 → Console)
- [ ] "Connected to MongoDB Successfully" appears on load
- [ ] API responses are JSON objects

---

## 🎉 SUCCESS!

If you've completed all checkboxes, you're done!

**What's working:**
✅ MongoDB connected
✅ Data persisted in database
✅ API routes functional
✅ Dashboard showing real data
✅ Can view patient details

---

## 🚀 Next: Integrate Frontend

Now that database is connected, next step is to update React components to use the API:

```javascript
// Example: Fetch data in useEffect
useEffect(() => {
  const loadData = async () => {
    const wards = await fetchWards();
    setWards(wards);
  };
  loadData();
}, []);
```

📖 See **QUICK_START.md** for guidance on integrating frontend.

---

## ⚠️ Troubleshooting

### Issue: "MONGODB_URI is missing"

**Solution:**

- [ ] Check `.env.local` exists in root folder
- [ ] Check file contains `MONGODB_URI=...`
- [ ] Stop and restart dev server

### Issue: Connection timeout

**Solution:**

- [ ] If using Atlas: Add IP to Network Access
- [ ] If local: Ensure MongoDB is running
- [ ] Check connection string is correct

### Issue: "Authentication failed"

**Solution:**

- [ ] Verify username in connection string
- [ ] Verify password in connection string
- [ ] Special characters must be URL encoded
- [ ] Re-generate user if unsure

### Issue: Empty collections after seed

**Solution:**

- [ ] Run seed script: `npx ts-node scripts/seedDatabase.ts`
- [ ] Check script output for errors
- [ ] Verify database connection first

### Issue: Port 3000 already in use

**Solution:**

- [ ] Use different port: `npm run dev -- -p 3001`
- [ ] Or kill process on 3000

---

## 📚 Documentation Reference

| Document             | When to read                |
| -------------------- | --------------------------- |
| **QUICK_START.md**   | Getting started (just now!) |
| **MONGODB_SETUP.md** | Detailed configuration help |
| **ARCHITECTURE.md**  | Understanding system design |

---

## 💾 What Was Created

### Backend Infrastructure

- ✅ `lib/mongodb.ts` - Connection pooling
- ✅ `app/api/wards/route.ts` - Ward endpoints
- ✅ `app/api/patients/route.ts` - Patient endpoints
- ✅ `app/api/patients/[id]/route.ts` - Individual patient
- ✅ `app/api/beds/route.ts` - Bed endpoints

### Frontend Utilities

- ✅ `app/utils/api.ts` - API helper functions

### Data & Scripts

- ✅ `scripts/seedDatabase.ts` - Initialize database
- ✅ `.env.local` - Configuration

### Documentation

- ✅ `MONGODB_SETUP.md` - Detailed guide
- ✅ `QUICK_START.md` - Quick reference
- ✅ `ARCHITECTURE.md` - System design

---

## ✨ Tips for Success

1. **Read Error Messages** - They tell you what's wrong
2. **Check Logs** - Browser console (F12) shows API responses/errors
3. **Be Patient** - MongoDB Atlas can take 2-3 mins to initialize
4. **Verify Step by Step** - Don't skip verification steps
5. **Save Files** - Always save with Ctrl+S
6. **Restart Dev Server** - After .env.local changes, restart `npm run dev`

---

## ✅ Final Verification

Before moving to next phase:

- [ ] `.env.local` has correct MongoDB URI
- [ ] Database seeded successfully
- [ ] `npm run dev` shows "Connected to MongoDB Successfully"
- [ ] Wards visible in dashboard
- [ ] API endpoints respond with data
- [ ] No red errors in console
- [ ] Patient details show when clicking beds

---

## 🎯 You're Ready!

All MongoDB setup complete. You now have:

✅ Database connected
✅ Automated data initialization
✅ RESTful API working
✅ Real data in dashboard

**Next step:** Integrate more features or add authentication!

---

**Questions?** Check the documentation files or browser console for error messages.

Good luck! 🚀
