This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## AI Queue Reordering (DDQN)

This app can reorder ward queues with the trained PyTorch model at:

- `model/fair_ddqn_improved.pth`

At runtime, server actions call:

- `scripts/queue_reorder_infer.py`

The script loads `model/mixed_priority_81actions.pth`, decodes the chosen DDQN action into the mixed-priority weight set, and returns a model-guided queue order based on live ward occupancy and queue data. If Python/Torch is unavailable, the app safely falls back to priority ordering.

### Database reset

To rebuild the MongoDB collections with model-compatible sample data:

```bash
npm run db:reset
```

This clears `wards`, `beds`, and `patients`, then seeds them again with ward, bed, and patient records that include priority, age, gender, admission time, and queue wait time.

### Python setup

Install Python packages in your environment:

```bash
pip install torch numpy
```

The app tries `python` first, then `py -3` on Windows.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
