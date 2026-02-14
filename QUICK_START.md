# MongoDB Integration - Quick Start Guide

## ✅ What Has Been Set Up

### 1. **File Structure Created**

```
hospital-management/
├── lib/mongodb.ts                 ← MongoDB connection manager
├── app/api/
│   ├── wards/route.ts            ← Ward API endpoints
│   ├── patients/route.ts          ← Patient API endpoints
│   ├── patients/[id]/route.ts     ← Patient update/delete
│   └── beds/route.ts             ← Bed API endpoints
├── scripts/seedDatabase.ts        ← Data initialization script
├── .env.local                     ← Environment config (UPDATE THIS!)
└── MONGODB_SETUP.md              ← Full detailed guide
```

### 2. **API Endpoints Created**

- `GET/POST /api/wards` - Manage wards
- `GET/POST /api/patients` - Manage patients
- `PUT/DELETE /api/patients/[id]` - Patient details
- `GET/POST /api/beds` - Manage beds

### 3. **API Service Helper**

- `app/utils/api.ts` - Ready-to-use frontend functions

---

## 🚀 Quick Start (5 Steps)

### Step 1️⃣: Get MongoDB Connection String

**Choose your option:**

**A) Cloud MongoDB (Easiest for Beginners)**

```
1. Go to: https://www.mongodb.com/cloud/atlas
2. Sign up (free)
3. Create a cluster (free M0 tier)
4. Create a database user
5. Add IP address to whitelist
6. Click "Connect" → Copy connection string
```

**B) Local MongoDB**

```
Download: https://www.mongodb.com/try/download/community
Use: mongodb://localhost:27017/hospital_management
```

### Step 2️⃣: Update `.env.local`

Edit the file `.env.local` in your project root:

```env
MONGODB_URI=mongodb+srv://YOUR_USERNAME:YOUR_PASSWORD@cluster0.mongodb.net/hospital_management?retryWrites=true&w=majority
```

Replace:

- `YOUR_USERNAME` - Your MongoDB username
- `YOUR_PASSWORD` - Your MongoDB password
- `cluster0` - Your cluster name (if different)

### Step 3️⃣: Install Dependencies (Optional)

```bash
# MongoDB is already installed, but if you need seeding tool:
npm install -D ts-node
```

### Step 4️⃣: Populate Database with Sample Data

```bash
# Run the seeding script
npx ts-node scripts/seedDatabase.ts
```

Expected output:

```
Connecting to MongoDB...
Clearing existing collections...
Inserted ward: Ward A - General Medicine
Inserted 18 admitted patients
Inserted 4 queued patients
...
Database seeded successfully!
```

### Step 5️⃣: Start Your App

```bash
npm run dev
```

Check console for:

```
✓ Compiled successfully
Connected to MongoDB Successfully
```

---

## 🧪 Test the Connection

### Using Browser Developer Tools

**1. Open DevTools (F12)**

**2. Go to Console tab**

**3. Test API calls:**

```javascript
// Fetch all wards
fetch("/api/wards")
  .then((r) => r.json())
  .then((d) => console.log(d));

// Fetch patients from Ward A
fetch("/api/patients?wardId=ward-0")
  .then((r) => r.json())
  .then((d) => console.log(d));

// Fetch all beds
fetch("/api/beds")
  .then((r) => r.json())
  .then((d) => console.log(d));
```

### Using Thunder Client / Postman

```
GET http://localhost:3000/api/wards
GET http://localhost:3000/api/patients
GET http://localhost:3000/api/beds
```

---

## 📝 Common Tasks

### Create a New Patient

```javascript
const newPatient = await fetch("/api/patients", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "Ahmed Ali",
    age: 55,
    ageGroup: "Elderly",
    disease: "Heart Disease",
    priority: "Critical",
    wardId: "ward-0",
    admissionTime: new Date(),
    specialRequirements: ["Cardiac Monitoring"],
  }),
});
const result = await newPatient.json();
console.log(result);
```

### Update a Patient (Discharge)

```javascript
const patientId = "PATIENT_ID_HERE";
const updated = await fetch(`/api/patients/${patientId}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    status: "discharged",
    dischargeTime: new Date(),
  }),
});
const result = await updated.json();
console.log(result);
```

### Delete a Patient

```javascript
const patientId = "PATIENT_ID_HERE";
const deleted = await fetch(`/api/patients/${patientId}`, {
  method: "DELETE",
});
const result = await deleted.json();
console.log(result);
```

---

## ❓ Troubleshooting

| Problem                                | Solution                                                            |
| -------------------------------------- | ------------------------------------------------------------------- |
| "Invalid/Missing environment variable" | Check `.env.local` exists with `MONGODB_URI`                        |
| Connection timeout                     | Add IP to MongoDB Atlas Network Access → Allow Access from Anywhere |
| "401 Unauthorized"                     | Check username/password in connection string                        |
| Port 3000 already in use               | Use `npm run dev -- -p 3001`                                        |
| Seed script fails                      | Ensure MongoDB connection works first                               |
| API returns empty                      | Run seed script to populate database                                |

---

## 📚 File Reference

**Database Connection:**

- `lib/mongodb.ts` - Connects to MongoDB with connection pooling

**API Routes:**

- `app/api/wards/route.ts` - GET/POST wards
- `app/api/patients/route.ts` - GET/POST patients (all or by ward)
- `app/api/patients/[id]/route.ts` - PUT/DELETE specific patient
- `app/api/beds/route.ts` - GET/POST beds

**Frontend Service:**

- `app/utils/api.ts` - Helper functions for API calls
  - `fetchWards()` - Get all wards
  - `createPatient(data)` - Add new patient
  - `updatePatient(id, data)` - Update patient
  - `deletePatient(id)` - Remove patient
  - `fetchBeds()` - Get all beds
  - etc.

**Scripts:**

- `scripts/seedDatabase.ts` - Populate database with mock data

---

## 🎯 Next Steps

After MongoDB is running:

1. ✅ **Verify** - Test APIs in browser console
2. 📝 **Update Frontend** - Integrate API calls into React components
3. 🔍 **Add Features**:
   - Search/filter patients
   - Discharge confirmation
   - Bed assignment form
   - Patient history/reports
4. 🔐 **Add Authentication** (later)
5. 🚀 **Deploy** to production

---

## 📞 Need Help?

1. Check `MONGODB_SETUP.md` for detailed guide
2. Review `app/utils/api.ts` for available functions
3. Check browser console for error messages
4. Verify `.env.local` file exists and is correct

---

Good luck! 🎉
