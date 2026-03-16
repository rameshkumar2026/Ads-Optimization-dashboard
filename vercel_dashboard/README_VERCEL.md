## Host this dashboard on Vercel (static)

This folder (`vercel_dashboard/`) is a **static website** version of the Ads Optimization Dashboard.
It runs fully in the browser (CSV upload → metrics → rules → charts), so it’s easy to host on Vercel.

### What you’ll deploy

- `vercel_dashboard/index.html`
- `vercel_dashboard/styles.css`
- `vercel_dashboard/app.js`

### Step-by-step (simple)

1. **Push your code to GitHub**
   - Open GitHub Desktop
   - Commit your changes
   - Push to GitHub

2. **Deploy in Vercel**
   - Go to Vercel and log in
   - Click **Add New → Project**
   - Import your GitHub repository
   - In the Vercel setup screen:
     - **Framework Preset**: `Other`
     - **Root Directory**: `vercel_dashboard`
     - **Build Command**: leave empty
     - **Output Directory**: leave empty
   - Click **Deploy**

3. **Share the URL**
   - Vercel will give you a URL like `https://your-project.vercel.app`
   - That’s the dashboard link you share.

### Using the dashboard

- Click **Choose CSV** and upload your Google Ads keyword performance CSV.
- The dashboard computes CTR, Conversion Rate, CPA, applies optimization rules, and shows charts + tables.

### Notes

- Your CSV is processed **in the browser**.
- No Python backend is used on Vercel.

