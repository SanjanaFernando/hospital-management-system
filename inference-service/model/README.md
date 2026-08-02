# Model Directory

Place **`best_mappo_shared_predictive.pth`** here before deploying.

## How to add the model file

Copy it from the main project:

```bash
# Run from the project root  (hospital-management/)
cp model/best_mappo_shared_predictive.pth inference-service/model/
```

Then commit and push — the file is only ~430 KB so it's fine in git:

```bash
git add inference-service/model/best_mappo_shared_predictive.pth
git commit -m "Add inference model for Render deployment"
git push
```

> **Why commit the model?**  
> Render's free tier does not provide persistent disk storage by default.
> Bundling the model in the repo is the simplest approach for a file this small.
> If you later upgrade to a larger model, use Render's Disk or store it in
> an S3-compatible bucket and download it at build time.
