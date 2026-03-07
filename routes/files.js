import express from "express";
import fs from "fs";
import path from "path";

const router = express.Router();

function extType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if ([".mp4", ".mkv", ".avi", ".mov", ".webm"].includes(ext)) return "video";
  if ([".mp3", ".flac", ".wav", ".aac", ".ogg"].includes(ext)) return "audio";
  if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"].includes(ext)) return "image";
  if ([".pdf"].includes(ext)) return "pdf";
  if ([".txt", ".md", ".json", ".csv"].includes(ext)) return "text";
  return "file";
}

router.get("/", (req, res) => {
  const folder = req.query.path || "./shared";

  try {
    const files = fs.readdirSync(folder);

    const result = files.map(file => {
      const fullPath = path.join(folder, file);
      const stats = fs.statSync(fullPath);

      return {
        name: file,
        path: fullPath,
        size: stats.size,
        isDirectory: stats.isDirectory(),
        mtime: stats.mtime,
        type: stats.isDirectory() ? "folder" : extType(file),
        ext: path.extname(file).toLowerCase()
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Cannot read folder" });
  }
});

router.get("/info", (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: "Missing id query param" });

  try {
    const stats = fs.statSync(id);
    const filename = path.basename(id);

    res.json({
      name: filename,
      size: stats.size,
      mtime: stats.mtime,
      isDirectory: stats.isDirectory(),
      type: stats.isDirectory() ? "folder" : extType(filename),
      ext: path.extname(filename).toLowerCase(),
      path: id
    });
  } catch (err) {
    res.status(404).json({ error: "File not found" });
  }
});

export default router;