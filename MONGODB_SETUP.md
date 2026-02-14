# MongoDB Integration Setup Guide

## Overview

This guide walks you through setting up MongoDB for your Hospital Management System.

---

## Prerequisites

- Node.js installed locally
- MongoDB Account (Atlas or local MongoDB)
- npm/yarn package manager

---

## Step-by-Step Setup

### 1. **Get MongoDB Connection String**

#### Option A: MongoDB Atlas (Cloud - Recommended)

```bash
1. Go to https://www.mongodb.com/cloud/atlas
2. Create a free account or login
3. Create a new project
4. Click "Build a Cluster" and choose the free tier
5. Configure cluster (M0 - Free tier is sufficient)
6. Go to "Database Access" → Create Database User
   - Username: your-username
   - Password: your-secure-password
   - Save these credentials
7. Go to "Network Access" → Add IP Address
   - Click "Allow Access from Anywhere" (for development)
8. Go to "Clusters" → Click "Connect"
9. Choose "Connect your application"
10. Copy the connection string
    Replace:
    - <username> with your database user
    - <password> with your password
    Example: mongodb+srv://user:password@cluster0.mongodb.net/hospital_management?retryWrites=true&w=majority
```

#### Option B: Local MongoDB

```bash
1. Download MongoDB Community Edition: https://www.mongodb.com/try/download/community
2. Install and run MongoDB
3. Connection string: mongodb://localhost:27017/hospital_management
```

---

### 2. **Update .env.local File**

Open `.env.local` in your project root:

```
MONGODB_URI=mongodb+srv://username:password@cluster0.mongodb.net/hospital_management?retryWrites=true&w=majority
```

Replace:

- `username` - Your MongoDB user
- `password` - Your MongoDB password
- `cluster0` - Your cluster name

---

### 3. **Verify Dependencies**

Check `package.json` has MongoDB installed:

```bash
npm list mongodb
# Should show: mongodb@^7.1.0 or similar
```

If not installed, run:

```bash
npm install mongodb
```

---

### 4. **Database Structure**

MongoDB will automatically store data in these collections:

**wards**

```json
{
  "_id": "ward-0",
  "name": "Ward A - General Medicine",
  "totalBeds": 25,
  "createdAt": "2024-02-14T...",
  "updatedAt": "2024-02-14T..."
}
```

**patients**

```json
{
  "_id": ObjectId("..."),
  "name": "John Smith",
  "age": 45,
  "ageGroup": "Adult",
  "disease": "Hypertension",
  "priority": "Urgent",
  "wardId": "ward-0",
  "status": "admitted", // or "queued"
  "admissionTime": "2024-02-14T...",
  "dischargeTime": null,
  "queueWaitTime": 45,
  "specialRequirements": ["Oxygen Support"],
  "createdAt": "2024-02-14T...",
  "updatedAt": "2024-02-14T..."
}
```

**beds**

```json
{
  "_id": "0-0",
  "wardId": "ward-0",
  "bedNumber": 1,
  "status": "occupied", // or "available", "maintenance"
  "patientId": "patient-id",
  "createdAt": "2024-02-14T...",
  "updatedAt": "2024-02-14T..."
}
```

---

### 5. **Seed Initial Data (Optional)**

To populate the database with initial mock data:

#### Install ts-node (if not already installed):

```bash
npm install -D ts-node @types/node
```

#### Run the seed script:

```bash
npx ts-node scripts/seedDatabase.ts
```

Or add to `package.json` scripts:

```json
"scripts": {
  "seed": "ts-node scripts/seedDatabase.ts"
}
```

Then run:

```bash
npm run seed
```

---

### 6. **Test Connection**

Start your development server:

```bash
npm run dev
```

You should see in console:

```
Connected to MongoDB Successfully
```

---

## API Endpoints

### Wards

- **GET** `/api/wards` - Fetch all wards
- **POST** `/api/wards` - Create a new ward

### Patients

- **GET** `/api/patients` - Fetch all patients
- **GET** `/api/patients?wardId=ward-0` - Fetch patients by ward
- **POST** `/api/patients` - Create a new patient
- **PUT** `/api/patients/{id}` - Update patient
- **DELETE** `/api/patients/{id}` - Delete patient

### Beds

- **GET** `/api/beds` - Fetch all beds
- **GET** `/api/beds?wardId=ward-0` - Fetch beds by ward
- **POST** `/api/beds` - Create a new bed

---

## Example API Usage

### Fetch All Wards

```javascript
const wards = await fetch("/api/wards");
const data = await wards.json();
console.log(data);
```

### Create Patient

```javascript
const response = await fetch("/api/patients", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "Jane Doe",
    age: 35,
    ageGroup: "Adult",
    disease: "Diabetes",
    priority: "Non-urgent",
    wardId: "ward-0",
    admissionTime: new Date(),
    specialRequirements: ["Dietary Management"],
  }),
});
const result = await response.json();
```

### Update Patient (Assign Bed)

```javascript
const response = await fetch("/api/patients/{patientId}", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    status: "admitted",
    bedId: "bed-123",
  }),
});
```

---

## Using API Service (Frontend)

The `app/utils/api.ts` file provides helper functions:

```javascript
import { fetchWards, createPatient, updatePatient } from "@/app/utils/api";

// Fetch all wards
const wards = await fetchWards();

// Create new patient
const newPatient = await createPatient({
  name: "John Doe",
  age: 50,
  // ... other fields
});

// Update patient
await updatePatient(patientId, { status: "discharged" });
```

---

## File Structure

```
hospital-management/
├── lib/
│   └── mongodb.ts            # MongoDB connection
├── app/
│   ├── api/
│   │   ├── wards/
│   │   │   └── route.ts       # Ward endpoints
│   │   ├── patients/
│   │   │   ├── route.ts       # Patient endpoints
│   │   │   └── [id]/route.ts  # Patient by ID
│   │   └── beds/
│   │       └── route.ts       # Bed endpoints
│   └── utils/
│       └── api.ts            # Frontend API service
├── scripts/
│   └── seedDatabase.ts        # Data initialization
├── .env.local                 # Environment config
└── package.json
```

---

## Troubleshooting

### Connection Error: "Invalid/Missing environment variable"

- Check `.env.local` file exists in project root
- Verify `MONGODB_URI` is set correctly
- Don't commit `.env.local` to Git - add to `.gitignore`

### IP Address Not Whitelisted (Atlas)

- Go to MongoDB Atlas → Network Access
- Add your current IP or 0.0.0.0 (allow all for development)

### Authentication Failed

- Verify username and password in connection string
- Ensure special characters are URL-encoded
- Check user has database access permissions

### Database Already Exists

- Can safely run seed script multiple times - it clears old data first

### Port Already in Use

- MongoDB: Change port in connection string
- Next.js: Run `lsof -i :3000` to find process, then kill it

---

## Next Steps

1. ✅ Setup MongoDB connection
2. ✅ Create database and collections
3. ✅ Populate with seed data
4. ✅ Test API endpoints
5. 📝 Update frontend components to fetch from API instead of mock data
6. 📝 Add features: search, filters, exports
7. 📝 Add user authentication
8. 📝 Deploy to production

---

## Security Best Practices

For Production:

- ✅ Use strong, unique passwords
- ✅ Restrict IP access in Atlas (don't use 0.0.0.0)
- ✅ Enable IP whitelist
- ✅ Use environment variables for all credentials
- ✅ Never commit `.env.local` or credentials
- ✅ Enable MongoDB authentication
- ✅ Use connection pooling
- ✅ Backup data regularly

---

For questions or issues, check:

- MongoDB Docs: https://docs.mongodb.com/
- Next.js API Routes: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
