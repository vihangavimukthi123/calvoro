# Calvoro storage (public files)

All uploaded banners, product images, and videos should be stored under:

- `app/public/banners/`
- `app/public/products/`
- `app/public/categories/`
- `app/public/videos/`

## Public URL

The server serves these files at **`/storage/...`** (e.g. `https://yourdomain.com/storage/banners/image.jpg`).

No symlink is required: Express mounts `storage/app/public` at `/storage`. Keep using **relative paths** in the database (e.g. `/storage/banners/xyz.jpg`) so the same URLs work in development and production.

## Optional: symlink (storage:link)

If you prefer a symlink (e.g. for a separate static file server), run from the `backend` folder:

**Windows (cmd as Administrator):**
```cmd
mklink /D public\storage ..\storage\app\public
```

**Windows (PowerShell as Administrator):**
```powershell
New-Item -ItemType SymbolicLink -Path "public\storage" -Target "..\storage\app\public"
```

**Linux / macOS:**
```bash
ln -s ../storage/app/public public/storage
```

Then serve `public` as static; URLs would be `/storage/...`.

## Security

- Validate file type and size on upload (e.g. only jpg, png, webp, mp4).
- Use unique filenames (e.g. UUID + extension) to avoid overwrites.
