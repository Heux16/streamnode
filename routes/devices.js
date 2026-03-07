import express from "express";
import find from "../discovery/scan.js";
import { advertiseStatus, startAdvertise, stopAdvertise } from "../discovery/advertise.js";

const router = express.Router();

router.get("/", (req, res) => {
  try {
    const result = find();
   
    res.json({ ...result, ...advertiseStatus() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Cannot read devices" });
  }
});

router.post("/advertise/on", (req, res) => {
  try {
    const { name, type, port, txt } = req.body ?? {};
    const result = startAdvertise({ name, type, port, txt });
    res.json({ ok: true, ...find(), ...result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Cannot start advertise" });
  }
});

router.post("/advertise/off", (req, res) => {
  try {
    const result = stopAdvertise();
    res.json({ ok: true, ...find(), ...result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Cannot stop advertise" });
  }
});

export default router;