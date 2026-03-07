import express from "express";
import cors from "cors";
import filesRoute from "./routes/files.js";
import streamRoute from "./routes/stream.js";
import deviceRoute from "./routes/devices.js";

const app = express();

app.use(cors());
app.use(express.json());

// primary routes
app.use("/files", filesRoute);
app.use("/file", filesRoute);       // alias: GET /file/info?id=
app.use("/stream", streamRoute);
app.use("/devices", deviceRoute);
app.use("/device", deviceRoute);    // alias: GET /device

const PORT = 8000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});