# Hospital Management System

A web-based hospital operations platform for managing wards, beds, patients, staff, and admission queues. The application gives hospital staff one dashboard for monitoring bed capacity, handling patient movement, and coordinating ward operations.

The project is built with Next.js and TypeScript. MongoDB stores operational data, while an optional PyTorch-based AI service helps reorder patient queues using ward occupancy and patient information. When AI inference is unavailable, the application falls back to priority-based ordering so normal queue management can continue.

## Main Capabilities

- Dashboard with ward capacity, occupancy, and operational alerts
- Patient registration, search, admission, discharge, and patient details
- Ward and bed management, including bed status and assignment
- Patient queues with AI-assisted or priority-based reordering
- Staff, user, role, and permission administration
- Notifications, audit logs, reports, and password management
- Explainable AI and predictive queue analytics
- MongoDB seed data and database index scripts for development
- Optional MLOps workflow for collecting data, training, evaluating, deploying, and monitoring models

## Technology Stack

- **Frontend and backend:** Next.js App Router, React, TypeScript
- **Styling and UI:** Tailwind CSS, Lucide React, Recharts
- **Database:** MongoDB or Azure Cosmos DB for MongoDB
- **Authentication:** Session/JWT-based authentication with role-based access control
- **AI:** Python, PyTorch, NumPy, and an optional FastAPI inference service
- **Deployment:** Next.js-compatible hosting such as Vercel, plus Render or another Python host for the inference service

## Requirements

- Node.js 20 or newer
- npm
- MongoDB or Azure Cosmos DB for MongoDB
- Python 3.10 or newer for local AI inference or MLOps tasks
- A Python environment with PyTorch and NumPy when using the local queue model

## Local Setup

### 1. Install JavaScript dependencies

```bash
npm install
```

### 2. Configure environment variables

Create `.env.local` in the project root. Do not commit this file or place real credentials in documentation.

```env
MONGODB_URI=mongodb://localhost:27017/hospital-management
MONGODB_DB=hospital-management
JWT_SECRET=replace-with-a-long-random-secret

# Optional email configuration for notifications and password flows
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-user
SMTP_PASS=your-password
SMTP_FROM_NAME=Hospital Management System

# Optional remote AI service. Leave unset to use local inference/fallback behavior.
QUEUE_AI_ENDPOINT=http://localhost:8000

# Optional local explainability/prediction settings
XAI_USE_LOCAL=true
```

For production, set these values in the hosting provider's environment configuration. Never reuse development credentials in production.

### 3. Initialize the database

Reset and seed the development collections with sample wards, beds, and patients:

```bash
npm run db:reset
```

Create the recommended indexes:

```bash
npm run db:indexes
```

The reset script replaces existing `wards`, `beds`, and `patients` data. Do not run it against a production database.

### 4. Start the application

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## AI Queue Reordering

The application supports two AI deployment modes:

1. **Remote inference service:** Set `QUEUE_AI_ENDPOINT` to the URL of the FastAPI service in `inference-service/`.
2. **Local inference:** Leave `QUEUE_AI_ENDPOINT` unset and install the required Python packages. The Next.js server can invoke the local inference script on the development machine.

The queue workflow uses the AI result when available and falls back to deterministic priority ordering if the model, Python runtime, or remote service is unavailable.

To install the basic local inference dependencies:

```bash
pip install torch numpy
```

See [inference-service/README.md](inference-service/README.md) for FastAPI deployment and API details.

## Useful Commands

```bash
npm run dev              # Start the development server
npm run build            # Create a production build
npm run start            # Run the production build
npm run lint             # Run ESLint
npm run format           # Format the repository
npm run format:check     # Check formatting

npm run db:reset         # Replace development data with seed data
npm run db:indexes       # Create MongoDB indexes
npm run db:seed-admin    # Seed an administrator account
npm run db:user-reset    # Reset the primary user
```

## MLOps Workflow

The `mlops/` directory contains the model lifecycle tooling:

```bash
npm run mlops:setup       # Install MLOps dependencies and create configuration
npm run mlops:collect     # Collect historical data
npm run mlops:train       # Train a model
npm run mlops:evaluate    # Evaluate a model
npm run mlops:list-versions
npm run mlops:activate    # Activate a model version
npm run mlops:monitor     # Review inference monitoring data
```

Read [mlops/README.md](mlops/README.md) before running training or deployment commands. Model training can create large files and should be performed in a controlled environment.

## Project Structure

```text
app/
  actions/                 Server actions for patients, wards, staff, users, and logs
  admin/                   Administrative screens
  api/                     HTTP API routes for beds, patients, wards, and health checks
  components/              Application UI components
  patients/                Patient workflows and views
  reports/                 Reporting screens
  wards/                   Ward management screens
components/ui/             Shared UI primitives
lib/                       Database, authentication, RBAC, AI, email, and utility code
inference-service/         Optional FastAPI AI inference service
mlops/                     Data collection, training, evaluation, deployment, and monitoring
model/                     Local model files used by the application
scripts/                   Database setup and utility scripts
xai/                       Explainability and predictive analytics code
```

## API Areas

The Next.js API routes provide backend access for:

- `/api/wards` - ward records and capacity information
- `/api/patients` - patient records and ward filtering
- `/api/beds` - bed availability and occupancy
- `/api/health` - application/service health checks
- `/api/explain` - explainability requests

Authentication and authorization are enforced through the application session and RBAC utilities. Keep validation and authorization in place when adding new routes or server actions.

## Development Notes

- Use seeded data only for development and demonstrations.
- Keep secrets in environment variables and rotate any credential that may have been exposed.
- Run `npm run lint` and `npm run build` before creating a deployment.
- Keep model files and generated MLOps data out of source control unless they are intentionally required for deployment.

## Related Documentation

- [Architecture overview](ARCHITECTURE.md)
- [AI inference service](inference-service/README.md)
- [MLOps documentation](mlops/README.md)
