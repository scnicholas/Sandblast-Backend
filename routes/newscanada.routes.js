const express = require("express");
const router = express.Router();

const manualService = require("./newscanada.manual.service");
const rssService = require("./newscanada.rss.service");

// ==========================
// MANUAL ROUTES
// ==========================

router.get("/manual", (req, res) => {
  try {
    const data = manualService.getSlots();
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/manual/save", (req, res) => {
  try {
    const result = manualService.saveSlot(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/manual/clear", (req, res) => {
  try {
    const result = manualService.clearSlot(req.body.slotId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================
// RSS ROUTE
// ==========================

router.get("/rss", async (req, res) => {
  try {
    const result = await rssService.fetchRSS();
    res.json(result);
  } catch (err) {
    console.error("[RSS ERROR]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

<<<<<<< HEAD
module.exports = router;
=======
module.exports = router;
>>>>>>> 078f7f11 (Add News Canada RSS service and rss-parser)
